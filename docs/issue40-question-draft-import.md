# Issue #40 — 문제 초안 적재 API (1차)

이 단계는 **AI가 이미 생성한 객관식 문제를 백엔드가 검증·저장하는 기능**이다.
실제 FastAPI 문제 생성 호출, 최종 검수/승인, Stage 문항 배정, 공개 조회는 포함하지 않는다.
`src/modules/quizzes`의 기존 API는 변경하지 않는다.

## 내부 API (AI 팀과 계약 합의 전 임시 제안)

`POST /api/v1/internal/questions/drafts`

- 요청 헤더: `x-question-import-key: <QUESTION_IMPORT_API_KEY>` (서버끼리 전용, 절대 앱에 노출 금지)
- 서버 환경변수: `QUESTION_IMPORT_API_KEY` (24자 이상의 예측 불가능한 값, 미설정이면 503)
- **운영 환경에서 HTTPS/TLS 및 네트워크 접근 제한을 적용해야 한다. HTTP로 토큰을 전송하지 말 것.**
- 문제 상태는 항상 `GENERATED` (비공개). 클라이언트 입력으로 `PUBLISHED` 지정 불가능.
- 선택지는 정확히 4개, 정답은 1개, 설명 및 근거 문서 ID 필수.
- 개념 ID는 기존 DB의 UUID이며, 새 DB 엔티티나 마이그레이션은 만들지 않음.

예시 요청 (실제 AI 결과가 아닌 API 형식 예시):

```json
{
  "conceptId": "12345678-1234-4234-8234-123456789abc",
  "questionText": "기회비용의 의미로 가장 알맞은 것은?",
  "explanation": "포기한 대안 중 가장 가치가 큰 것을 의미합니다.",
  "difficulty": "BEGINNER",
  "sourceDocumentIds": ["bok2026-0161"],
  "choices": [
    {"text": "생산에 들어간 비용", "isCorrect": false},
    {"text": "포기한 대안 중 가장 가치 있는 것", "isCorrect": true},
    {"text": "물가 상승률", "isCorrect": false},
    {"text": "은행 대출 이자", "isCorrect": false}
  ]
}
```

`conceptId`는 예시 UUID다. **로컬 DB의 실제 conceptId로 바꾸지 않으면 404가 반환된다.**

성공 시 `201` + `{ "success": true, "data": { "questionId", "questionCode", "conceptId", "status": "GENERATED", "choiceCount": 4, "sourceDocumentIds" } }`.

## 구현 보장 범위

- 입력 검증 (4지선다, 정답 1개, 중복 선택지, 난이도, 출처)
- Concept FK 존재 확인
- Question + QuestionChoice 4개 **트랜잭션** 저장
- 생성 상태 `GENERATED` 고정 및 정답을 201 응답에 노출하지 않음
- 내부 인증키가 없으면 사용 불가

## 후속 협의 및 테스트 사항

1. AI 팀과 실제 생성 API 요청·응답 필드/호출 방향/timeout 합의. 현재 AI 저장소의 `prepare_question_generation`은 프롬프트 준비만 수행함.
2. AI 생성 결과의 근거 ID가 **검수·출처·라이선스 승인을 받은 자료인지** 검증하는 연결 규칙.
3. 동일 요청의 재시도 시 중복 생성 방지 (idempotency key / `ai_requests` 연동).
4. 사람 검수 후 `APPROVED`/`PUBLISHED` 상태 전환 및 `stage_questions` 배정 로직.
5. 사용자 조회 API는 문제 공개 시 정답·해설 비노출 처리 여부를 확인해야 함. 현재 레거시 `GET /quizzes/generate`는 `APPROVED` 조회 및 해설 노출 부분이 있어 별도 조정 필요.
6. 로컬 PostgreSQL에서 실제 저장·롤백 검증, 전체 `npm test` 회귀 테스트, 보안 검토 후에만 PR 제출.

테스트: `node --test test/question-draft-import.test.js` (DB 없이 스텁 기반). `npm test`는 실제 프로젝트에서 별도 수행.

> **주의** 운영 AWS 서버에 샘플 문제를 등록하지 말 것. 검증 전 배포/머지 금지.
