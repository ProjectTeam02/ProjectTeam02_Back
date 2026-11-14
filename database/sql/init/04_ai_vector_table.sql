-- ai 스키마 벡터 테이블 (DB 담당 관리, #96)
-- 실행: 03_ai_tables.sql 다음에 1회. 관리자 계정(ai_user 멤버) 또는 ai_user로 실행 → 테이블 소유자는 항상 ai_user
--   로컬 Docker: docker-entrypoint-initdb.d가 01 → 02 → 03 → 04 순서로 자동 실행
--   RDS: psql -U <마스터> -d leren -v ON_ERROR_STOP=1 -f database/sql/init/04_ai_vector_table.sql
-- 기준: AI 서버의 LlamaIndex PGVectorStore(llama-index-vector-stores-postgres 0.9.x, use_jsonb=True, hybrid_search 없음)가
--   만드는 테이블과 컬럼·타입·인덱스 이름 1:1 (2026-11-14 RDS 실제 테이블과 동일함을 확인)
--   - 테이블 이름: data_<컬렉션> (컬렉션 = AI 설정 VECTOR_STORE_COLLECTION, 기본 projectteam02)
--   - 인덱스 이름: <컬렉션>_idx_1 (metadata_ ->> 'ref_doc_id')
--   - embedding 차원: AI 설정 EMBEDDING_DIMENSION (1536, openai/text-embedding-3-small)
-- AI 서버는 이 테이블을 만들지 않는다 (vector_store.py perform_setup=False). 컬렉션 이름·차원·LlamaIndex 버전을 바꿀 때는 DB 담당에게 먼저 알린다
-- 검색 성능 인덱스(HNSW·metadata)는 문서가 크게 늘면 database/sql/ai/vector_indexes.sql로 추가한다
-- 이 파일은 여러 번 실행해도 안전하다 (IF NOT EXISTS). 컬럼을 바꿀 때는 이 파일을 고치지 말고 database/sql/ai/에 변경 SQL을 추가한다
\set ON_ERROR_STOP 1

SET ROLE ai_user;
SET search_path = ai, public;

-- 실제 벡터 (청크 1개 = 1행). 검색은 metadata_의 review_status·knowledge_scope·concept_code 등으로 거른 뒤 embedding 유사도 순
CREATE TABLE IF NOT EXISTS ai.data_projectteam02 (
  id         bigserial    NOT NULL,
  text       varchar      NOT NULL,
  metadata_  jsonb,
  node_id    varchar,
  embedding  vector(1536),
  CONSTRAINT data_projectteam02_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS projectteam02_idx_1 ON ai.data_projectteam02 ((metadata_ ->> 'ref_doc_id'));

COMMENT ON TABLE  ai.data_projectteam02 IS 'RAG 벡터 (LlamaIndex PGVectorStore 구조). 청크 1개 = 1행, 정의는 백엔드 레포 04_ai_vector_table.sql';
COMMENT ON COLUMN ai.data_projectteam02.text IS '청크 본문';
COMMENT ON COLUMN ai.data_projectteam02.metadata_ IS 'document_id·chunk_id·review_status·knowledge_scope·concept_code·term 등. tutor.ai_message_sources가 document_id·chunk_id를 논리 참조';
COMMENT ON COLUMN ai.data_projectteam02.node_id IS 'LlamaIndex 노드 ID';
COMMENT ON COLUMN ai.data_projectteam02.embedding IS '임베딩 (openai/text-embedding-3-small, 1536차원). ai.rag_index_configurations와 같아야 함';

RESET ROLE;
