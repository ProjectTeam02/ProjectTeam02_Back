# API 구현 현황

기준일: 2026-10-27

상태 기준은 라우트 존재 여부가 아니라 Router → Controller → Service → DB/외부 연동과 실제 검증 결과를 함께 반영했다.

| Method | Endpoint | 현재 상태 | Router | Controller | Service | DB 연결 | 테스트 | 필요한 작업 |
|---|---|---|---|---|---|---|---|---|
| POST | `/api/v1/auth/login` | PARTIAL | `src/modules/auth/auth.routes.js` | `auth.controller.js` | 일반 로그인/JWT 구현 | Prisma 연결 | 일반 로그인 smoke 통과 | Kakao 운영 토큰 통합 검증 |
| POST | `/api/v1/auth/logout` | IMPLEMENTED | `auth.routes.js` | `auth.controller.js` | 세션 폐기 및 세션 결합 Access Token | Prisma 연결 | 로그아웃 후 Access Token 401 확인 | 운영 부하 테스트 |
| GET | `/api/v1/users/me` | IMPLEMENTED | `user.routes.js` | `user.controller.js` | 성장 정보 포함 사용자 조회 | Prisma 연결 | 인증 사용자 smoke 통과 | 없음 |
| POST | `/api/v1/tutor/conversations` | IMPLEMENTED | `tutor.routes.js` | `tutor.controller.js` | 사용자 소유 대화 생성 | Prisma 연결 | 생성 smoke 통과 | 없음 |
| GET | `/api/v1/tutor/conversations` | IMPLEMENTED | `tutor.routes.js` | `tutor.controller.js` | 페이지네이션 목록 조회 | Prisma 연결 | 목록 smoke 통과 | 없음 |
| GET | `/api/v1/tutor/conversations/{id}/messages` | IMPLEMENTED | `tutor.routes.js` | `tutor.controller.js` | 소유권 확인 후 메시지 조회 | Prisma 연결 | 빈 기록 조회 smoke 통과 | 없음 |
| POST | `/api/v1/tutor/messages` | BLOCKED | `tutor.routes.js` | `tutor.controller.js` | quota 예약, History 구성, FastAPI 위임 | Prisma 연결 | 입력 검증만 통과 | OpenRouter/실제 RAG 호출 및 승인 문서 인덱스 필요 |
| GET | `/api/v1/tutor/usage` | IMPLEMENTED | `tutor.routes.js` | `tutor.controller.js` | 서울 기준 일일 사용량 조회 | Prisma 연결 | usage smoke 통과 | 운영 동시성 부하 테스트 |
| GET | `/api/v1/quizzes/generate` | PARTIAL | `quiz.routes.js` | `quiz.controller.js` | 승인 문제 조회, 정답 비노출 | Prisma 연결 | 승인 문제가 없는 환경에서 404 확인 | 학습 진도/AI 생성 정책과 승인 데이터 필요 |
| POST | `/api/v1/quizzes/{id}/submit` | PARTIAL | `quiz.routes.js` | `quiz.controller.js` | 채점 트랜잭션, attempt/idempotency 중복 방지 | Prisma 연결 | schema 및 중복 단위 테스트 통과 | EXP/Gold ledger 실제 ERD 연결 및 승인 문제 fixture 필요 |
| PATCH | `/api/v1/users/me/notifications` | IMPLEMENTED | `user.routes.js` | `user.controller.js` | 본인 알림 설정 upsert | Prisma 연결 | 설정 변경 smoke 통과 | 없음 |

## 이미 구현되어 유지한 API

사용자 조회, 대화방 CRUD, 사용량, 알림 설정은 기존 구조를 재사용했다. Swagger 경로와 실제 라우트도 일치한다. `/docs`는 기존 호환 alias로 유지하고 공식 주소는 `/api-docs`다.

## 이번 보완 사항

- Access Token에 세션 ID를 포함하고 매 요청 활성 세션을 확인해 로그아웃 후 즉시 폐기한다.
- Tutor quota 예약과 `AiRequest` 생성을 하나의 Prisma transaction으로 묶었다.
- 퀴즈 제출에 `Idempotency-Key`와 `QuizAttempt.idempotencyKey` unique index를 추가했다.
- 잘못된 quiz/choice/attempt UUID와 멱등성 키를 검증한다.
- 요청되지 않은 새 API 경로는 추가하지 않았다.

## 차단 및 협의 항목

- `/api/v1/tutor/messages`: FastAPI 프로세스 health와 DB 연결은 확인했지만 유료 OpenRouter 생성 호출은 실행하지 않았다.
- Kakao 로그인: 서버 검증 코드는 있으나 운영 Kakao 토큰/앱 설정이 필요하다.
- Quiz 보상: 현재 Prisma schema에 EXP/Gold ledger 모델이 없어 임의 보상을 만들지 않았다.
- 공유 DB에서 AI 소유 테이블이 Prisma migration 외부에 생성되어 `prisma migrate dev`는 drift를 보고한다. DB reset은 수행하지 않았다.
