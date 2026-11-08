# 일반 Stage Quiz API

PR 작업 기준: `origin/develop` 9199b17. 원래 구현과 검증은 `origin/main` 7770aa8을 기준으로 수행했다. 일반 Stage만 지원하며 Boss/복습은 포함하지 않는다. 모든 신규 경로는 `/api/v1` 아래에 있고 활성 세션의 `Authorization: Bearer <accessToken>`이 필요하다.

## DB 검토와 Migration 판단

초기 Migration `database/src/migrations/1792940704952-Init.ts`와 TypeORM Entity가 일반 Stage의 3문항·정답 2개·초기 HP 2, 제출별 정답과 HP, 종료 상태/사유/시각을 저장한다. `stages`에는 `max_question_count`, `required_correct_count`, `initial_monster_hp`, 보상 수치가 있고, `learning_attempts`에는 이 값의 응시 시점 스냅샷과 `final_hp`, 횟수, `status`, `end_reason`, `ended_at`, `result_saved_at`이 있다. `question_submissions`는 `is_correct`, `hp_before`, `hp_after`, 출제 순서를 저장한다. 사용자·Stage당 진행 중 응시 1개, 응시·문제/순서당 제출 1개, 최초 통과 EXP/코인 원장의 1회 지급이 기존 unique 제약으로 보호된다. `user_stage_progress`는 최초 통과 응시를 참조한다. 따라서 **새 테이블·컬럼·Migration이 필요하지 않다.**

HP 감소, PASS/FAIL, 보상 지급 여부는 DB trigger나 CHECK가 아니라 Service가 한 TypeORM transaction 안에서 판정한다. 제출 시 `learning_attempts` 행을 쓰기 잠금으로 읽고, `finalHp ?? initialHp`에서 정답이면 1을 빼고 오답이면 유지한다. HP 0 또는 정답 2개면 즉시 `PASSED`; 3문항 후 미통과면 `FAILED`. 종료한 응시는 더 제출할 수 없다. 최초 PASS는 진행도·EXP/코인 원장·성장·지갑을 같은 transaction에서 갱신한다. 보상 금액은 Stage 설정값을 사용하고, 설정이 비어 있으면 지급을 0으로 가정하지 않고 제출 transaction을 롤백한다.

`StageQuestion.questionOrder`와 문항 공개 상태를 이용해 현재 문항을 복원한다. 공개된 Stage의 문항 연결을 운영 중 바꾸면 기존 응시의 다음 문항이 달라질 수 있으므로, **공개 콘텐츠의 문항 연결은 진행 중 응시가 있을 때 변경하지 않는 운영 정책**이 필요하다. 응시마다 출제 목록을 완전히 고정해야 한다는 요구가 추가되면 그때 최소 스냅샷 구조를 검토한다. `QuestionStatus`에는 `APPROVED`와 `PUBLISHED`가 모두 있으나 기존 최소 시드는 `PUBLISHED`를 사용한다. 이 일반 Stage 흐름은 실제 사용자에게 공개된 `PUBLISHED` 문항만 사용한다.

## HTTP 계약

| 기능 | Method/경로 | 요청 | 성공 응답 | 오류 |
|---|---|---|---|---|
| 시작·재개 | `POST /api/v1/quizzes/stages/:stageId/attempts` | 경로 UUID; 빈 본문 | 신규 201, 진행 중 재개 200. `data.attemptId`, `stageId`, `status`, `mode`, `attemptNo`, `submittedCount`, `correctCount`, `hp`, `currentQuestion`, `resumed` | 401 미인증, 403 잠금, 404 비공개/없는 Stage, 422 Boss, 503 문항/설정 부족 |
| 현재 응시·문항 | `GET /api/v1/quizzes/attempts/:attemptId` | 경로 UUID | 200; 같은 진행 상태와 다음 문항. 완료 후 `currentQuestion:null` | 401, 404 타인/없는 응시, 503 문항 설정 오류 |
| 답안 제출 | `POST /api/v1/quizzes/:id/submit` | `:id`=현재 questionId; `{ "attemptId":"UUID", "choiceId":"UUID" }`; 재시도에는 같은 `Idempotency-Key` 헤더 | 201; 기존 `quizId`, `choiceId`, `isCorrect`, `score`, `explanation`에 `hpBefore`, `hpAfter`, `submittedCount`, `correctCount`, `status`, `endReason`, `rewardGranted` 포함 | 401, 404, 409 중복/종료/잘못된 순서, 422 잘못된 선택지, 503 설정·DB 오류 |
| 완료 결과 | `GET /api/v1/quizzes/attempts/:attemptId/result` | 경로 UUID | 200; 상태·횟수·최종 HP·종료 사유/시각·보상 여부 | 401, 404, 409 아직 진행 중 |

`currentQuestion`에는 문제 ID·본문·난이도·개념 ID·선택지 ID/문구/라벨만 있다. 정답 여부와 해설은 제출 전 노출하지 않는다. 기존 `GET /api/v1/quizzes/generate`는 삭제하지 않았으며 Stage 응시와는 연결되지 않는 레거시 승인 문제 조회다. 이 경로는 기존의 `success`, `data.id`, `data.title`, `data.difficulty`, `data.conceptId`, `data.choices`를 유지한다. **계약 변경:** 기존 `data.explanation`의 문자열 값은 제출 전 해설 노출 방지를 위해 `null`로 바뀐다. `APPROVED` 문항이 없으면 기존처럼 404다. 저장된 문항 해설은 일반 Stage의 답안 제출 성공 응답인 `data.explanation`에서 제공한다. 프론트엔드의 기존 Quiz 화면은 `id`·`title`·`choices`만 읽고 제출 버튼이 비활성화되어 있어 이 값 변경의 직접적인 파싱 영향은 없다. Stage 채점·진행도·보상을 연결하려면 새 Stage 시작/응시 경로로 전환해야 한다.

`Idempotency-Key`는 응시의 **각 답안 요청마다 다른 값**을 사용한다. 같은 키·문항·선택지의 재요청은 새 답안/보상을 저장하지 않고 201과 원래 채점 결과, `duplicate:true`를 반환한다. 키를 다른 문항 또는 선택지에 재사용하면 409다. 키 없이 같은 문항을 다시 보내면 409다.

## 동작 예시

초기 HP 2에서 정답→정답은 `2→1→0`, 두 번째 제출 즉시 `PASSED`이며 세 번째 문제는 제공되지 않는다. 오답→정답→오답은 `2→2→1→1`, 세 번째 제출 후 `FAILED`다. 오답→정답→정답은 `2→2→1→0`, 세 번째 제출 후 `PASSED`다. 오답 3개는 HP 2로 `FAILED`다.

이력 목록/상세는 기존 `LearningAttempt`와 `QuestionSubmission`을 읽고, 캘린더는 `PASSED`와 `endedAt`을 읽으므로 별도의 이력·캘린더 API 수정이 필요하지 않다.
