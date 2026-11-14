-- ai 스키마 RAG 메타 테이블 (rev.7, DB 담당 관리)
-- 실행: 02_ai_schema.sql 다음에 1회. 관리자 계정(ai_user 멤버) 또는 ai_user로 실행 → 테이블 소유자는 항상 ai_user
--   로컬 Docker: docker-entrypoint-initdb.d가 01 → 02 → 03 순서로 자동 실행
--   RDS: psql -U <마스터> -d leren -v ON_ERROR_STOP=1 -f database/sql/init/03_ai_tables.sql
-- 기준: ProjectTeam02_AI app/db/models.py (RAGDocument, RAGChunk, RAGIndexConfiguration)와 컬럼·타입·제약·인덱스 이름 1:1
--   + 서버 기본값(id, metadata_json)과 CHECK 추가 (AI 코드가 값을 넣으므로 동작은 같음)
-- 여기서 만들지 않는 것
--   - 벡터 테이블 ai.data_projectteam02: 04_ai_vector_table.sql (LlamaIndex PGVectorStore 구조와 1:1, #96)
--   - ai_conversations·ai_messages·ai_message_sources·ai_requests·ai_user_memories: app 스키마(Node 소유, TypeORM 마이그레이션)
-- 이 파일은 여러 번 실행해도 안전하다 (IF NOT EXISTS). AI 서버가 테이블을 먼저 만든 DB(RDS)에서도 실행 가능 → 3-1에서 기본값·CHECK만 보완
-- 컬럼을 바꿀 때는 이 파일을 고치지 말고 database/sql/ai/에 변경 SQL을 추가한다
\set ON_ERROR_STOP 1

SET ROLE ai_user;
SET search_path = ai, public;

-- 1. 문서 메타 (원문 1개 = 1행). 승인(review_status)된 문서만 검색 대상
CREATE TABLE IF NOT EXISTS ai.rag_documents (
  document_id    varchar(255)  NOT NULL,
  source_id      varchar(255)  NOT NULL,
  title          varchar(500)  NOT NULL,
  source         varchar(1000) NOT NULL,
  source_url     varchar(2000),
  version        varchar(100),
  concept_id     varchar(255),
  stage_id       varchar(255),
  review_status  varchar(30)   NOT NULL DEFAULT 'approved',
  published_at   timestamptz,
  updated_at     timestamptz,
  license        varchar(255),
  content_hash   varchar(64)   NOT NULL,
  metadata_json  jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT rag_documents_pkey PRIMARY KEY (document_id),
  CONSTRAINT chk_rag_documents_content_hash CHECK (char_length(content_hash) = 64)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_rag_documents_content_hash ON ai.rag_documents (content_hash);
CREATE INDEX IF NOT EXISTS ix_rag_documents_source_id     ON ai.rag_documents (source_id);
CREATE INDEX IF NOT EXISTS ix_rag_documents_concept_id    ON ai.rag_documents (concept_id);
CREATE INDEX IF NOT EXISTS ix_rag_documents_stage_id      ON ai.rag_documents (stage_id);
CREATE INDEX IF NOT EXISTS ix_rag_documents_review_status ON ai.rag_documents (review_status);

-- 2. 청크 메타 (감사·출처용 기록). 실제 벡터는 LlamaIndex 테이블(ai.data_<컬렉션>)에만 있음
CREATE TABLE IF NOT EXISTS ai.rag_document_chunks (
  id             uuid          NOT NULL DEFAULT gen_random_uuid(),
  document_id    varchar(255)  NOT NULL,
  chunk_id       varchar(255)  NOT NULL,
  content        text          NOT NULL,
  metadata_json  jsonb         NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT rag_document_chunks_pkey PRIMARY KEY (id),
  CONSTRAINT uq_rag_document_chunk UNIQUE (document_id, chunk_id),
  CONSTRAINT rag_document_chunks_document_id_fkey FOREIGN KEY (document_id)
    REFERENCES ai.rag_documents (document_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_rag_document_chunks_document_id ON ai.rag_document_chunks (document_id);

-- 3. 컬렉션별 임베딩 설정 (모델·차원이 바뀌면 AI 서버가 적재를 거부 → 다른 모델 벡터가 섞이지 않음)
CREATE TABLE IF NOT EXISTS ai.rag_index_configurations (
  collection_name      varchar(255) NOT NULL,
  embedding_provider   varchar(100) NOT NULL,
  embedding_model      varchar(255) NOT NULL,
  embedding_dimension  integer      NOT NULL,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT rag_index_configurations_pkey PRIMARY KEY (collection_name),
  CONSTRAINT chk_rag_index_dimension CHECK (embedding_dimension > 0)
);

-- 3-1. 이미 있는 테이블 맞춤 (AI 서버 create_tables()로 먼저 만든 경우, 예: RDS 2026-10-27~28 적재분)
--      위 CREATE TABLE IF NOT EXISTS는 기존 테이블을 건너뛰므로, 기본값·CHECK만 여기서 추가한다 (데이터 변경 없음, 다시 실행해도 안전)
ALTER TABLE ai.rag_document_chunks ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ai.rag_document_chunks ALTER COLUMN metadata_json SET DEFAULT '{}'::jsonb;
ALTER TABLE ai.rag_documents ALTER COLUMN metadata_json SET DEFAULT '{}'::jsonb;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rag_documents_content_hash' AND conrelid = 'ai.rag_documents'::regclass) THEN
    IF EXISTS (SELECT 1 FROM ai.rag_documents WHERE char_length(content_hash) <> 64) THEN
      RAISE EXCEPTION 'ai.rag_documents에 content_hash가 64자가 아닌 행이 있습니다. 확인 후 다시 실행하세요.';
    END IF;
    ALTER TABLE ai.rag_documents ADD CONSTRAINT chk_rag_documents_content_hash CHECK (char_length(content_hash) = 64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rag_index_dimension' AND conrelid = 'ai.rag_index_configurations'::regclass) THEN
    IF EXISTS (SELECT 1 FROM ai.rag_index_configurations WHERE embedding_dimension <= 0) THEN
      RAISE EXCEPTION 'ai.rag_index_configurations에 embedding_dimension이 0 이하인 행이 있습니다.';
    END IF;
    ALTER TABLE ai.rag_index_configurations ADD CONSTRAINT chk_rag_index_dimension CHECK (embedding_dimension > 0);
  END IF;
END $$;

COMMENT ON TABLE  ai.rag_documents IS 'RAG 원문 문서 메타. tutor.ai_message_sources.document_id가 논리 참조';
COMMENT ON COLUMN ai.rag_documents.review_status IS '검수 상태. AI 설정 approved_review_status(기본 approved)인 문서만 검색';
COMMENT ON COLUMN ai.rag_documents.concept_id IS '연결된 학습 개념 (현재 BOK 문서는 null, knowledge_scope=global)';
COMMENT ON TABLE  ai.rag_document_chunks IS '청크 메타·본문 기록. 벡터는 ai.data_projectteam02에만 저장 (항상 비어 있던 embedding 컬럼은 2026-11 제거, sql/ai/drop_chunk_embedding.sql)';
COMMENT ON COLUMN ai.rag_document_chunks.chunk_id IS '{documentId}:{hash12}:{순번}. tutor.ai_message_sources.chunk_id가 논리 참조';
COMMENT ON TABLE  ai.rag_index_configurations IS '벡터 컬렉션별 임베딩 provider·모델·차원 (불일치 시 적재 거부)';

-- 4. 백엔드(app_user) 읽기 권한: 문서 메타만 (출처 표시·document_id 존재 검증용). 청크 본문·벡터는 비공개
GRANT USAGE ON SCHEMA ai TO app_user;
GRANT SELECT ON ai.rag_documents TO app_user;

RESET ROLE;
