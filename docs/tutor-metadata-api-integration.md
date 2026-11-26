# AI 튜터 진단·추천 API 연동

기존 인증과 요청 형식을 사용합니다. `POST /api/v1/tutor/messages`의 `data.assistantMessage`와 `GET /api/v1/tutor/conversations/{id}/messages`의 `data.items[]`에 `tutoringMeta`와 `proposedAction`이 선택적으로 포함됩니다. 두 필드는 각각 생략될 수 있습니다. 사용자 메시지, 기존 저장 메시지, 메타데이터가 없는 AI 응답에는 값이 없는 필드를 생략합니다.

## 요청 예시

아래는 기존 응시의 현재 문항에서 질문하는 예시입니다. `conversationId`, `question`은 필수이며 나머지는 기존 API와 같습니다. `eligibleQuestionCandidates`는 내부 FastAPI 요청 전용입니다.

```json
{
  "conversationId": "de110001-9bca-4000-8000-000000000001",
  "clientMessageId": "tutor-01",
  "question": "금리의 의미를 설명해 주세요.",
  "modelTier": "BASIC",
  "context": {
    "entryPoint": "QUIZ",
    "conceptCode": "ECON_RATE",
    "attemptId": "de110001-9bca-4000-8000-000000000004",
    "stageId": "de110001-9bca-4000-8000-000000000005",
    "questionId": "de110001-9bca-4000-8000-000000000006"
  }
}
```

## 응답 필드

| `tutoringMeta` 필드 | 자료형과 의미 |
| --- | --- |
| `schemaVersion` | 문자열 `1.0` |
| `conceptCode` | 검증된 개념 코드 문자열(1~30자) 또는 `null` |
| `diagnosis.misconceptionType` | `KNOWLEDGE_GAP`, `RELATION_ERROR`, `CAUSAL_ERROR`, `APPLICATION_ERROR`, `UNCERTAIN`. 현재 배포 정책에서는 `UNCERTAIN`만 허용합니다. |
| `diagnosis.confidence` | 0~1 숫자. 현재 `0`이며 성적이나 숙련도를 뜻하지 않습니다. |
| `diagnosis.evidenceQuestionIds` | 본인이 제출한 진단 대상 공개 문항의 UUID 배열, 최대 20개. 근거가 없으면 `[]`입니다. |
| `diagnosis.needsFollowup` | 불리언. 현재 `true`입니다. |
| `diagnosis.reasoningSummary` | 사용자 표시용 진단 요약 문자열(1~500자) |
| `strategy.strategyId` / `strategy.strategyVersion` | 전략 문자열(각 1~100자, 1~50자) |

| `proposedAction` 필드 | 자료형과 의미 |
| --- | --- |
| `type` | `SOLVE_QUESTION`, `START_STAGE`, `REVIEW_CONCEPT`, `CONTINUE_LEARNING`, `NONE` |
| `conceptCode` | 검증된 개념 코드 문자열(1~30자) 또는 `null` |
| `questionId`, `stageId`, `attemptId` | 각각 UUID 또는 `null` |
| `reason` | 사용자 표시용 행동 사유 문자열(1~500자) |
| `priority` | `LOW`, `MEDIUM`, `HIGH` |

| 행동 | 필드 조건과 앱 동작 |
| --- | --- |
| `SOLVE_QUESTION` | 네 식별자가 모두 있습니다. 기존 일반 Stage 응시로 이동합니다. |
| `START_STAGE` | `stageId`가 있고 `questionId`·`attemptId`는 `null`입니다. 사용자가 실행하면 기존 Stage 시작 API를 호출합니다. |
| `REVIEW_CONCEPT` | `conceptCode`가 있고 `questionId`·`attemptId`는 `null`입니다. `stageId`가 있으면 검증된 참조입니다. 기존 개념 화면으로 이동합니다. |
| `CONTINUE_LEARNING` | `stageId` 또는 `attemptId`가 있고 `questionId`는 `null`입니다. 화면에서 확인된 기존 학습 흐름을 사용합니다. |
| `NONE` | `questionId`·`stageId`·`attemptId`는 `null`입니다. 추천 버튼을 표시하지 않습니다. |

정상 질문 전송의 HTTP `201` 예시입니다. ID와 개념 코드는 설명용 값입니다.

```json
{
  "success": true,
  "data": {
    "userMessage": {
      "messageId": "de110001-9bca-4000-8000-000000000002",
      "conversationId": "de110001-9bca-4000-8000-000000000001",
      "sequenceNo": 1,
      "role": "USER",
      "content": "금리의 의미를 설명해 주세요.",
      "clientMessageId": "tutor-01",
      "status": "COMPLETED",
      "groundingStatus": null,
      "createdAt": "2026-11-26T01:00:00.000Z",
      "completedAt": "2026-11-26T01:00:01.000Z",
      "sources": []
    },
    "assistantMessage": {
      "messageId": "de110001-9bca-4000-8000-000000000003",
      "conversationId": "de110001-9bca-4000-8000-000000000001",
      "sequenceNo": 2,
      "role": "ASSISTANT",
      "content": "금리는 빌리거나 맡긴 돈에 붙는 이자의 비율이에요.",
      "clientMessageId": null,
      "status": "COMPLETED",
      "groundingStatus": "INSUFFICIENT",
      "createdAt": "2026-11-26T01:00:00.000Z",
      "completedAt": "2026-11-26T01:00:01.000Z",
      "sources": [],
      "tutoringMeta": {
        "schemaVersion": "1.0",
        "conceptCode": "ECON_RATE",
        "diagnosis": {
          "misconceptionType": "UNCERTAIN",
          "confidence": 0,
          "evidenceQuestionIds": [],
          "needsFollowup": true,
          "reasoningSummary": "확정할 수 있는 근거가 부족해 추가 확인이 필요합니다."
        },
        "strategy": { "strategyId": "DIAGNOSTIC_CHECK_V1", "strategyVersion": "1.0" }
      },
      "proposedAction": {
        "type": "SOLVE_QUESTION",
        "conceptCode": "ECON_RATE",
        "questionId": "de110001-9bca-4000-8000-000000000006",
        "stageId": "de110001-9bca-4000-8000-000000000005",
        "attemptId": "de110001-9bca-4000-8000-000000000004",
        "reason": "현재 응시의 풀이 가능한 문항입니다.",
        "priority": "LOW"
      }
    },
    "quota": { "dailyLimit": 20, "used": 1, "remaining": 19 }
  }
}
```

## 추천 실행과 재조회

1. `SOLVE_QUESTION`을 선택하면 기존 `attemptId`로 `GET /api/v1/attempts/{attemptId}/current-question`을 호출합니다. `data.status`가 `IN_PROGRESS`이고 `data.currentQuestion.id`가 추천의 `questionId`와 같을 때 표시합니다. 앱이 다른 문항을 배정하거나 새 응시를 생성할 필요는 없습니다.
2. 문항을 푼 뒤 기존 `POST /api/v1/attempts/{attemptId}/answers`로 답안을 제출합니다. 새로운 Stage를 시작할 때는 기존 `POST /api/v1/stages/{stageId}/attempts`를 사용합니다. 채점·보상은 기존 API가 처리합니다.
3. 추천은 메시지를 저장할 때 검증한 결과입니다. 이후 응시가 끝나거나 현재 문항이 달라지거나 조회가 실패하면 추천 버튼을 비활성화하고 현재 학습 상태를 새로 불러옵니다.
4. 정상 처리된 같은 `clientMessageId`의 재전송은 기존 `201` 응답에 `duplicate: true`, `quota: null`을 반환합니다. 메타데이터는 저장한 값을 재사용합니다. 검증할 수 없는 AI 추천은 `503`으로 실패하며 사용량에서 제외됩니다. 실패한 요청을 다시 보낼 때는 기존 계약에 따라 새 `clientMessageId`를 사용합니다.

## 기능 플래그와 배포

- `TUTOR_METADATA_ENABLED` 기본값은 `false`입니다. 이때 내부 후보 키와 외부 응답의 메타데이터를 모두 생략합니다. 과거에 저장된 값은 DB에 유지합니다. 재활성화하면 저장값이 있는 메시지에서 다시 보입니다.
- 플래그가 `true`이면 현재 일반 Stage 응시의 적격 문항을 최대 한 개 보냅니다. 해당 문항이 없으면 내부 후보 배열은 `[]`입니다. `TUTOR_PERSONALIZATION_ENABLED`가 함께 켜져야 본인의 진단 근거가 제공됩니다. 진단 집계 정책이 확정될 때까지 반복 오답 횟수나 추정 신뢰도를 추가하지 않습니다.
- 호환 AI 버전(`641b080` 이상에서 계약 확인)과 마이그레이션 `1795650000000-TutorMessageMetadata`를 확인합니다. 신규 백엔드를 플래그가 꺼진 상태로 배포한 뒤 검증 환경에서 켭니다. 구형 FastAPI와 함께 사용할 때는 플래그를 끕니다.
- 기능 롤백은 플래그를 끄고 백엔드를 재시작합니다. JSONB 컬럼은 그대로 둡니다. 마이그레이션 `down`은 두 컬럼에 저장된 값을 제거하므로 기능 비활성화 수단으로 사용하지 않습니다.

후보에는 네 식별자만 전송합니다. AI `641b080`은 후보를 답변 생성 입력에 넣지 않고 답변 생성 뒤 추천 행동을 결정할 때 사용합니다. 실제 AI 답변의 자유 텍스트가 미제출 정답을 말하지 않는지는 별도 검증 범위입니다.
