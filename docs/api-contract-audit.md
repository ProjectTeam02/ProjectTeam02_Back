# Leren 2.0 API 계약 대조표

- 기준 커밋: `6f53c81c02818eefb3b7d9967d84999dfffa3afe` (`origin/develop`와 동일)
- CSV: `Leren 2.0 구분별 API 명세서` — Ruby `CSV` 파서로 58행 확인
- 우선순위: P0 20개, P1 29개, P2 9개
- 보조 근거: [Notion API 명세서](https://app.notion.com/p/70f07209847242c8a2bf2d95bc391568?v=3fc73374e900815e8c05000c2ecf28ab&source=copy_link)
- `결정 필요`는 응답 JSON·상태·인증 전달 방식에 CSV/상세 페이지/호출부 간 확정 근거가 부족해 이번 변경을 보류한 항목이다.

| FR ID | 우선순위 | CSV 명세 | 실제 동작 | 코드 근거 | 분류 | 조치 |
|---|---:|---|---|---|---|---|
| FR-010 | P0 | GET `/api/v1/concepts/{conceptId}` | 동일 경로 GET, Bearer | `src/modules/concepts/concept.routes.js:13` | 일치 | 유지 |
| FR-012, FR-013, FR-016 | P0 | POST `/api/v1/attempts/{attemptId}/answers` | 신규 경로 구현, `questionId/choiceId/submissionId` 검증·공통 채점 | `src/modules/quizzes/normal-stage.routes.js` | 일치 | 구현 완료 |
| FR-023 | P1 | GET `/api/v1/reviews/due` | 라우트 없음 | `src/modules/reviews/review.routes.js` 스캐폴드 | 미구현 | 후속 구현 |
| FR-034 | P1 | GET `/api/v1/statistics/concepts` | 라우트 없음 | `src/routes/index.js` | 미구현 | 후속 구현 |
| FR-016 | P0 | POST `/api/v1/bosses/{bossId}/attempts` | 라우트 없음 | `src/routes/index.js` | 미구현 | Boss 정책 확정 후 구현 |
| FR-020, FR-022 | P0 | GET `/api/v1/reviews/items` | 라우트 없음 | `src/modules/reviews/review.routes.js` | 미구현 | 후속 구현 |
| FR-032 | P1 | DELETE `/api/v1/study-plans/{planId}` | DELETE `/api/v1/calendar/plans/{planId}` | `src/modules/calendar/calendar.routes.js:19` | 계약 불일치 | 앱 호출처 확인 후 경로 호환 추가 |
| FR-033 | P1 | GET `/api/v1/statistics/overall` | 라우트 없음 | `src/routes/index.js` | 미구현 | 후속 구현 |
| FR-036 | P2 | PATCH `/api/v1/users/me/character/class` | PATCH `/api/v1/users/me/character-class` | `src/modules/users/user.routes.js:18` | 계약 불일치 | 별도 캐릭터 API 변경 |
| FR-032 | P1 | POST `/api/v1/study-plans` | POST `/api/v1/calendar/plans` | `src/modules/calendar/calendar.routes.js:17` | 계약 불일치 | 앱 호출처 확인 후 호환 추가 |
| FR-007 | P1 | GET `/api/v1/home/summary` | 라우트 없음 | `src/routes/index.js` | 미구현 | 후속 구현 |
| FR-006 | P0 | PUT `/api/v1/users/me/character/class` | PATCH `/api/v1/users/me/character-class` | `src/modules/users/user.routes.js:18` | 계약 불일치 | 최초 선택 Method/경로 확정 필요 |
| FR-005 | P1 | POST `/api/v1/auth/password-reset/confirm` | 라우트 없음 | `src/modules/auth/auth.routes.js` | 미구현 | 후속 구현 |
| FR-041 | P2 | GET `/api/v1/users/me/notification-settings` | PATCH `/api/v1/users/me/notifications`만 존재 | `src/modules/users/user.routes.js:17` | 계약 불일치 | 설정 조회/변경 계약 통합 |
| FR-037 | P2 | GET `/api/v1/inventory` | 라우트 없음 | `src/routes/index.js` | 미구현 | 후속 구현 |
| FR-030 | P1 | GET `/api/v1/calendar?month=YYYY-MM` | 동일 경로 GET, month 검증 | `src/modules/calendar/calendar.routes.js:15` | 일치 | 유지 |
| FR-011 | P1 | PUT `/api/v1/learning/progress/{stageId}` | 라우트 없음 | `src/modules/learning/learning.routes.js` | 미구현 | 후속 구현 |
| FR-037 | P2 | PUT `/api/v1/inventory/{itemId}/equip` | 라우트 없음 | `src/routes/index.js` | 미구현 | 후속 구현 |
| FR-021 | P0 | PUT `/api/v1/questions/{questionId}/bookmark` | 라우트 없음 | `src/modules/questions/question.routes.js` | 미구현 | 후속 구현 |
| FR-003 | P0 | POST `/api/v1/auth/login` | 동일 경로 POST, Body email/password | `src/modules/auth/auth.routes.js:30` | 일치 | 유지 |
| FR-017, FR-035 | P0 | GET `/api/v1/learning/history?type,dateFrom,dateTo,page,size` | 경로는 같지만 `pageSize/status`만 지원 | `src/modules/learning/history.schema.js:14-24` | 계약 불일치 | 조회 필터 계약 확정 후 변경 |
| FR-038 | P2 | GET `/api/v1/shop/costumes` | 라우트 없음 | `src/modules/costumes/costume.routes.js` | 미구현 | 후속 구현 |
| FR-012, FR-014 | P0 | POST `/api/v1/stages/{stageId}/attempts`, Body mode | 신규 경로, START/RETRY, 3문항·HP2·정답2 | `src/modules/quizzes/normal-stage.routes.js` | 일치 | 구현 완료 |
| FR-026 | P1 | GET `/api/v1/tutor/conversations?page,size` | `page,pageSize`만 지원 | `src/modules/tutor/dto/tutorRequest.dto.js:101-106` | 계약 불일치 | pagination 명칭 확정 후 변경 |
| FR-031 | P1 | GET `/api/v1/calendar/days/{date}` | 동일 경로 GET, path date 검증 | `src/modules/calendar/calendar.routes.js:16` | 일치 | 유지 |
| FR-005 | P1 | POST `/api/v1/auth/password-reset/request` | 라우트 없음 | `src/modules/auth/auth.routes.js` | 미구현 | 후속 구현 |
| FR-028 | P1 | GET `/api/v1/tutor/usage` | 동일 경로 GET, Bearer | `src/modules/tutor/tutor.routes.js:22` | 일치 | 유지 |
| FR-011 | P1 | GET `/api/v1/learning/progress/active` | 라우트 없음 | `src/modules/learning/learning.routes.js` | 미구현 | 후속 구현 |
| FR-035 | P1 | GET `/api/v1/learning/history/{historyId}` | GET `/api/v1/learning/history/{recordType}/{recordId}` | `src/modules/learning/learning.routes.js:16` | 계약 불일치 | 기존 LEARNING 타입 호환 여부 결정 |
| FR-040 | P2 | PATCH `/api/v1/users/me`, Body nickname? | GET만 존재 | `src/modules/users/user.routes.js:16` | 미구현 | 후속 구현 |
| FR-032 | P1 | PATCH `/api/v1/study-plans/{planId}` | PATCH `/api/v1/calendar/plans/{planId}` | `src/modules/calendar/calendar.routes.js:18` | 계약 불일치 | 앱 호출처 확인 후 호환 추가 |
| FR-018 | P0 | GET `/api/v1/users/me/reward-ledger` | 라우트 없음 | `src/routes/index.js` | 미구현 | 후속 구현 |
| FR-015, FR-016 | P0 | GET `/api/v1/bosses/{bossId}` | 라우트 없음 | `src/routes/index.js` | 미구현 | Boss 정책 확정 후 구현 |
| FR-027 | P1 | POST `/internal/v1/tutor/answer` | FastAPI client가 동일 upstream path 호출 | `src/clients/fastapi.client.js:34-37` | 일치 | Node 라우트로 노출하지 않음 |
| FR-026 | P1 | POST `/api/v1/tutor/conversations`, Body stageId?,conceptId? | Body는 contextStageId/contextConceptId/entryPoint | `src/modules/tutor/dto/tutorRequest.dto.js:42-49` | 계약 불일치 | Tutor request 계약 확정 후 변경 |
| FR-009, FR-015 | P0 | GET `/api/v1/topics/{topicId}` | 동일 경로 없음; `/topics/{topicId}/stages`만 존재 | `src/modules/topics/topic.routes.js:18` | 미구현 | 주제 상세 경로 구현 |
| FR-042 | P1 | POST `/api/v1/auth/logout`, Cookie refreshToken | POST는 Bearer Access Token 세션 전체 폐기 | `src/modules/auth/auth.routes.js:32` | 계약 불일치 | Cookie/Body 인증 변경과 분리 |
| FR-002 | P0 | POST `/api/v1/auth/signup`, Body email/password/passwordConfirm/nickname | 동일 경로 POST, DTO 검증 | `src/modules/auth/auth.routes.js:29` | 일치 | 유지 |
| FR-038 | P2 | GET `/api/v1/shop/costumes/{itemId}` | 라우트 없음 | `src/modules/costumes/costume.routes.js` | 미구현 | 후속 구현 |
| FR-017 | P0 | GET `/api/v1/attempts/{attemptId}` | 신규 결과 상세 경로, 소유권·답안·오답·통과/보상 이력 | `src/modules/quizzes/normal-stage.routes.js` | 일치 | 구현 완료 |
| FR-024 | P1 | GET `/api/v1/review-attempts/{reviewAttemptId}` | 라우트 없음 | `src/modules/reviews/review.routes.js` | 미구현 | 후속 구현 |
| FR-008 | P0 | GET `/api/v1/topics/tree` | 라우트 없음 | `src/modules/topics/topic.routes.js` | 미구현 | 후속 구현 |
| FR-025 | P1 | POST `/api/v1/stages/{stageId}/relearn` | 라우트 없음 | `src/modules/stages/stage.routes.js` | 미구현 | 정책 확정 후 구현 |
| FR-021 | P0 | DELETE `/api/v1/questions/{questionId}/bookmark` | 라우트 없음 | `src/modules/questions/question.routes.js` | 미구현 | 후속 구현 |
| FR-026 | P1 | GET `/api/v1/tutor/conversations/{conversationId}/messages?cursor,limit` | path는 `:id`, query는 page/pageSize | `src/modules/tutor/tutor.routes.js:20` | 계약 불일치 | cursor/limit 계약 확정 후 변경 |
| FR-023, FR-024 | P1 | GET `/api/v1/reviews/missions/{missionId}` | 라우트 없음 | `src/modules/reviews/review.routes.js` | 미구현 | 후속 구현 |
| FR-019 | P1 | GET `/api/v1/growth/me` | 라우트 없음 | `src/routes/index.js` | 미구현 | 후속 구현 |
| FR-010 | P0 | GET `/api/v1/stages/{stageId}` | 동일 경로 GET, 공개 Stage 검증 | `src/modules/stages/stage.routes.js:16` | 일치 | 유지 |
| FR-029 | P1 | GET `/api/v1/mypage/summary` | 라우트 없음 | `src/routes/index.js` | 미구현 | 후속 구현 |
| FR-004 | P1 | POST `/api/v1/auth/kakao`, Body authorizationCode/redirectUri | 동일 경로; 개발/test 및 feature flag 조건의 레거시 직접 흐름 | `src/modules/auth/auth.routes.js:33`, `auth.service.js:83-87` | 결정 필요 | 모바일 OAuth와의 호환 기간·제거 시점 별도 결정 |
| FR-026, FR-027 | P1 | POST `/api/v1/tutor/messages` | path는 같지만 `question`/conversationId 필수, stage/concept는 context로 전달 | `src/modules/tutor/dto/tutorRequest.dto.js:88-98` | 계약 불일치 | Tutor 상세 계약 확정 후 변경 |
| FR-039 | P2 | POST `/api/v1/shop/purchases` | 라우트 없음 | `src/modules/costumes/costume.routes.js` | 미구현 | 후속 구현 |
| FR-024 | P1 | POST `/api/v1/review-attempts/{reviewAttemptId}/answers` | 라우트 없음 | `src/modules/reviews/review.routes.js` | 미구현 | 후속 구현 |
| FR-041 | P2 | PATCH `/api/v1/users/me/notification-settings` | PATCH `/api/v1/users/me/notifications`, Body learningOn | `src/modules/users/user.routes.js:17` | 계약 불일치 | 설정 필드/경로 확정 후 변경 |
| FR-003, FR-029 | P0 | GET `/api/v1/users/me` | 동일 경로 GET, Bearer | `src/modules/users/user.routes.js:16` | 일치 | 유지 |
| FR-003 | P0 | POST `/api/v1/auth/refresh`, Cookie refreshToken | Body refreshToken으로 회전 | `src/modules/auth/auth.routes.js:31`, `auth.schema.js:19-21` | 계약 불일치 | React Native 저장·회전·로그아웃 변경으로 분리 |
| FR-024 | P1 | POST `/api/v1/reviews/missions/{missionId}/attempts` | 라우트 없음 | `src/modules/reviews/review.routes.js` | 미구현 | 후속 구현 |
| FR-012, FR-013 | P0 | GET `/api/v1/attempts/{attemptId}/current-question` | 신규 경로, 본인 응시·현재 문항·HP/카운터, 정답 미노출 | `src/modules/quizzes/normal-stage.routes.js` | 일치 | 구현 완료 |

## CSV 밖에서 발견한 실제 라우트

| 실제 경로 | 호출 주체/근거 | 조치 |
|---|---|---|
| `/health` | 운영 프로세스 상태; app.js에서 공개 | 유지하고 운영/모니터링 문서로 관리 |
| `/api/v1/health/ready`, `/api/v1/health/dependencies` | 운영·배포 의존성 확인 | 명세 추가보다 운영 문서로 관리 |
| `/api/v1/internal/questions/drafts`, `/api/v1/internal/questions/generate` | AI 서버 문제 적재; 별도 API key | 내부 문서로 관리하고 외부 앱에 노출하지 않음 |
| `/api/v1/auth/kakao/start`, `/kakao/callback`, `/kakao/exchange` | React Native 모바일 OAuth PKCE | CSV의 레거시 `/auth/kakao`와 호환 기간을 운영 문서에 명시; 호출처 확인 전 제거하지 않음 |
| `/api/v1/quizzes/generate`, `/quizzes/stages/{stageId}/attempts`, `/quizzes/attempts/{attemptId}`, `/quizzes/attempts/{attemptId}/result`, `/quizzes/{id}/submit` | 기존 앱/테스트 호출 가능성 | 신규 Stage 경로로 전환 전 기존 계약 보존 |
| `/api/v1/calendar/plans*`, `/api/v1/learning/history/{recordType}/{recordId}`, `/api/v1/topics`, `/api/v1/topics/{topicId}/stages`, `/api/v1/character-classes`, `/api/v1/users/me/notifications`, `/api/v1/users/me/character-class` | 기존 구현 및 기존 테스트 | 호출처 확인 후 CSV 경로와 통합; 현재는 제거하지 않음 |

`POST /internal/v1/tutor/answer`는 이 저장소의 Express 공개 라우트가 아니라 `FastApiClient.answer()`가 FastAPI로 호출하는 서버 간 계약이다.
