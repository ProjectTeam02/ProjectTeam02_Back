-- 벡터 검색 인덱스 (rev.7, DB 담당 관리)
-- 언제: AI 서버가 LlamaIndex로 처음 적재해서 벡터 테이블 ai.data_<컬렉션>이 생긴 뒤 1회 (다시 실행해도 안전)
-- 실행: psql -U ai_user -d leren -v ON_ERROR_STOP=1 -v collection=projectteam02 -f database/sql/ai/vector_indexes.sql
--       (-v collection을 빼면 projectteam02, 운영 컬렉션 이름은 AI 서버 VECTOR_STORE_COLLECTION과 같아야 함)
-- 하는 일
--   1) HNSW 인덱스 (vector_cosine_ops): LlamaIndex는 cosine 거리(<=>)로 검색. 인덱스가 없으면 전체 스캔
--   2) 검색 필터에 쓰는 metadata_ 키 인덱스: review_status, knowledge_scope, concept_code, concept_id, stage_id, term
-- 언제 실행하나: 벡터가 약 1만 개를 넘을 때. 그 전에는 전체 비교(정확한 검색)가 몇 ms라 인덱스가 필요 없고,
--   HNSW는 근사 검색이라 concept_code 같은 좁은 필터와 같이 쓰면 결과가 top_k보다 적게 나올 수 있다
--   (pgvector 0.8 이상이면 SET hnsw.iterative_scan = relaxed_order 로 완화). 2026-11-03 RDS 기준 1,400개 → 아직 실행 안 함
\set ON_ERROR_STOP 1
\if :{?collection}
\else
  \set collection projectteam02
\endif

SET ROLE ai_user;
SELECT set_config('leren.vector_table', 'data_' || :'collection', false);

DO $$
DECLARE
  t   text := current_setting('leren.vector_table');
  k   text;
BEGIN
  IF to_regclass(format('ai.%I', t)) IS NULL THEN
    RAISE EXCEPTION '벡터 테이블 ai.% 이 없습니다. AI 서버에서 먼저 문서를 적재하세요 (VECTOR_STORE_SCHEMA=ai 확인).', t;
  END IF;

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON ai.%I USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)',
                 t || '_embedding_hnsw_idx', t);

  FOREACH k IN ARRAY ARRAY['review_status', 'knowledge_scope', 'concept_code', 'concept_id', 'stage_id', 'term'] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON ai.%I ((metadata_ ->> %L))', t || '_meta_' || k || '_idx', t, k);
  END LOOP;

  EXECUTE format('ANALYZE ai.%I', t);
  RAISE NOTICE 'ai.% 인덱스 생성 완료 (HNSW 1개 + metadata 6개)', t;
END $$;

RESET ROLE;
