# 개인 복습 API 연동 가이드

공통 경로는 `/api/v1`이며 모든 요청에 `Authorization: Bearer <accessToken>`이 필요합니다. 신규 시작과 재개는 같은 응답 본문을 사용합니다.

| API | 성공 | 동작 |
| --- | --- | --- |
| `GET /reviews/due?date=YYYY-MM-DD` | 200 | 요청 날짜 이하의 본인 자동 임무를 반환합니다. 날짜 생략 시 서울의 오늘입니다. 미래 조회로 미래 임무가 `AVAILABLE`이 되지는 않습니다. |
| `POST /reviews/missions/{missionId}/attempts` | 201 / 200 | 서울의 예정일 당일부터 시작할 수 있습니다. 같은 임무의 진행 중 응시를 재개하며 완료된 임무는 `409`입니다. |
| `POST /reviews/attempts` | 201 / 200 | 직접 복습입니다. 본인 진행 중 직접 응시가 있으면 재개하고, 없으면 공개 오답·북마크 문항을 최대 5개 고릅니다. 완료 후 다시 시작할 수 있습니다. |
| `GET /review-attempts/{reviewAttemptId}` | 200 | 본인 응시의 저장된 문항, 보기 및 제출 상태를 읽습니다. |
| `POST /review-attempts/{reviewAttemptId}/answers` | 200 | 서버가 채점하고 갱신된 응시와 `result`를 반환합니다. 동일 슬롯과 선택지로 재전송하면 `result.duplicate: true`가 추가됩니다. |

## 시작과 재개

두 시작 요청은 JSON 본문이나 query 없이 보냅니다. **201은 새 응시**, **200은 저장된 응시**입니다. 같은 시작 요청을 연속 또는 동시로 보내거나, 응답을 받지 못해 다시 요청해도 진행 중인 응시가 유지됩니다.

```http
POST /api/v1/reviews/attempts
Authorization: Bearer <accessToken>
```

201 응답 예시는 공개 문항이 한 건인 직접 복습입니다.

```json
{
  "success": true,
  "data": {
    "reviewAttemptId": "123e4567-e89b-42d3-a456-426614174001",
    "missionId": null,
    "status": "IN_PROGRESS",
    "reviewType": "RECOMMENDED",
    "entryPoint": "REVIEW_NOTE",
    "conceptCode": null,
    "questionCount": 1,
    "submittedCount": 0,
    "correctCount": 0,
    "startedAt": "2026-11-24T02:00:00.000Z",
    "completedAt": null,
    "answers": [
      {
        "submissionId": "123e4567-e89b-42d3-a456-426614174002",
        "questionId": "123e4567-e89b-42d3-a456-426614174003",
        "sequenceNo": 1,
        "question": {
          "questionId": "123e4567-e89b-42d3-a456-426614174003",
          "questionCode": "ECON-INTEREST-01",
          "question": "연이율이 같을 때, 단리의 이자액을 늘리는 조건은 무엇인가요?",
          "difficulty": "BEGINNER",
          "conceptId": "123e4567-e89b-42d3-a456-426614174004",
          "choices": [
            { "choiceId": "123e4567-e89b-42d3-a456-426614174005", "label": "A", "content": "기간이 길어진다." },
            { "choiceId": "123e4567-e89b-42d3-a456-426614174006", "label": "B", "content": "원금이 줄어든다." },
            { "choiceId": "123e4567-e89b-42d3-a456-426614174007", "label": "C", "content": "기간이 짧아진다." },
            { "choiceId": "123e4567-e89b-42d3-a456-426614174008", "label": "D", "content": "이율이 내려간다." }
          ]
        },
        "isSubmitted": false,
        "choiceId": null,
        "isCorrect": null,
        "explanation": null
      }
    ]
  }
}
```

자동 복습은 `POST /api/v1/reviews/missions/{missionId}/attempts`를 호출합니다. 신규 자동 응시의 `reviewType`은 `AUTO`, `entryPoint`는 `HOME`이며 `missionId`와 `conceptCode`가 채워집니다.

## 표시와 채점

1. `answers`는 `sequenceNo` 순서입니다. `isSubmitted === false`인 첫 슬롯에서 문제 본문 `question.question`과 `question.choices`를 표시합니다. 보기 배열은 응시에 저장된 순서이며 `label`로 다시 정렬하거나 앱에서 섞지 않습니다.
2. 슬롯의 `submissionId`와 `questionId`, 선택한 `choiceId`를 아래처럼 전송합니다. `submissionId`는 서버가 시작 시 발급한 값입니다. 재시도할 때도 동일한 세 값을 사용합니다.

```http
POST /api/v1/review-attempts/123e4567-e89b-42d3-a456-426614174001/answers
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "submissionId": "123e4567-e89b-42d3-a456-426614174002",
  "questionId": "123e4567-e89b-42d3-a456-426614174003",
  "choiceId": "123e4567-e89b-42d3-a456-426614174005"
}
```

3. 채점 응답은 시작 응답과 같은 응시 필드 전체에 `data.result`를 추가합니다. 한 문항으로 시작한 위 응시가 완료된 200 응답 예시입니다.

```json
{
  "success": true,
  "data": {
    "reviewAttemptId": "123e4567-e89b-42d3-a456-426614174001",
    "missionId": null,
    "status": "COMPLETED",
    "reviewType": "RECOMMENDED",
    "entryPoint": "REVIEW_NOTE",
    "conceptCode": null,
    "questionCount": 1,
    "submittedCount": 1,
    "correctCount": 1,
    "startedAt": "2026-11-24T02:00:00.000Z",
    "completedAt": "2026-11-24T02:00:10.000Z",
    "answers": [
      {
        "submissionId": "123e4567-e89b-42d3-a456-426614174002",
        "questionId": "123e4567-e89b-42d3-a456-426614174003",
        "sequenceNo": 1,
        "question": {
          "questionId": "123e4567-e89b-42d3-a456-426614174003",
          "questionCode": "ECON-INTEREST-01",
          "question": "연이율이 같을 때, 단리의 이자액을 늘리는 조건은 무엇인가요?",
          "difficulty": "BEGINNER",
          "conceptId": "123e4567-e89b-42d3-a456-426614174004",
          "choices": [
            { "choiceId": "123e4567-e89b-42d3-a456-426614174005", "label": "A", "content": "기간이 길어진다." },
            { "choiceId": "123e4567-e89b-42d3-a456-426614174006", "label": "B", "content": "원금이 줄어든다." },
            { "choiceId": "123e4567-e89b-42d3-a456-426614174007", "label": "C", "content": "기간이 짧아진다." },
            { "choiceId": "123e4567-e89b-42d3-a456-426614174008", "label": "D", "content": "이율이 내려간다." }
          ]
        },
        "isSubmitted": true,
        "choiceId": "123e4567-e89b-42d3-a456-426614174005",
        "isCorrect": true,
        "explanation": "이율과 원금이 같으면 단리 이자는 기간에 비례합니다."
      }
    ],
    "result": {
      "isCorrect": true,
      "explanation": "이율과 원금이 같으면 단리 이자는 기간에 비례합니다."
    }
  }
}
```

4. 채점된 선택의 정오와 해설은 `result`를 표시합니다. 별도의 정답 보기 ID는 제공되지 않습니다. 이후 화면은 항상 응답의 `answers`에서 다음 미제출 슬롯을 찾고, `status === "COMPLETED"`면 종료 화면을 표시합니다. 이때 자동 복습 임무의 최초 완료 시각이 기록됩니다.

## 앱을 다시 열었을 때

201 또는 200을 받으면 현재 사용자와 복습 흐름에 묶어 `reviewAttemptId`를 보관합니다. 같은 사용자로 다시 들어오면 기존 ID로 `GET /review-attempts/{reviewAttemptId}`를 호출합니다. 첫 미제출 슬롯부터 이어 풀고, 이미 완료됐다면 저장된 결과를 표시합니다. 시작 응답을 못 받아 ID를 잃었고 응시가 진행 중이라면, 같은 자동 임무 또는 직접 시작 경로의 재호출에서 ID를 다시 받을 수 있습니다. 로그아웃 또는 계정 변경 때는 해당 사용자의 저장 정보를 구분합니다.

| HTTP | 앱 처리 |
| --- | --- |
| 401 | 인증 상태를 확인합니다. |
| 404 | 본인이 조회할 수 있는 임무·응시가 없거나, 응시에 공개가 철회된 문항이 있습니다. 목록을 갱신합니다. |
| 409 | 예정일 전, 자동 임무 완료, 출제 가능한 문항 없음, 다른 답을 재제출한 경우 등이 포함됩니다. 해당 임무·응시 상태를 조회해 화면을 결정합니다. |
| 422 | 요청 형식이나 해당 슬롯에서 고른 보기 ID를 확인합니다. |
| 503 | 공개 문항의 보기·정답 구성이나 저장된 보기 구성이 유효하지 않거나 일시적인 서비스 오류입니다. 임의의 다른 문항이나 보기로 교체하지 않습니다. |

## 저장 범위

문항과 보기는 각 응시에 저장된 `questionId`와 선택지 ID 순서를 사용합니다. 복습 노트의 최신 문항으로 바꾸지 않습니다. 같은 ID의 문항 본문·보기 문구·해설이 운영 과정에서 직접 수정되면 현재 값이 반영됩니다. 시작 당시 텍스트까지 완전히 보존하는 문항 버전 또는 스냅숏은 별도 개선입니다.

기존 중복 응시는 유지합니다. 진행 중 후보가 여러 개라면 시작 시각, 응시 ID 순으로 한 건을 선택해 재개합니다. 기존 별도 응시가 나중에 완료돼도 자동 임무의 첫 완료 시각은 유지합니다. 이번 API 변경에 DB 마이그레이션이나 새 경로는 필요하지 않습니다.
