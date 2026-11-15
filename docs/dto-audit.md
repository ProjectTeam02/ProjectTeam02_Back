# DTO 적용 점검

점검 기준: Express 라우터 등록부와 실제 핸들러 호출을 기준으로 요청 DTO가 `validate()`를 통과하는지, 응답은 엔티티를 직접 반환하지 않고 공개 필드 DTO로 변환되는지 확인했다. 확장 API의 공통 응답 envelope는 `{ success, data }`이고 오류는 기존 `AppError` 계약을 사용한다.

## P0~P2 적용 현황

아래 DTO 경로는 `/api/v1` prefix를 제외한 모듈 경로다. `요청`이 `-`인 GET은 path/query가 DTO에서 검증된다.

| 우선순위 | Method | 경로 | 요청 DTO | 응답 DTO/변환 | 상태 |
|---|---|---|---|---|---|
| P0 | GET | `/bosses/{bossId}` | `extendedRequest.boss` | `extendedResponse.stage` | 적용 |
| P0 | POST | `/bosses/{bossId}/attempts` | `extendedRequest.bossStart` | 기존 quiz service DTO | 적용 |
| 별도 호환 | GET | `/boss-attempts/{attemptId}` | 기존 UUID 검사 | `NormalStageAttempt` 응답 | Swagger 누락 수정 |
| 별도 호환 | POST | `/boss-attempts/{attemptId}/answers` | 기존 Boss 채점 입력 | `NormalStageAnswer` 응답 | Swagger 누락 수정 |
| P0 | GET | `/reviews/items` | `extendedRequest.reviewItems` | `reviewListResponse.item` | 적용 |
| P0 | PUT/DELETE | `/questions/{questionId}/bookmark` | `extendedRequest.question` | `bookmarkResponse` | 적용 |
| P0 | GET | `/users/me/reward-ledger` | `extendedRequest.rewardLedger` | `rewardResponse.coin/exp` | 적용 |
| P0 | GET | `/topics/tree` | `extendedRequest.empty` | whitelist inline tree | 적용 |
| P0 | GET | `/topics/{topicId}` | `extendedRequest.topic` | `extendedResponse.stage` | 적용 |
| P1 | POST | `/auth/password-reset/request` | `extendedRequest.passwordResetRequest` | accepted envelope | 적용 |
| P1 | POST | `/auth/password-reset/confirm` | `extendedRequest.passwordResetConfirm` | reset envelope | 적용 |
| P1 | GET | `/home/summary`, `/mypage/summary` | `extendedRequest.empty` | `publicGrowth`, `publicWallet`, `publicStage` | 적용 |
| P1 | GET | `/learning/progress/active` | `extendedRequest.empty` | `learningProgressResponse.item` | 적용 |
| P1 | PUT | `/learning/progress/{stageId}` | `readingProgressRequest.parse` | `learningProgressResponse.updated` | 적용 |
| P1 | POST | `/stages/{stageId}/relearn` | `extendedRequest.pathOnly` | 기존 quiz service DTO | 적용 |
| P1 | GET | `/growth/me` | `extendedRequest.empty` | `rewardResponse.growth` | 적용 |
| P1 | GET | `/statistics/overall` | `extendedRequest.statisticsOverall` | `extendedResponse.statisticsOverall` | 적용 |
| P1 | GET | `/statistics/concepts` | `extendedRequest.statisticsConcepts` | `extendedResponse.conceptStatistics` | 적용 |
| P1 | GET | `/reviews/due` | `extendedRequest.due` | `reviewListResponse.mission` | 적용 |
| P1 | GET/POST | `/reviews/missions/{missionId}` 및 `/attempts` | `extendedRequest.mission` | `reviewListResponse.mission`, `reviewResultResponse.attempt` | 적용 |
| P1 | GET/POST | `/review-attempts/{reviewAttemptId}` 및 `/answers` | `extendedRequest.reviewAttempt`, `reviewSubmitRequest.parse` | `reviewResultResponse.response` | 적용 |
| P2 | PATCH | `/users/me` | `updateUserRequest.parse` | `updateUserRequest.response` | 적용 |
| P2 | GET | `/users/me/notification-settings` | `extendedRequest.empty` | 기존 `notificationSetting.response` | 적용 |
| P2 | PATCH | `/users/me/character/class` | `extendedRequest.classUpdate` | `classChangeResponse.response` | 적용 |
| P2 | GET/PUT | `/inventory`, `/inventory/{itemId}/equip` | `extendedRequest.empty`, `equipCostumeRequest.parse` | `extendedResponse.costume` | 적용 |
| P2 | GET | `/shop/costumes`, `/shop/costumes/{itemId}` | `extendedRequest.shopList`, `extendedRequest.item` | `extendedResponse.costume` | 적용 |
| P2 | POST | `/shop/purchases` | `purchaseCostumeRequest.parse` | whitelist purchase result | 적용 |

요청 목록을 문자 그대로 세면 P0 8개 + P1 15개 + P2 8개로 31개 operation이다. 기존 `test/extended-api-http.test.js`도 이 31개를 검사한다. “30개”라는 외부 표현과 한 개 차이가 있으므로 최종 제품 명세에서 제외할 operation은 결정이 필요하다. 구현은 나열된 모든 경로를 보존했다.

## 전체 등록 API 현황

기존 기능 라우터도 확인했다. 아래 모듈은 이번 변경에서 새 DTO를 중복 작성하지 않고 기존 Schema/DTO를 계속 사용한다.

현재 런타임 기준 `/api/v1` 등록 operation은 80개이며, Swagger operation도 80개로 일치한다. 그중 66개는 path/query/header/request body 중 하나 이상의 입력을 받고, 14개는 인증 정보나 서버 상태만 사용하는 입력 없는 operation이다.

| 등록 모듈 | 등록 경로 | 요청 DTO/Schema 상태 |
|---|---|---|
| auth | `/auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/kakao*` | `authSchema`, Kakao DTO, logout auth middleware 적용 |
| users | `/users/me`, `/users/me/notifications`, `/users/me/character-class` | `userSchema`, `updateUserRequest`, notification/character schema |
| quiz | `/quizzes/generate`, `/quizzes/stages/{stageId}/attempts`, `/quizzes/attempts/*`, `/quizzes/{id}/submit` | quiz Schema + attempt/submit response DTO |
| normal stage | `/stages/{stageId}/attempts`, `/attempts/{attemptId}/*` | normal stage Schema/DTO |
| tutor | `/tutor/conversations*`, `/tutor/messages`, `/tutor/usage` | tutor request/response Schema/DTO |
| internal question | `/internal/questions/drafts`, `/internal/questions/generate` | internal question Schema + FastAPI contract |
| calendar | `/calendar`, `/calendar/days/{date}`, `/calendar/plans*` | calendar Schema/DTO |
| learning | `/learning/history*` | learning-history Schema/DTO |
| topics/stages/concepts/characters | 각 목록·상세·character class 경로 | resource Schema와 응답 controller DTO |
| health | `/health/ready`, `/health/dependencies` 및 `/health` | 내부 상태 응답, 인증 없음 |
| extended aliases | 이 문서의 P0~P2 외 `/concepts/{conceptId}`, `/stages/{stageId}`, boss/study-plan/history alias | 일부 기존 inline UUID 검사; 별도 후속 DTO 정리 대상 |

## 검증 규칙

- UUID path와 UUID body는 공통 필드 DTO에서 trim/lowercase 및 UUID 형식을 검증한다.
- query의 page/size/limit는 양의 정수, 최대 100으로 정규화한다. source/category/sort는 허용 enum만 받는다.
- 날짜는 실제 달력 날짜인 `YYYY-MM-DD`만 받고, 시간은 `HH:MM` 또는 `HH:MM:SS`만 받는다.
- PATCH의 생략 필드는 저장하지 않으며, notification `reminderTime: null`은 명시적 초기화로 보존한다. 허용되지 않은 필드는 모두 거부한다.
- 응답 DTO는 password hash, token, user 내부 관계와 같은 엔티티 필드를 복사하지 않는다. 제출 전 문제 응답도 정답 여부/해설을 노출하지 않는 기존 quiz DTO를 유지한다.

## 검증 명령

- `node --test test/extended-api-dto.test.js test/extended-api-http.test.js test/quiz-dto.test.js` — 통과
- `node --test test/swagger-route-coverage.test.js` — `/api/v1` 등록 operation 80개와 런타임 OpenAPI operation 일치, 대표 P0~P2의 path/query/body/필수 필드·공통 오류 응답 확인
- 런타임 `/api-docs/` — HTTP 200 HTML 응답 확인
- 런타임 `/api-docs.json` — HTTP 200 JSON 응답, 대표 API의 path/query/body 확인, `$ref` 누락 없음
- `npm test` — 권한을 허용해 실행한 결과 176개 중 169 pass, 1 fail, 6 skip. 유일한 실패는 Docker/PostgreSQL이 필요한 `scripts/test-question-generation-postgres.js`이며, 애플리케이션 테스트 실패는 아니었다.
- `test/integration/extended-api-postgres.test.js` — `LEREN_EXTENDED_API_PG_TEST_CONFIG`가 없는 환경에서는 의도적으로 skip된다. PostgreSQL 설정을 주입한 실행 결과를 별도로 기록해야 한다.
