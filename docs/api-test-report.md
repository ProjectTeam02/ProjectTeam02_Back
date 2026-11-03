# API 테스트 보고서

기준일: 2026-10-27

## 자동 테스트

실행 명령:

```bash
npm test
find src test -name '*.js' -print0 | xargs -0 -n1 node --check
npm ci
npm run db:build
DB_HOST=127.0.0.1 DB_PORT=5432 DB_NAME=leren_backend_pr10_test DB_USER=app_user DB_PASSWORD=app_local DB_MIGRATION_USER=migrator DB_MIGRATION_PASSWORD=migrator_local npm run db:migrate
DB_HOST=127.0.0.1 DB_PORT=5432 DB_NAME=leren_backend_pr10_test DB_USER=app_user DB_PASSWORD=app_local DB_MIGRATION_USER=migrator DB_MIGRATION_PASSWORD=migrator_local npm run db:check
DB_HOST=127.0.0.1 DB_PORT=5432 DB_NAME=leren_backend_pr10_test DB_USER=app_user DB_PASSWORD=app_local DB_MIGRATION_USER=migrator DB_MIGRATION_PASSWORD=migrator_local npm run db:test
```

결과:

- Node test: 13 passed, 0 failed
- JavaScript 문법 검사: 통과
- TypeORM database workspace build: 통과
- `npm ci`: 통과
- TypeORM migration (`leren_backend_pr10_test`): 2개 적용 통과
- TypeORM migration check: 변경 없음
- database smoke: 19/19 PASS
- `git diff --check`: 통과

자동 테스트에는 다음이 포함된다.

- Health와 Swagger OpenAPI 경로
- 입력 검증 및 보호 API 401
- FastAPI 정상/실패/연결 끊김 Mock
- quota transaction 및 429
- 퀴즈 멱등성 재시도와 다른 답안 충돌 409
- quiz UUID 및 Idempotency-Key 검증

## 로컬 통합 smoke test

실행 환경:

- Backend: `127.0.0.1:3010` (격리 smoke 실행)
- FastAPI: `127.0.0.1:8000`
- PostgreSQL: `127.0.0.1:5432/leren`

확인 결과:

```json
{
  "status": "READY",
  "database": "CONNECTED",
  "fastapi": "CONNECTED"
}
```

실제 DB를 사용한 smoke 결과:

- 회원가입: 201
- 일반 로그인: 200
- `/users/me`: 200
- 대화방 생성: 201
- 대화방 목록: 200
- 메시지 목록: 200
- 알림 설정 변경: 200
- Tutor usage: 200
- 로그아웃: 200
- 로그아웃 후 Access Token 사용: 401
- 승인 문제 없음: `/quizzes/generate` 404
- 잘못된 quiz ID 제출: 422
- 잘못된 Tutor 입력: 422

격리 smoke용 PostgreSQL은 `leren_backend_pr10_test`로 생성했으며, 기존 `leren` 데이터베이스는 수정하지 않았다.

테스트용 사용자는 확인 후 삭제했다.

## 미실행 또는 차단된 테스트

- 실제 `/api/v1/tutor/messages` 생성: OpenRouter 비용과 승인 문서 인덱스가 필요하므로 실행하지 않았다.
- Kakao 로그인: 유효한 운영 Kakao 토큰이 없어 실행하지 않았다.
- 승인 문제 정답 제출/보상: 로컬 DB에 승인 문제와 reward ledger가 없어 실행하지 않았다.
- 동시성 부하 테스트: 단위 transaction 검증만 수행했다.

위 항목은 PASS로 표시하지 않는다.
