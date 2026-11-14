-- ai.rag_document_chunks.embedding 컬럼 제거 (이미 운영 중인 DB용, ai_user 권한으로 실행)
-- 이유: 실제 벡터는 ai.data_projectteam02(04_ai_vector_table.sql)에만 저장한다. 이 컬럼은 AI 코드가 항상 null로 넣던 자리라 쓰이지 않았다.
-- 선행 조건: AI 레포에서 RAGChunk.embedding 모델 필드를 지운 버전이 배포된 뒤 실행 (예전 AI 코드는 이 컬럼에 null을 넣으므로 적재가 실패함)
-- 새로 만드는 DB는 03_ai_tables.sql에 이 컬럼이 없어서 실행할 필요가 없다. 여러 번 실행해도 안전하다 (IF EXISTS).
--   RDS:  psql -U <마스터> -d leren -v ON_ERROR_STOP=1 -f database/sql/ai/drop_chunk_embedding.sql
\set ON_ERROR_STOP 1

SET ROLE ai_user;

DO $$
BEGIN
  -- 값이 하나라도 들어 있으면 멈춘다 (임의로 지우지 않음)
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ai' AND table_name = 'rag_document_chunks' AND column_name = 'embedding') THEN
    IF EXISTS (SELECT 1 FROM ai.rag_document_chunks WHERE embedding IS NOT NULL) THEN
      RAISE EXCEPTION 'ai.rag_document_chunks.embedding에 값이 있는 행이 있습니다. 확인 후 다시 실행하세요.';
    END IF;
  END IF;
END $$;

ALTER TABLE ai.rag_document_chunks DROP COLUMN IF EXISTS embedding;

RESET ROLE;
