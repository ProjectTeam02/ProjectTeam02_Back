# API 테스트 보고서

기준일: 2026-10-27

## 자동 테스트

실행 명령:

```bash
npm test
find src test -name '*.js' -print0 | xargs -0 -n1 node --check
npx prisma validate
```

결과:

- Node test: 13 passed, 0 failed
- JavaScript 문법 검사: 통과
- Prisma schema validate: 통과
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

- Backend: `127.0.0.1:3000`
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

테스트용 사용자는 확인 후 삭제했다.

## 미실행 또는 차단된 테스트

- 실제 `/api/v1/tutor/messages` 생성: OpenRouter 비용과 승인 문서 인덱스가 필요하므로 실행하지 않았다.
- Kakao 로그인: 유효한 운영 Kakao 토큰이 없어 실행하지 않았다.
- 승인 문제 정답 제출/보상: 로컬 DB에 승인 문제와 reward ledger가 없어 실행하지 않았다.
- 동시성 부하 테스트: 단위 transaction 검증만 수행했다.

위 항목은 PASS로 표시하지 않는다.
