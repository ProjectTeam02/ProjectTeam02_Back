# 카카오 모바일 OAuth 저장소 설정

`POST /api/v1/auth/kakao/start`, `GET /api/v1/auth/kakao/callback`, `POST /api/v1/auth/kakao/exchange`의 요청과 응답 형식은 기존과 같다. 레거시 `POST /api/v1/auth/kakao`는 개발·테스트에서만 별도 허용한다.

개발·테스트는 `KAKAO_OAUTH_STORE_MODE=memory` 또는 `postgres`를 선택할 수 있다. 운영에서는 `postgres`를 사용한다. 모드를 비워 두거나 운영에서 `memory`를 선택하면 모바일 OAuth는 503을 반환한다.

## 배포 순서

1. 배포 승인 후 마이그레이션 계정으로 `npm run db:migrate`를 실행한다. `KakaoOAuthEntries1794210000000`이 `app.kakao_oauth_entries`와 만료 인덱스를 생성한다. 런타임 `app_user`에는 기존 `app` 기본 권한 설정에 따라 SELECT, INSERT, UPDATE, DELETE가 부여되어야 한다. SELECT FOR UPDATE에는 UPDATE 권한도 필요하다.
2. 모든 API 인스턴스를 같은 PostgreSQL과 카카오 OAuth 설정에 연결한다. `NODE_ENV=production`, `KAKAO_OAUTH_STORE_MODE=postgres`를 설정한다. `KAKAO_REST_API_KEY`와 `KAKAO_CLIENT_SECRET`은 기존 비밀 설정 경로로 주입한다.
3. Kakao Developers Redirect URI와 서버의 `KAKAO_OAUTH_CALLBACK_URL` 및 `KAKAO_ALLOWED_REDIRECT_URIS`에 `https://lerenapp.com/api/v1/auth/kakao/callback`을 등록한다. Expo에서 `leren` 스킴과 `leren://auth/callback`을 확인하고 서버의 `KAKAO_APP_DEEP_LINK`와 `KAKAO_ALLOWED_APP_DEEP_LINKS`에 같은 주소를 넣는다.
4. 테스트 계정으로 HTTPS에서 start, 카카오 브라우저 인증, 앱 복귀, exchange 순으로 확인한다. 앱이 교환 응답에서 LEREN 세션 토큰을 받고 보호 API를 호출할 수 있는지 확인한다. 모드나 콜백 설정 변경 전에 시작한 흐름은 start부터 다시 진행한다.

마이그레이션 이전에 새 앱이 실행되면 해당 테이블을 사용하는 OAuth 요청은 마이그레이션 미적용 503을 반환한다. 롤백 시 API를 먼저 이전 버전으로 되돌린다. 이 마이그레이션의 down은 임시 OAuth 행만 담긴 테이블을 제거하므로, 대기 중인 로그인은 다시 시작해야 한다.

## 보관·만료·소비

- state와 loginCode의 키는 각각 SHA-256 해시로 저장된다. JSONB에는 시도 ID, challenge, 콜백·앱 복귀 주소, 교환 단계의 계정 식별 정보가 들어간다.
- 만료는 DB 시간을 기준으로 검사한다. 행 잠금 안에서 verifier와 시도 ID를 확인한 다음 행을 삭제한다. 불일치한 verifier는 행을 그대로 두며, 소비 성공 시 해당 행은 바로 제거된다.
- 만료 행은 저장 요청 중 최대 1,000개씩 정리한다. 일반적으로 프로세스당 1분 간격으로 실행하며, 한 배치를 가득 처리하면 다음 저장 요청에서 이어서 정리한다. 요청이 없는 동안에는 기존 DB 유지보수 작업에서 같은 만료 조건으로 배치 정리를 운영할 수 있다. 정리 여부와 관계없이 만료 행의 사용은 거부된다.
- 카카오 인증과 회원·세션 발급은 OAuth 행 잠금 밖에서 처리한다. 회원 준비나 세션 발급이 실패해도 이미 소비한 코드로 재시도할 수 없다. Refresh Token 회전은 별도 경로다.

격리 PostgreSQL 검증은 루트에서 `pwsh -File test/integration/run-kakao-postgres.ps1`로 실행한다. PostgreSQL 데이터와 Express 라우터를 실제로 사용하며 외부 카카오 응답만 모킹한다.
