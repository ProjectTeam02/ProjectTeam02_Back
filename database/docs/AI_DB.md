# AI 관련 DB 현황과 멀티턴 메모리 (rev.7)

- 작성: 2026-11-02, DB 담당
- 기준: 백엔드 `main` e16d252 + 이 브랜치(`feat/ai-multiturn-db`), AI 레포 `main` 453ebea
- 결정: AI 관련 DB(app 스키마의 AI 테이블 + ai 스키마)는 **DB 담당이 모두 관리**. AI 파트는 멀티턴 로직을 구현하고, DB 구조 변경이 필요하면 DB 담당에게 요청

## 1. 전체 구성

```
┌─ app 스키마 (Node.js 소유, TypeORM 마이그레이션, app_user) ─────────────────────┐
│  ai_conversations ──< ai_messages ──< ai_message_sources                     │
│        │   └──< ai_conversation_summaries (rev.7)   └── summary_id (rev.7)   │
│        └──< ai_requests                                                      │
│  users ──< ai_user_memories (rev.7)                                          │
└──────────────────────────────────────────────────────────────────────────────┘
        │ document_id·chunk_id 논리 참조 (FK 없음)   ▲ app_user는 rag_documents만 SELECT
        ▼                                            │
┌─ ai 스키마 (소유자 ai_user, DDL은 DB 담당 SQL 파일) ─────────────────────────────┐
│  rag_documents ──< rag_document_chunks      rag_index_configurations        │
│  data_projectteam02 (LlamaIndex 벡터 테이블, AI 서버가 첫 적재 때 생성)         │
└──────────────────────────────────────────────────────────────────────────────┘
```

| 계정 | app 스키마 | ai 스키마 |
|---|---|---|
| `migrator` | 소유자 (마이그레이션) | 접근 불가 |
| `app_user` (Node) | 읽기·쓰기 | `rag_documents` SELECT만 (rev.7) |
| `ai_user` (FastAPI) | 접근 불가 | 소유자 (읽기·쓰기, 벡터 테이블 생성) |

AI 서버는 상태를 갖지 않습니다. 대화 기록·요약·장기 메모리는 Node가 app 스키마에서 읽어 내부 API 요청에 담아 보내고, 응답으로 받은 결과를 Node가 저장합니다.

## 2. 테이블별 역할

| 스키마 | 테이블 | 역할 | 쓰는 쪽 |
|---|---|---|---|
| app | `ai_conversations` | 대화방. `summary`·`summary_until_seq` = 현재 요약 | Node |
| app | `ai_messages` | 질문·답변. `sequence_no`, `rewritten_query`, `history_from_seq`, `token_count`, `summary_id`(rev.7) | Node |
| app | `ai_message_sources` | 답변별 인용 근거 (문서·청크·순위·점수) | Node |
| app | `ai_requests` | AI 호출 기록·비용·일일 한도 (`TUTOR`만 한도 집계, `SUMMARIZE`는 제외) | Node |
| app | **`ai_conversation_summaries`** (rev.7) | 요약 이력. 요약할 때마다 1행 추가 | Node |
| app | **`ai_user_memories`** (rev.7) | 대화방을 넘는 사용자 장기 메모리 | Node |
| ai | **`rag_documents`** (rev.7) | 원문 문서 메타 (제목, 출처, 검수 상태, content_hash) | AI 서버 (적재) |
| ai | **`rag_document_chunks`** (rev.7) | 청크 메타·본문 기록 (벡터 없음) | AI 서버 (적재) |
| ai | **`rag_index_configurations`** (rev.7) | 컬렉션별 임베딩 모델·차원 (불일치 시 적재 거부) | AI 서버 (적재) |
| ai | `data_projectteam02` | 실제 벡터 (id, text, metadata_, node_id, embedding vector(1536)) | LlamaIndex |

## 3. 원래 AI가 맡기로 해서 비어 있던 부분 → 이번 처리

| 항목 | 이전 상태 | rev.7 처리 |
|---|---|---|
| `rag_documents`·`rag_document_chunks`·`rag_index_configurations` | 레포에 DDL 없음. RDS에는 AI 서버 `create_tables()`로 이미 생성·적재됨 (2026-10-27~28, 문서 760·청크 1,400·벡터 1,400, 전부 approved·global, 1536차원) | `sql/init/03_ai_tables.sql` (AI SQLAlchemy 모델과 컬럼·제약·인덱스 이름 1:1). 이미 있는 DB에서는 3-1절이 기본값·CHECK만 추가 |
| 벡터 테이블 | 만들 주체가 정해지지 않음. `VECTOR_STORE_SCHEMA` 기본값이 `public`이라 그대로 두면 권한 오류 | LlamaIndex가 `ai_user`로 ai 스키마에 생성하는 것을 확인 (실제 실행). 적재 후 `sql/ai/vector_indexes.sql`로 HNSW + 검색 필터 인덱스 |
| 장기 메모리 `ai_user_memories` | AI `create_tables()`로 RDS ai 스키마에 빈 테이블(0행)이 생김. ai 스키마에 두면 users FK·탈퇴 삭제 불가 | **app 스키마**에 새로 설계 (users FK, 종류·upsert 키·상태). `ai.ai_user_memories`는 AI 파트 합의 후 삭제 |
| 요약 | `ai_conversations.summary` 컬럼만 있고 이력 없음. 어떤 요약으로 답했는지 기록 안 됨 | `ai_conversation_summaries` + `ai_messages.summary_id` |
| 근거 컬럼 길이 | app 100/100/50/255자 ↔ AI 255/255/100/500자 | app을 AI와 같게 확장 (데이터 보존 ALTER) |
| 백엔드 읽기 권한 | `app_user`가 ai 스키마 접근 불가 → "documentId 존재 검증" 규칙을 지킬 수 없음 | `ai.rag_documents` SELECT만 허용 (청크·벡터는 비공개) |
| ERD | ai 스키마 없음, 존재하지 않는 `ai.knowledge_documents`·`ai.document_concepts`를 주석에서 참조 | DBML 9절에 ai 스키마 추가, 주석 수정 |

## 4. 아직 비어 있는 것 (결정 필요)

| # | 항목 | 현재 | 누가 |
|---|---|---|---|
| 1 | 문서 ↔ 학습 개념 매핑 | BOK 문서는 `concept_code` 없이 `knowledge_scope=global`로만 적재. Node가 `knowledgeScope.conceptCodes`를 채우면 검색 0건. **당분간 빈 배열로 보내기** | AI 파트 결정 → 필요하면 DB 담당이 `ai.document_concepts` 추가 |
| 2 | 출처 링크 표시 | 앱에 원문 링크를 보여줄지 미정 | 기획. 보여주면 `ai_message_sources.source_url_snapshot` 추가 |
| 3 | `rag_document_chunks.embedding` | AI 코드가 항상 null로 저장 (벡터는 LlamaIndex 테이블) | AI 모델에서 빼면 DB에서도 삭제 |
| 4 | ~~회원 탈퇴 시 AI 대화~~ | **결정(2026-11-03): 행은 남기고 본문만 비움** (5.3절 SQL). FK 삭제 동작은 바꾸지 않음 | 완료 |
| 5 | 메모리·요약 계약 | 5.4절 제안 (요청 `memories[]`, 응답 `summaryUpdate`·`memoryUpdates[]`) | AI 파트 + Node 합의 |
| 6 | AI 레포 레거시 정리 | `app/db/models.py`의 `AIConversation`·`AIMessage`·`AIMessageSource`·`AIUserMemory`, `migrations/001·003·004`. `create_tables()`가 `AIUserMemory`를 ai 스키마에 만듦 | AI 파트: `create_tables` 목록에서 `AIUserMemory` 제거, `/memory` 라우터는 Node 계약으로 대체 |
| 7 | Node `tutor.service.js` | history를 오래된 순 50개로 가져옴, 실패 메시지 포함, PENDING 답변 행을 먼저 만들지 않음, 저장이 한 트랜잭션이 아님 | 백엔드 담당 (5.2절 규칙대로 수정) |
| 8 | RDS 적재 | 03 적용 후 승인 문서 적재 → `vector_indexes.sql` | DB 담당 + AI 파트 일정 |

## 5. 멀티턴 메모리 DB 사용법

### 5.1 메모리 3단계

| 단계 | 저장 위치 | 언제 쓰나 | 누가 만드나 |
|---|---|---|---|
| ① 최근 대화 | `ai_messages` (요약 이후 + COMPLETED) | 매 턴. 대명사·생략 해석 | Node (질문·답변 저장) |
| ② 요약 | `ai_conversation_summaries` → `ai_conversations.summary` | 요약 안 된 메시지가 많아질 때 (예: 16개 초과, 최근 6~8개는 원문 유지) | AI 서버가 생성, Node 저장 |
| ③ 장기 메모리 | `ai_user_memories` (ACTIVE) | 매 턴. 설명 방식·오개념·목표 개인화 | AI 서버가 추출, Node 저장 |

### 5.2 한 턴의 DB 흐름 (Node)

```sql
-- (1) 트랜잭션 A: 한도 예약 + USER 메시지 + ASSISTANT PENDING 행 (같은 대화방 동시 요청은 uq_ai_messages_one_pending_answer로 거부 → 409)
INSERT INTO ai_requests (...) VALUES (... 'TUTOR', 'RESERVED' ...);
INSERT INTO ai_messages (conversation_id, sequence_no, role, content, client_message_id, status, request_id) VALUES (:c, :n, 'USER', :q, :cm, 'PENDING', :r);
INSERT INTO ai_messages (conversation_id, sequence_no, role, content, status, request_id, parent_message_id) VALUES (:c, :n+1, 'ASSISTANT', '', 'PENDING', :r, :userMsgId);

-- (2) 요청에 담을 데이터
-- 현재 요약
SELECT summary, summary_until_seq FROM ai_conversations WHERE conversation_id = :c;
SELECT summary_id FROM ai_conversation_summaries WHERE conversation_id = :c AND summary_until_seq = :untilSeq;
-- 최근 대화: 요약 이후, 완료된 것만, 최신 20개를 오래된 순으로
SELECT sequence_no, role, content FROM (
  SELECT sequence_no, role, content FROM ai_messages
  WHERE conversation_id = :c AND sequence_no > coalesce(:untilSeq, 0) AND status = 'COMPLETED'
  ORDER BY sequence_no DESC LIMIT 20) t ORDER BY sequence_no;
-- 장기 메모리: ACTIVE, 최근 수정 순 10개
SELECT memory_id, memory_type, content, concept_code FROM ai_user_memories
WHERE user_id = :u AND status = 'ACTIVE' ORDER BY updated_at DESC LIMIT 10;

-- (3) 트랜잭션 B: 응답 저장
UPDATE ai_messages SET status = 'COMPLETED', content = :answer, grounding_status = :g, history_from_seq = :h,
       summary_id = :summaryIdSent, token_count = :outTokens, completed_at = now() WHERE message_id = :assistantMsgId;
UPDATE ai_messages SET status = 'COMPLETED', rewritten_query = :rq, completed_at = now() WHERE message_id = :userMsgId;
INSERT INTO ai_message_sources (...) VALUES (...);   -- sources[] N행
UPDATE ai_requests SET status = 'SUCCEEDED', ... WHERE request_id = :r;
UPDATE ai_user_memories SET last_used_at = now() WHERE memory_id = ANY(:sentMemoryIds);
UPDATE ai_conversations SET updated_at = now() WHERE conversation_id = :c;
-- 실패(401/422/503/504): 두 메시지 FAILED + error_code, ai_requests FAILED(또는 RELEASED로 한도 반환)
```

### 5.3 요약·메모리 저장

```sql
-- 요약 저장 (응답에 summaryUpdate가 있을 때). 조건부 UPDATE로 동시 갱신 충돌 방지 → 0행이면 롤백하고 무시
BEGIN;
INSERT INTO ai_conversation_summaries (conversation_id, summary_until_seq, content, token_count, request_id)
VALUES (:c, :newUntil, :summary, :tokens, :r);
UPDATE ai_conversations SET summary = :summary, summary_until_seq = :newUntil
WHERE conversation_id = :c AND summary_until_seq IS NOT DISTINCT FROM :oldUntil;
COMMIT;

-- 메모리 추가·갱신 (memory_key가 있으면 upsert)
INSERT INTO ai_user_memories (user_id, memory_type, memory_key, content, concept_code, confidence, source_message_id)
VALUES (:u, :type, :key, :content, :concept, :conf, :userMsgId)
ON CONFLICT (user_id, memory_type, memory_key)
DO UPDATE SET content = EXCLUDED.content, confidence = EXCLUDED.confidence, source_message_id = EXCLUDED.source_message_id,
              status = 'ACTIVE', archived_at = NULL, updated_at = now();

-- 메모리 해제 (오개념을 바로잡았을 때 등): 삭제 대신 보관
UPDATE ai_user_memories SET status = 'ARCHIVED', archived_at = now(), updated_at = now() WHERE memory_id = :m AND user_id = :u;

-- 회원 탈퇴 (행은 남기고 본문만 비움, 한 트랜잭션)
UPDATE ai_messages SET content = '', rewritten_query = NULL, summary_id = NULL
 WHERE conversation_id IN (SELECT conversation_id FROM ai_conversations WHERE user_id = :u);
DELETE FROM ai_conversation_summaries
 WHERE conversation_id IN (SELECT conversation_id FROM ai_conversations WHERE user_id = :u);   -- 요약 본문은 빈 값 불가라 삭제
UPDATE ai_conversations SET title = NULL, summary = NULL, summary_until_seq = NULL WHERE user_id = :u;
DELETE FROM ai_user_memories WHERE user_id = :u;                                                 -- 빈 메모리는 의미가 없어 삭제
-- ai_message_sources(문서 참조)·ai_requests(토큰·비용)는 개인 내용이 없어 그대로 유지
```

| 규칙 | DB가 막는 것 |
|---|---|
| 요약은 1 ~ `summary_until_seq` 누적 요약, 12,000자 이하 | 같은 대화·같은 `summary_until_seq` 중복, 빈 요약, 12,000자 초과 |
| `ai_conversations.summary`와 `summary_until_seq`는 같이 채움 | 하나만 있는 행 |
| 메모리 한 문장 500자 이하, 신뢰도 0~1 | 범위 밖 값, 같은 (사용자, 종류, 키) 중복 |
| ARCHIVED면 `archived_at` 기록 | 상태·시각 불일치 |

### 5.4 내부 API 계약 추가 제안 (AI 파트와 합의 필요)

```jsonc
// 요청 (기존 필드 + memories)
{
  "summary": "학습자는 기준금리 개념을 물었고 ...", "summaryUntilSeq": 12,
  "history": [{ "sequenceNo": 13, "role": "USER", "content": "..." }],
  "memories": [
    { "memoryId": "uuid", "memoryType": "MISCONCEPTION", "content": "금리가 오르면 예금이자가 준다고 생각함", "conceptCode": "C-RATE" },
    { "memoryId": "uuid", "memoryType": "PREFERENCE", "content": "예시를 들어 설명하면 잘 이해함", "conceptCode": null }
  ]
}
// 응답 (기존 필드 + 선택 필드 2개)
{
  "summaryUpdate": { "summary": "...", "summaryUntilSeq": 20, "tokenCount": 310 },      // 요약을 새로 만들었을 때만
  "memoryUpdates": [
    { "action": "UPSERT", "memoryType": "MISCONCEPTION", "memoryKey": "C-RATE", "content": "...", "conceptCode": "C-RATE", "confidence": 0.8 },
    { "action": "ARCHIVE", "memoryId": "uuid" }
  ]
}
```

- 요약을 답변과 따로 만들고 싶으면 `POST /internal/v1/tutor/summarize`로 분리하고, Node는 `ai_requests.request_type = SUMMARIZE`로 기록합니다 (일일 한도 제외). 어느 방식이든 테이블은 같습니다.
- 길이: `memoryType`은 Enum 4개 값, `memoryKey` 100자, `content` 500자, `conceptCode` 30자, `summary` 12,000자.

## 6. AI 서버 설정·전달 사항

1. 환경변수: `DATABASE_URL`은 `ai_user`, **`VECTOR_STORE_SCHEMA=ai`**, `VECTOR_STORE_COLLECTION=projectteam02` (바꾸면 DB 담당에게 알려서 인덱스 스크립트를 그 이름으로 실행)
2. RDS에서 `create_tables()`, `migrations/*.sql`을 실행하지 않음. ai 테이블 구조를 바꿀 때는 SQLAlchemy 모델 수정 전에 DB 담당에게 공유 → `database/sql/ai/`에 변경 SQL 추가
3. 첫 적재가 끝나면 DB 담당에게 알림 → `vector_indexes.sql` 실행 (HNSW cosine + `review_status`·`knowledge_scope`·`concept_code`·`concept_id`·`stage_id`·`term` 인덱스)
4. app 스키마(대화·요약·메모리)에는 접근하지 않음. 필요한 데이터는 Node 요청으로 받음

## 7. 적용 순서

```bash
# 로컬 (Docker): 볼륨이 이미 있으면 03만 수동 실행 (AI 서버가 먼저 테이블을 만들었어도 실행 가능)
docker compose exec -T db psql -U postgres -d leren -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/03_ai_tables.sql
npm run db:migrate && npm run db:check

# RDS (EC2에서, 적용 전 수동 스냅샷 leren-before-ai-multiturn-YYYYMMDD)
psql -h <RDS> -U <마스터> -d leren -v ON_ERROR_STOP=1 -f database/sql/init/03_ai_tables.sql
npm run db:migrate && npm run db:migrate:show && npm run db:check
# 벡터가 약 1만 개를 넘으면 (2026-11-03 기준 1,400개 → 아직 불필요)
psql -h <RDS> -U ai_user -d leren -v ON_ERROR_STOP=1 -v collection=projectteam02 -f database/sql/ai/vector_indexes.sql
# AI 파트 합의 후 (빈 테이블 확인: SELECT count(*) FROM ai.ai_user_memories; → 0)
# SET ROLE ai_user; DROP TABLE ai.ai_user_memories;
```

## 8. 검증 (로컬 PostgreSQL 16.15 + pgvector 0.6, 운영과 같은 계정 구조)

| 항목 | 결과 |
|---|---|
| 빈 DB: 01 → 02 → 03 → 마이그레이션 3개 | 통과, `db:check` 차이 없음, 엔티티 42개 로드 |
| 기존 DB(rev.6 + 데이터)에 rev.7 적용 | 통과, `ai_message_sources` 기존 값 보존 |
| 요약 짝이 맞지 않는 기존 행이 있을 때 | 안내 메시지와 함께 중단, DB 변경 없음 |
| 되돌리기 → 다시 실행 | 통과 |
| SQL 제약 테스트 (app_user) | **66/66 PASS** (rev.7 추가 19개, 탈퇴 비우기 절차 5개 포함) |
| ai 스키마 테스트 (ai_user) | **8/8 PASS** |
| ai RAG 테이블 테스트 (ai_user) | **12/12 PASS** |
| 연동 테스트 | 19/19 PASS |
| AI 레포 코드로 실제 저장 | `RAGDocumentRepository`(설정 저장·불일치 거부, 문서·청크 저장·재적재, 해시 조회) 통과. LlamaIndex `PGVectorStore`가 `ai_user`로 `ai.data_projectteam02` 생성·저장·필터 검색 통과 |
| `vector_indexes.sql` | 인덱스 7개 생성, 다시 실행해도 안전, 테이블이 없으면 안내 후 중단 |
| 03 다시 실행 (관리자·ai_user 모두) | 통과, 소유자 항상 `ai_user` |
| DBML 파싱 (@dbml/core) | 통과, 테이블 45개 (app 42 + ai 3) |
