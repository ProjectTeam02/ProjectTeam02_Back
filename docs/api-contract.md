# Leren Backend API 계약

## 실행 및 문서화

- 서버: `npm run dev` (기본 포트 `3000`)
- Swagger UI: `http://localhost:3000/api-docs`
- OpenAPI JSON: `http://localhost:3000/api-docs.json`
- 인증이 필요한 API는 `Authorization: Bearer <access-token>`을 사용한다.

## 1차 Usecase 엔드포인트

| 영역 | 메서드 | 경로 |
| --- | --- | --- |
| Auth | POST | `/api/v1/auth/signup`, `/login`, `/refresh`, `/logout`, `/kakao` |
| Users | GET/PATCH | `/api/v1/users/me`, `/api/v1/users/me/notifications` |
| Tutor | GET/POST | `/api/v1/tutor/conversations`, `/api/v1/tutor/messages`, `/api/v1/tutor/usage` |
| Quiz | GET/POST | `/api/v1/quizzes/generate`, `/api/v1/quizzes/{id}/submit` |
| Health | GET | `/health`, `/api/v1/health/ready`, `/api/v1/health/dependencies` |

상세 요청·응답 스키마와 오류 응답은 Swagger의 `Try it out`에서 확인한다. 비밀번호, JWT secret, 내부 토큰 등 민감한 값은 응답과 로그에 포함하지 않는다.

## Node.js → FastAPI 내부 호출

Tutor 메시지 요청은 백엔드가 인증·소유권·사용량·대화 저장을 담당한 뒤 FastAPI의 다음 계약으로 전달한다.

`POST {FASTAPI_BASE_URL}/internal/v1/tutor/answer`

요청 헤더:

```http
Content-Type: application/json
x-internal-api-key: <FASTAPI_INTERNAL_TOKEN>
```

요청 본문 핵심 필드:

```json
{
  "requestId": "uuid",
  "conversationId": "uuid",
  "userId": "uuid",
  "question": "사용자 질문",
  "modelTier": "BASIC",
  "history": [],
  "summary": null,
  "summaryUntilSeq": null,
  "context": {},
  "knowledgeScope": {}
}
```

FastAPI 응답의 `answer`, `rewrittenQuery`, `groundingStatus`, `historyFromSeq`, `sources`, `usage`를 그대로 보존하여 Node.js 소유 AI 테이블에 저장한다. FastAPI가 응답하지 않거나 5초 timeout이 발생하면 외부 API에는 HTTP 503과 `튜터가 바쁩니다`를 반환한다.

## 오류 및 상태 코드

- `400/422`: 입력 검증 실패
- `401`: JWT 또는 내부 서비스 인증 실패
- `403`: 다른 사용자 리소스 접근
- `404`: 리소스 없음
- `409`: 중복 요청 또는 이미 처리된 상태
- `429`: 일일 AI 사용량 초과
- `503`: PostgreSQL/FastAPI 연결 불가 또는 timeout

## 현재 검증 범위

`npm test`는 외부 DB와 FastAPI 없이 실행되는 계약·검증 테스트다. 실제 Prisma migration 적용, PostgreSQL 연결, FastAPI 모델 호출은 각 서비스를 실행한 통합 환경에서 별도로 검증해야 한다.
