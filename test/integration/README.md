# Kakao PostgreSQL integration verification

일반 `npm test`에서는 PostgreSQL 테스트가 **skip**된다. 실제 DB 검증은 Docker와 기존 Node 의존성이 준비된 PowerShell에서 명시적으로 실행한다.

```powershell
./test/integration/run-kakao-postgres.ps1 -ReportPath "$env:TEMP/leren-kakao-pg-results.json"
```

실행기는 DB 패키지를 빌드한 뒤 `pgvector/pgvector:pg18` 임시 컨테이너를 만들고 기존 Migration을 적용한다. localhost 개발 DB나 `.env`의 DB 접속값을 테스트 대상으로 사용하지 않는다. 루프백 포트·작업 전용 라벨·tmpfs·새 app.users 부재를 모두 검사한다. 임시 DB에서만 합성 회원/세션을 생성하고, 장애/지연 주입용 트리거를 만들었다가 제거한다. Entity·Migration 파일은 변경하지 않는다. 테스트 종료 시 소유권을 확인한 임시 컨테이너만 제거하고 프로세스 전용 환경 변수를 복구한다. 기존 볼륨은 삭제하지 않는다.

카카오 Client의 토큰 발급·프로필 메서드만 Mock으로 대체한다. Auth/모바일 Service, Repository, TypeORM, PostgreSQL, JWT, 인증 미들웨어는 실제 구현이다. 외부 네트워크는 임시 HTTP 서버 외 요청을 테스트에서 차단한다. JSON 증빙에는 JWT·인가 코드·비밀번호를 저장하지 않는다.

**Refresh 동시 재발급 검사는 알려진 기존 결함을 재현하는 진단이다.** 두 요청 200·새 활성 세션 2개를 관찰하면 진단은 통과하지만 `evidence.refreshRace.securityExpectationSatisfied=false`다. 이 통합 테스트가 통과해도 Refresh 재사용 방어가 완료되거나 운영 배포가 안전하다는 뜻은 아니다. 해당 Auth 수정은 별도 검토 대상이다.

회원 생성 실패 검사는 내부 `prepareKakaoLogin(..., true)`의 전체 트랜잭션과 실제 모바일 callback/exchange의 두 단계 트랜잭션을 구분한다. 모바일 세션 발급 실패 시 callback에서 이미 커밋한 회원은 유지되고 exchange의 lastLogin/세션 변경만 롤백된다. 사용한 일회용 코드는 소모된다. 이 구조를 테스트 목적으로 재설계하지 않는다.

테스트 단독 파일은 `LEREN_KAKAO_PG_TEST_CONFIG`가 없으면 skip한다. 일반 개발 DB의 연결값을 이 변수에 넣지 않는다. 이름·라벨·루프백 바인딩·tmpfs·새 DB 조건을 만족하지 않으면 테스트가 중단된다. 테스트 계정 데이터는 임시 환경이 사라질 때 함께 제거된다.
