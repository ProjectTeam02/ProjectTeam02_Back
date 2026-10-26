# Leren BackEnd

Leren 서비스의 Node.js/Express 백엔드입니다.

## 실행

```bash
npm install
# 프로젝트 루트에 .env를 직접 만들고 실제 값은 로컬에서만 입력합니다.
touch .env
npm run dev
```

필수 환경변수 예시:

```dotenv
PORT=3000
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/leren
JWT_ACCESS_SECRET=<long-random-secret>
JWT_REFRESH_SECRET=<long-random-secret>
FASTAPI_BASE_URL=http://127.0.0.1:8001
FASTAPI_INTERNAL_TOKEN=<service-token>
FASTAPI_TIMEOUT_MS=5000
AI_DAILY_LIMIT=20
```

Prisma 스키마를 적용할 때는 운영 DB에 맞는 migration을 검토한 뒤 실행합니다.

```bash
npx prisma generate
npx prisma migrate dev --name phase1-usecase
```

기본 상태 확인 주소: `GET /health`

Swagger UI: `http://localhost:3000/api-docs`

OpenAPI JSON: `http://localhost:3000/api-docs.json`

`/api/v1/health/ready`는 PostgreSQL과 FastAPI를 실제로 ping하며 둘 중 하나라도
연결되지 않으면 `503`과 `DEGRADED`를 반환합니다. `/api/v1/health/dependencies`는
동일한 의존성 상태를 JSON으로 반환합니다.

AI Tutor 요청은 Node.js가 `conversationId`, JWT 인증, History, 사용량 예약 및
DB 저장을 담당하고, FastAPI의 `POST /internal/v1/tutor/answer`로 RAG 추론을
위임합니다. FastAPI 실패·타임아웃은 외부 API에서 `503`과 `튜터가 바쁩니다.`로
변환됩니다.
