# API 연동 가이드

## 로컬 주소

- Backend: `http://localhost:3000`
- Swagger: `http://localhost:3000/api-docs`
- OpenAPI JSON: `http://localhost:3000/api-docs.json`
- FastAPI: `http://localhost:8000`
- Readiness: `GET /api/v1/health/ready`

## 환경변수

백엔드 `.env`는 로컬에서만 만들고 Git에 커밋하지 않는다.

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/leren
FASTAPI_BASE_URL=http://127.0.0.1:8000
FASTAPI_INTERNAL_TOKEN=<AI .env의 INTERNAL_API_TOKEN과 동일한 값>
JWT_ACCESS_SECRET=<로컬 랜덤 값>
JWT_REFRESH_SECRET=<로컬 랜덤 값>
```

AI 서버의 `OPENROUTER_API_KEY`는 AI 저장소 `.env`에서만 관리한다.

## 인증 흐름

1. `POST /api/v1/auth/signup` 또는 `/login`
2. 응답 `data.accessToken`을 보관
3. 보호 API 호출 시 `Authorization: Bearer <accessToken>` 전송
4. 로그아웃하면 해당 세션의 Access Token도 즉시 거부된다.

## Tutor 흐름

```http
POST /api/v1/tutor/conversations
Authorization: Bearer <accessToken>
Content-Type: application/json
```

생성된 `data.id`를 이후 메시지 요청의 `conversationId`로 사용한다.

```http
POST /api/v1/tutor/messages
Authorization: Bearer <accessToken>
Idempotency-Key: <unique-request-key>
Content-Type: application/json
```

FastAPI 호출 계약은 `src/clients/fastapi.client.js`와 `docs/api-contract.md`를 기준으로 한다. FastAPI timeout 또는 연결 실패는 Backend에서 503으로 변환한다.

## 퀴즈 제출

`POST /api/v1/quizzes/{id}/submit`에서 `id`는 quiz UUID다. 재시도 가능한 제출에는 동일한 `Idempotency-Key`를 사용한다. 같은 키를 다른 답안에 사용하면 409를 반환한다.

현재 보상 지급은 EXP/Gold ledger의 최종 ERD 합의 전까지 연결하지 않는다.

## 오류 처리

- `401`: 인증 실패 또는 폐기된 세션
- `403`: 다른 사용자 리소스 접근
- `404`: 리소스 없음 또는 승인 문제 없음
- `409`: 멱등성 키/중복 제출 충돌
- `422`: 요청 형식 및 UUID 검증 실패
- `429`: 일일 Tutor quota 초과
- `503`: FastAPI/DB 사용 불가 또는 timeout

## 실행 순서

```bash
# PostgreSQL에서 leren DB와 pgvector 준비
npm install
npx prisma generate
npm run dev

# AI 저장소
cd ../ProjectTeam02_AI
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
```

두 서버 실행 후 `/api/v1/health/ready`가 `READY`인지 확인한다. 실제 OpenRouter 호출은 비용과 API key 상태를 확인한 뒤 별도 통합 테스트로 수행한다.
