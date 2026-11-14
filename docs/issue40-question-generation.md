# #40 FastAPI 문제 생성 연동 — 모의 AI 검증 단계

## 이번 구현 범위

- 최신 develop 반영 후 기존 `/api/v1/internal/questions/drafts` 유지.
- 새 내부 API `POST /api/v1/internal/questions/generate` 추가.
- 실제 FastApiClient HTTP 통신, 응답 검증, 기존 Question/QuestionChoice 저장 재사용.
- 생성 요청은 기존 `app.ai_requests`에 `QUESTION_GEN`으로 기록. 스키마 변경 없음.
- 실제 AI/OpenRouter는 호출하지 않음. 운영 서버 및 공용 DB도 사용하지 않음.
- 관리자 검수/공개 API와 Stage 배정은 후속 범위. 이번 경로는 검수 대기까지만 처리.

## 요청과 응답

기존 내부 키 `x-question-import-key`와 생성 작업별 `Idempotency-Key` 헤더가 필요하며 최소 24자 서버 키가 미설정이면 비활성화된다.

```json
{
  "conceptId": "12345678-1234-4234-8234-123456789abc",
  "topic": "인플레이션",
  "difficulty": "EASY",
  "questionCount": 1,
  "learningObjectives": ["인플레이션의 의미를 설명할 수 있다"]
}
```

conceptId는 백엔드에서 유효한 개념인지 확인하고 유지한다. FastAPI에는 conceptId를 제외한
나머지 네 필드만 전송한다. 요청 수 범위는 AI 스키마와 같은 1~100이지만 실제 AI 서버의
설정 제한은 더 낮을 수 있다. 요청 처리 중 동기적으로 생성과 저장을 마친 뒤 201을 반환한다.
비동기 작업 큐/작업 조회 API는 이번 범위에 없다.

```json
{
  "success": true,
  "data": {
    "requestId": "생성 작업 UUID",
    "status": "COMPLETED",
    "questions": [{
      "questionId": "저장된 문제 UUID",
      "questionCode": "Q...",
      "conceptId": "요청의 conceptId",
      "status": "REVIEW_PENDING",
      "choiceCount": 4,
      "sourceDocumentIds": ["DOC-1"]
    }]
  }
}
```

## 변환 및 검증

- `question` → `questionText`.
- `choices` 문자열 배열 → 선택지 객체. `correctAnswerIndex`는 0~3이고 `baseOrder`는 1~4.
- `EASY/MEDIUM/HARD` → `BEGINNER/INTERMEDIATE/ADVANCED`.
- AI `questionType`은 개념/비교/상황/응용 분류. DB `questionType`은 선택형식이므로
  `MULTIPLE_CHOICE`로 저장하고 원본 분류/learningObjective/검증 이력/promptVersions는
  `AiRequest.knowledgeScope.generationResult`에 보존한다.
- AI `COMPLETED`, error 없음, 동일 주제/난이도, 요청한 문제 수, 학습 목표 일치,
  보기 4개/중복 없음, 정답 범위, 최종 독립 검증 APPROVE 및 정답 일치가 필요하다.
- AI 보기 허용 길이와 DB choice_text는 모두 500자다 (#97에서 255 → 500). 넘치는 응답은 거부하고
  임의로 자르지 않는다. 잘못된 AI 응답은 503이며 문제를 일부만 저장하지 않는다.

## 출처 ID는 문서 ID가 아니다

AI PR #22의 EvidenceSource는 source_id와 document_id를 구분한다. 응답에는 대응 정보가
없으므로 단순 복사는 하지 않는다. 서버가 관리하는 승인 근거 JSONL에서 문서 ID를 찾는다.

`QUESTION_GENERATION_EVIDENCE_PATH`는 AI 팀이 사용하는 승인 근거 파일의 검증된 복사본을
가리켜야 한다. HTTP 요청에서 이 경로나 매핑을 받지 않는다. 현재 어댑터는 다음 canonical
필드를 요구한다. AI의 nested metadata 등 다른 파일 포맷은 이 어댑터에 바로 넣지 않는다.

```json
{"source_id":"BOK-1","document_id":"DOC-1","document_version":"2026","review_status":"approved","content":"해당 문서의 검수된 실제 근거 본문"}
```

이 검증은 **승인 코퍼스에 실제 근거 레코드가 존재함**을 검사한다. 원격 AI DB를 조회하는
검증은 아니다. 실제 연동 전에 AI 팀과 파일의 문서 ID/버전이 실제 데이터와 일치하는지,
양쪽이 같은 코퍼스를 쓰는지 확인해야 한다. 확인 전에는 기능을 켜지 않는다.
알 수 없는 출처, 승인되지 않은 출처, 하나의 source_id에 다른 문서/버전이 대응하면 거부한다.
사용한 문서 ID/버전은 작업의 knowledgeScope.sourceDocuments에 함께 남긴다.

## 상태와 트랜잭션

- DB 작업 상태: `RESERVED` → `SUCCEEDED` 또는 `FAILED` (기존 enum 재사용).
- 성공 HTTP 응답의 작업 상태: `COMPLETED`.
- 문제 상태: 새 생성 경로는 `REVIEW_PENDING`. 기존 초안 적재는 `GENERATED` 유지.
- 모든 문제/선택지 저장과 작업 SUCCEEDED 변경은 한 트랜잭션이다.
- 생성/검증/저장 실패 시 문제는 남기지 않고 작업을 FAILED로 기록한다.
- DB 자체 장애로 실패 기록도 불가능하면 RESERVED가 남을 수 있다. 오류 응답에 작업 이력
  확인 필요를 알린다. 로컬 수동 복구 도구와 절차는 아래를 따른다. 자동 복구는 하지 않는다.
- 네트워크 호출 중 DB 트랜잭션을 열어두지 않는다. 자동 재시도/자동 재생성은 없다.
  같은 Idempotency-Key와 같은 요청 내용은 재실행하지 않는다. 실패한 작업도 같은 키로 AI를 다시 호출하지 않는다.
- 검수 대기 문제는 기존 학습자 조회 대상이 아니며 Stage도 자동 배정하지 않는다.
  향후 관리자가 검수/공개하고 StageQuestion을 연결하는 작업이 필요하다.

## 환경변수

- `QUESTION_GENERATION_ENABLED=false` 기본값. 실제 비용 승인 전 유지.
- `QUESTION_GENERATION_EVIDENCE_PATH`: 서버 승인 코퍼스 파일 경로.
- `QUESTION_GENERATION_TIMEOUT_MS=120000`: 생성 전용 타임아웃.
- 기존 `FASTAPI_BASE_URL`, `FASTAPI_INTERNAL_TOKEN`, `QUESTION_IMPORT_API_KEY` 재사용.
- 기존 튜터 타임아웃은 변경하지 않음.

실제 호출 설정을 만들거나 실제 키를 문서/테스트에 넣지 않는다. 이번 검증에서는 테스트
프로세스가 루프백 모의 AI 주소, 임시 근거 파일, 임의 테스트 키를 직접 설정하고 복구한다.

## 실행 및 검증

```sh
npm ci
npm test
npm run test:question-generation:pg
```

일반 `npm test`는 DB를 사용하지 않는다. PostgreSQL 통합 테스트는 설정이 없으면 스킵된다.
전용 npm 스크립트는 DB 패키지를 빌드하고 로컬 Docker 소켓을 확인한 뒤 `postgres:18`
임시 컨테이너를 만든다. 테스트는 컨테이너 이름/라벨/루프백 바인딩/tmpfs/새 DB를 확인하고
기존 migration을 적용한다. `.env`의 DB 주소는 테스트 대상으로 사용하지 않는다.
종료 시 이 실행기가 만든 라벨이 확인된 컨테이너만 제거하며 기존 볼륨은 삭제하지 않는다.
전용 실행기는 현재 Linux Codex 환경용이다.

검증 항목: 내부 인증/기능 비활성화/개념·출처 사전검사, 1·3·10문제 저장,
난이도/정답 변환, AI 응답 실패, 알 수 없는 출처, 검수 전 학습자 조회 차단,
중간 선택지 저장 실패/작업 완료 변경 실패 시 전체 롤백, 기존 초안 적재 호환성.
HTTP 클라이언트 별도 테스트는 타임아웃/연결 끊김/비정상 JSON/HTTP 오류도 검사한다.


## 동일 요청의 중복 실행 방지

`POST /generate`에 `Idempotency-Key`가 필수다. 공백 없는 ASCII 1~100자를 사용하고 UUID를
권장한다. 이 헤더는 백엔드에서만 사용하며 FastAPI PR #22의 요청 JSON/인증 계약은 바꾸지 않는다.
`POST /drafts`에는 이 헤더를 추가하지 않았다.

- 검증된 요청을 일정한 필드 순서로 직렬화하고 SHA-256으로 비교한다. conceptId는 비교 시
  소문자로 통일하고 문자열 앞뒤 공백은 기존 입력 검증에서 제거한다. 학습 목표 배열 순서는 유지한다.
- 최초 등록은 기존 ai_requests.idempotency_key UNIQUE 제약과 INSERT ON CONFLICT를 사용한다.
  예약 트랜잭션이 COMMIT된 뒤에만 AI를 호출한다. 조회 후 저장만 하는 메모리 잠금 방식이 아니다.
- 같은 키/다른 내용: 409 IDEMPOTENCY_PAYLOAD_CONFLICT. 같은 키/진행 중: 409 QUESTION_GENERATION_IN_PROGRESS.
- 완료된 작업: 최초 201 상태와 JSON 본문을 그대로 반환한다. HTTP Date 같은 전송 헤더는 재현하지 않는다.
- 실패한 작업: 최초에 기록한 503 상태와 JSON 본문을 그대로 반환한다. 새 키를 명시적으로 사용해야 새 생성을 시도한다.
- 입력 검증, 비활성화, 개념/근거 사전검사, 최초 예약 커밋 전 오류는 아직 등록된 작업이 아니므로
  같은 키로 사전 조건을 바로잡아 다시 시도할 수 있다. AI는 호출되지 않은 상태다.
- 기능 비활성화 상태에서는 재요청 결과 조회도 503으로 막힌다. 기능을 다시 켜도 같은 키는 재생성되지 않는다.
- 성공 응답은 knowledgeScope.idempotency.response = { httpStatus, body }로 보존한다. 기존
  generationInput/generationResult/sourceDocuments도 유지하며 DB 컬럼은 추가하지 않는다.
  이 응답과 문제/선택지 및 SUCCEEDED 변경은 같은 트랜잭션이다.
- 저장된 응답이 없는 SUCCEEDED 등 불일치는 새 AI 호출 없이 503으로 중단한다.
- 수동 종료 등으로 상태가 바뀐 작업은 늦은 실행이 완료/실패 상태를 덮어쓰지 못한다.
  완료의 RESERVED 조건부 변경이 실패하면 해당 실행이 삽입한 문제도 모두 롤백한다.

### 다른 AI 기능과 저장 키 분리의 현재 범위

문제 생성 DB 키는 QUESTION_GEN: + 원본 키의 SHA-256 64자리로 77자이며 varchar(100) 이내다.
동일한 원문 키를 튜터에서 사용하더라도 일반적인 저장 키는 다르다.
그러나 기존 튜터는 원문 키를 저장하므로, 원문이 이 77자 문자열과 정확히 같은 경우는
물리적 UNIQUE 충돌이 가능하다. 이때 requestType을 확인해 409 IDEMPOTENCY_NAMESPACE_CONFLICT로
중단하고 다른 기능의 결과를 반환하거나 행을 덮어쓰지 않는다.

신규 쓰기를 종류별 namespace로 완전히 통일하려면 튜터의 저장 경로도 바꿔야 한다.
이는 다른 팀원 기능 변경이므로 아직 적용하지 않았다. 과거 행도 일괄 변경하지 않는다.
공통 유틸리티는 이번에는 문제 생성 경로에서만 사용한다.

### 중단된 RESERVED의 로컬 수동 복구

스크립트: scripts/recover-question-generation.js. AI 호출/작업 삭제/키 재활성화는 하지 않는다.
빌드된 DB 패키지가 필요하다. 연결은 명시적인 QUESTION_RECOVERY_DB_CONFIG 환경변수의
JSON(host, port, database, username, password)으로만 받는다. host는 127.0.0.1만 허용한다.
비밀번호는 채팅/문서/명령 인자에 넣지 않고 프로세스 환경으로 설정한다.
기존 .env의 DB 주소/비밀번호로 자동 접속하지 않는다. 운영/공용 DB용 복구 도구가 아니다.

1. 작업 requestId를 받아 조회한다. 기본 실행은 변경하지 않는다.

```sh
node scripts/recover-question-generation.js <requestId>
```

2. 상태, reservedAt, 연결된 문제 수, recoverable을 확인한다. recoverable은 기술적 조건일 뿐
   AI 미처리 확인을 의미하지 않는다. 실제 처리 프로세스 중단 및 AI 측 처리 여부를 별도로 확인한다.
   시간 경과만으로 실패라고 단정하지 않는다. 문제 데이터가 있거나 상태가 불일치하면 적용하지 않는다.
3. 중단을 확인한 담당자가 조회 시각과 복구 사유를 명시해 실패로 종료한다.

```sh
node scripts/recover-question-generation.js <requestId> --mark-failed --confirm-worker-stopped --expected-reserved-at <조회한-reservedAt> --reason "확인한 중단 사유"
```

4. 도구는 QUESTION_GEN/RESERVED만 행 잠금 후 다시 확인한다. 시각/상태 불일치, 문제 존재,
   새 중복 방지 메타데이터 부재는 거부한다. 복구 시각/사유/upstreamOutcome=UNKNOWN과
   QUESTION_GENERATION_INTERRUPTED 응답을 기록한다. 같은 키는 이 실패를 계속 반환한다.
5. 새로운 생성이 정말 필요하면 새 키를 사용한다. 타임아웃 이전의 AI가 이미 처리했을 가능성과
   추가 호출 비용을 확인한 뒤 실행한다. 자동 재시도와 미확인 작업의 성공 복원은 제공하지 않는다.

주요 변경 파일: ai-idempotency.util.js, question-generation-request.repository.js,
question-generation.service.js, question.routes.js, Swagger, 위 복구 스크립트 및 관련 테스트.
튜터/인증 코드, DB 엔티티/마이그레이션은 변경하지 않았다.

추가 테스트: 동시 예약/진행 중 차단/내용 충돌/완료 응답 재현/AI 실패·타임아웃·DB 실패 후
같은 키 재요청, 예약 COMMIT 실패 시 AI 0회, 다른 요청 종류 충돌 차단,
수동 복구 CLI 조회·적용·접속 제한, 늦은 실행의 저장 차단.
