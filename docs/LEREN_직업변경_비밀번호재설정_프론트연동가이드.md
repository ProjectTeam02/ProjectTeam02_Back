# Leren 직업 변경·비밀번호 재설정 프론트 연동 가이드

## 기존 직업 변경

Backend `develop` `ea9dd3c`와 `main` `fe32934`에 `classCode` 계약이 들어 있습니다. 이전 `classId` 전용 계약은 `ea95825`에서 변경됐습니다. 최초 선택은 `PATCH /api/v1/users/me/character-class`, 기존 직업 변경은 `PATCH /api/v1/users/me/character/class`입니다.

1. `GET /api/v1/users/me`로 현재 직업을 확인합니다. `data.characterClass`가 `null`이면 최초 선택 화면을 표시합니다.
2. `GET /api/v1/character-classes`에서 활성 직업의 `classCode`를 얻습니다. `WARRIOR`, `MAGE`, `ARCHER`를 지원합니다.
3. 기존 직업을 변경할 때 `PATCH /api/v1/users/me/character/class`에 `Authorization: Bearer <accessToken>` 및 `Content-Type: application/json`을 보냅니다.

```json
{"classCode":"MAGE"}
```

```json
{"success":true,"data":{"userId":"c337eb13-d119-45f2-8831-5371cc779c99","classId":"a1210470-89d2-4ee2-89fe-449670e6f273","classCode":"MAGE"}}
```

`userId`·`classId`는 UUID 문자열, `classCode`는 직업 코드 문자열입니다. `classId`는 응답과 서버 DB 관계에 사용합니다. 요청에는 `classCode`만 보냅니다.

| 상태 | 의미 |
| --- | --- |
| 200 | 변경 완료 또는 같은 직업의 현재 값 |
| 401 | Bearer 토큰이 없거나 유효하지 않음 |
| 404 | 유효한 코드에 활성 직업 데이터가 없음 |
| 409 | 기존 직업이 없으므로 최초 선택 필요 |
| 422 | 필드 누락·잘못된 코드·추가 필드 |
| 503 | DB를 사용할 수 없음 |

4. 성공 후 프로필을 다시 조회하고 `data.characterClass.classCode`를 확인합니다. 직업 변경에는 비용·쿨타임이 없으며 학습 이력, EXP·Gold, 보유·장착 코스튬이 유지됩니다.

Frontend `feat/add-features`의 `frontend/src/screens/auth/JobSelectionScreen.tsx`와 `frontend/src/services/jobApi.ts`는 위 계약을 사용합니다. 실제 앱 빌드가 이 경로를 사용하는지 확인하고, `EXPO_PUBLIC_API_URL`이 최신 백엔드의 origin을 가리키게 합니다. 현재 코드에서도 422를 받으면 Network 탭의 Method, URL, JSON 필드와 배포 이미지 SHA를 함께 확인합니다.

## 비밀번호 재설정

두 POST 경로 모두 Bearer 토큰 없이 호출합니다. `Content-Type: application/json`을 사용합니다. 오류 응답의 공통 형태는 `{"success":false,"message":"…","code":"…"}`입니다.

### 1. 이메일 입력과 접수 안내

`POST /api/v1/auth/password-reset/request`

```json
{"email":"learner@example.test"}
```

```json
{"success":true,"data":{"accepted":true}}
```

`email`은 이메일 형식의 문자열이며 최대 255자입니다. 입력은 정규화됩니다. `200 accepted`는 요청 접수입니다. 정상 로컬 계정, 미등록 주소, 카카오 전용 계정, 발송 제한에는 동일한 답을 사용합니다. 화면에는 “등록된 이메일·비밀번호 계정이라면 안내를 받을 수 있습니다”라고 표시합니다. 메일 발송 확인은 브라우저가 받는 응답에 포함되지 않습니다. 잘못된 입력은 `422 VALIDATION_ERROR`, SMTP 또는 링크 설정을 사용할 수 없는 경우는 `503 SERVICE_UNAVAILABLE`입니다.

### 2. 링크 열기와 새 비밀번호 설정

백엔드는 `PASSWORD_RESET_URL`에 `resetToken` 쿼리를 추가합니다. 검증용 링크 형태는 `https://app.example.test/reset-password?resetToken=<token>`입니다. 프론트 화면은 `resetToken`을 우선 읽고, 기존 `token`도 호환 입력으로 읽습니다. 앱이 이미 화면을 열어 둔 상태에서 링크를 클릭해도 새 토큰 단계로 이동하는지 확인합니다.

`POST /api/v1/auth/password-reset/confirm`

```json
{"resetToken":"<메일로 받은 토큰>","newPassword":"example-new-password"}
```

```json
{"success":true,"data":{"reset":true}}
```

`resetToken`은 문자열이며 최대 4096자입니다. `newPassword`는 회원가입과 동일하게 앞뒤 공백을 제거해 검사하며 8~128자입니다. 누락·유효하지 않은 입력은 422입니다. 형식이 유효하지만 알 수 없거나 만료·사용된 토큰은 `401 UNAUTHORIZED`입니다. DB 장애 시 503입니다. 200이면 비밀번호와 토큰 입력을 지우고 `/login`으로 이동합니다. 기존 로그인 세션의 Access Token과 Refresh Token은 폐기되므로 남아 있는 로컬 인증 정보를 정리합니다.

### 프론트 반영 대상

| 파일 | 확인할 동작 |
| --- | --- |
| `frontend/src/app/reset-password.tsx` | `/reset-password`에서 화면을 열고 새로고침 시에도 라우트를 제공 |
| `frontend/src/screens/auth/ResetPasswordScreen.tsx` | 이메일 접수 → 조건부 안내 → 링크 진입 → 비밀번호 입력 → 완료 순서, 401·422·503 표시 |
| `frontend/src/services/passwordResetApi.ts` | 기존 두 경로와 `accepted`·`reset` 디코더 유지 |
| `frontend/src/services/apiConfig.ts` | `EXPO_PUBLIC_API_URL`에 승인된 백엔드 HTTPS origin 지정. 웹 origin은 백엔드 `CORS_ORIGIN`에 반영 |

`develop`의 재설정 화면은 미연결 안내 상태입니다. API와 토큰 화면이 있는 `feat/add-features`의 위 파일을 프론트 담당자 검토 후 반영합니다. 앱의 `leren://auth/callback`은 카카오 OAuth용입니다. 비밀번호 재설정의 운영 HTTPS 주소 또는 해당 주소를 앱으로 연결할 Universal Link/App Link는 팀에서 별도로 확정해야 합니다. 링크에 담긴 토큰은 분석 이벤트·네트워크 기록·페이지 참조 URL에 수집하지 않도록 설정하고, 웹에서는 `Referrer-Policy: no-referrer` 적용을 확인합니다.

## 백엔드 환경 설정

| 환경변수 | 값 |
| --- | --- |
| `PASSWORD_RESET_SMTP_HOST` | 승인된 SMTP 서버 호스트 |
| `PASSWORD_RESET_SMTP_PORT` | 기본 587의 STARTTLS 또는 465의 암시적 TLS |
| `PASSWORD_RESET_SMTP_USER`, `PASSWORD_RESET_SMTP_PASS` | 릴레이가 요구하면 둘 다 보안 환경변수로 주입 |
| `PASSWORD_RESET_FROM` | 릴레이에서 발신을 승인받은 단일 이메일 주소 |
| `PASSWORD_RESET_URL` | 승인된 프론트 HTTPS 재설정 화면. 개발·테스트의 loopback HTTP도 지원 |

기존 메일 공급자 설정은 저장소에서 확인되지 않았습니다. 승인된 SMTP 릴레이가 있다면 그대로 연결할 수 있습니다. 새 선택이 필요하다면 AWS 인프라를 사용하는 환경에서 SES SMTP를 검토할 수 있습니다. 발신 주소나 도메인 검증, 샌드박스 해제 및 발신 테스트 절차가 필요합니다. 기존 조직 릴레이는 신규 서비스와 발신 도메인 설정 부담을 줄일 수 있으므로, 운영 비용과 발신 허용 범위를 함께 비교합니다. [Amazon SES SMTP 안내](https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html) · [SES 발신·수신 검증](https://docs.aws.amazon.com/ses/latest/dg/verify-addresses-and-domains.html)

토큰은 30분 동안 유효하며 SMTP가 수신자를 수락한 뒤에만 사용할 수 있습니다. 해당 계정의 발송 시도는 60초당 한 번, 최근 한 시간 최대 세 번입니다. 발송 오류는 이메일·토큰을 포함하지 않는 이벤트로 기록합니다. 발송은 서버 프로세스에서 비동기로 진행되며 종료나 장애가 SMTP 처리와 겹치면 사용자가 재요청해야 합니다. 메일 링크를 받은 사용자는 주소를 통제해야 합니다. 기존 이메일 회원가입은 `emailVerifiedAt`을 채우지 않으므로 그 필드를 선행 조건으로 사용하지 않습니다. 카카오 전용 계정에는 로컬 비밀번호가 만들어지지 않습니다.

## 프론트·스테이징 확인 순서

1. 직업 변경을 WARRIOR → MAGE → ARCHER → WARRIOR 순서로 실행합니다. 최초 선택·동일 직업·재로그인에서 프로필을 확인하고 보유·장착, EXP·Gold, 학습 이력을 비교합니다.
2. 승인된 테스트 주소로 재설정을 요청해 수신과 발신 주소를 확인합니다. 링크를 브라우저·설치된 앱에서 각각 열어 의도한 화면으로 이동하는지 확인합니다.
3. 새 비밀번호를 저장한 뒤 이전 비밀번호와 기존 세션이 거부되고 새 비밀번호로 로그인되는지 확인합니다. 같은 링크 재사용·만료, 이메일을 다시 요청한 경우도 확인합니다.
