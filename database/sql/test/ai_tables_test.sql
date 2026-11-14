-- ai 스키마 RAG 메타·벡터 테이블 검증 (ai_user 계정으로 실행, 03_ai_tables.sql·04_ai_vector_table.sql 적용 후)
\set ON_ERROR_STOP 1
\set QUIET 1
\pset format unaligned
\pset tuples_only on
SET client_min_messages = warning;
CREATE TEMP TABLE result (no int, name text, ok boolean, detail text);
CREATE FUNCTION pg_temp.expect_err(no int, name text, stmt text, code text) RETURNS void AS $$
BEGIN
  BEGIN EXECUTE stmt; INSERT INTO result VALUES (no, name, false, '오류 없이 실행됨');
  EXCEPTION WHEN OTHERS THEN INSERT INTO result VALUES (no, name, SQLSTATE = code, SQLSTATE || ' ' || SQLERRM);
  END;
END $$ LANGUAGE plpgsql;
CREATE FUNCTION pg_temp.expect_ok(no int, name text, stmt text) RETURNS void AS $$
BEGIN
  BEGIN EXECUTE stmt; INSERT INTO result VALUES (no, name, true, 'OK');
  EXCEPTION WHEN OTHERS THEN INSERT INTO result VALUES (no, name, false, SQLSTATE || ' ' || SQLERRM);
  END;
END $$ LANGUAGE plpgsql;

INSERT INTO result SELECT 1, 'rag 테이블 3개가 ai 스키마에 있고 소유자 ai_user', count(*) = 3, string_agg(tablename || ':' || tableowner, ', ')
  FROM pg_tables WHERE schemaname = 'ai' AND tablename IN ('rag_documents', 'rag_document_chunks', 'rag_index_configurations') AND tableowner = 'ai_user';
SELECT pg_temp.expect_ok (2, '문서 저장 (AI 적재 코드와 같은 컬럼)', $q$INSERT INTO ai.rag_documents (document_id, source_id, title, source, source_url, version, review_status, content_hash, metadata_json) VALUES ('bok800-154', 'bok800', '기준금리', '한국은행 경제금융용어 800선', 'https://www.bok.or.kr', '2026', 'approved', repeat('a', 64), '{"knowledge_scope":"global"}')$q$);
SELECT pg_temp.expect_err(3, '같은 content_hash 문서 중복 거부', $q$INSERT INTO ai.rag_documents (document_id, source_id, title, source, content_hash) VALUES ('bok800-155', 'bok800', '기준금리2', 'x', repeat('a', 64))$q$, '23505');
SELECT pg_temp.expect_ok (4, '청크 저장 (id·metadata_json 기본값)', $q$INSERT INTO ai.rag_document_chunks (document_id, chunk_id, content) VALUES ('bok800-154', 'bok800-154:abc123def456:0', '기준금리는 ...')$q$);
SELECT pg_temp.expect_err(5, '같은 문서·같은 chunk_id 중복 거부', $q$INSERT INTO ai.rag_document_chunks (document_id, chunk_id, content) VALUES ('bok800-154', 'bok800-154:abc123def456:0', '중복')$q$, '23505');
SELECT pg_temp.expect_err(6, '없는 문서의 청크 거부 (FK)', $q$INSERT INTO ai.rag_document_chunks (document_id, chunk_id, content) VALUES ('no-doc', 'no-doc:0', 'x')$q$, '23503');
SELECT pg_temp.expect_ok (7, '문서 삭제 시 청크도 삭제 (CASCADE)', $q$DELETE FROM ai.rag_documents WHERE document_id = 'bok800-154'$q$);
INSERT INTO result SELECT 8, '삭제 후 청크 0개', count(*) = 0, count(*)::text FROM ai.rag_document_chunks WHERE document_id = 'bok800-154';
SELECT pg_temp.expect_ok (9, '임베딩 설정 저장 (1536차원)', $q$INSERT INTO ai.rag_index_configurations (collection_name, embedding_provider, embedding_model, embedding_dimension) VALUES ('zz_test', 'openrouter', 'openai/text-embedding-3-small', 1536)$q$);
SELECT pg_temp.expect_err(10, '임베딩 차원 0 거부', $q$INSERT INTO ai.rag_index_configurations (collection_name, embedding_provider, embedding_model, embedding_dimension) VALUES ('zz_bad', 'x', 'x', 0)$q$, '23514');
SELECT pg_temp.expect_err(11, 'content_hash 64자가 아니면 거부 (sha256)', $q$INSERT INTO ai.rag_documents (document_id, source_id, title, source, content_hash) VALUES ('bad-hash', 'x', 'x', 'x', 'abc')$q$, '23514');
INSERT INTO result SELECT 12, 'app_user는 문서 메타 읽기만 (rag_documents SELECT)',
  has_table_privilege('app_user', 'ai.rag_documents', 'SELECT') AND NOT has_table_privilege('app_user', 'ai.rag_documents', 'INSERT')
  AND NOT has_table_privilege('app_user', 'ai.rag_document_chunks', 'SELECT') AND NOT has_table_privilege('app_user', 'ai.rag_index_configurations', 'SELECT'), 'privileges';
-- 벡터 테이블 (04_ai_vector_table.sql, #96)
INSERT INTO result SELECT 13, '벡터 테이블이 ai 스키마에 있고 소유자 ai_user', count(*) = 1, coalesce(string_agg(tablename || ':' || tableowner, ', '), '없음')
  FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'data_projectteam02' AND tableowner = 'ai_user';
INSERT INTO result SELECT 14, '벡터 테이블 컬럼 5개 (LlamaIndex 구조)',
  string_agg(column_name || ':' || udt_name || ':' || is_nullable, ',' ORDER BY ordinal_position) = 'id:int8:NO,text:varchar:NO,metadata_:jsonb:YES,node_id:varchar:YES,embedding:vector:YES',
  string_agg(column_name || ':' || udt_name || ':' || is_nullable, ',' ORDER BY ordinal_position)
  FROM information_schema.columns WHERE table_schema = 'ai' AND table_name = 'data_projectteam02';
INSERT INTO result SELECT 15, 'embedding은 vector(1536)', coalesce(bool_and(format_type(atttypid, atttypmod) = 'vector(1536)'), false), coalesce(string_agg(format_type(atttypid, atttypmod), ','), '없음')
  FROM pg_attribute WHERE attrelid = to_regclass('ai.data_projectteam02') AND attname = 'embedding';
INSERT INTO result SELECT 16, 'ref_doc_id 인덱스 (projectteam02_idx_1)', count(*) = 1, coalesce(string_agg(indexname, ','), '없음')
  FROM pg_indexes WHERE schemaname = 'ai' AND tablename = 'data_projectteam02' AND indexname = 'projectteam02_idx_1';
SELECT pg_temp.expect_ok (17, '1536차원 벡터 저장', $q$INSERT INTO ai.data_projectteam02 (text, metadata_, node_id, embedding) VALUES ('기준금리는 ...', '{"document_id":"zz-test","review_status":"approved"}', 'zz_test', array_fill(0.1, ARRAY[1536])::vector)$q$);
SELECT pg_temp.expect_err(18, '다른 차원(3) 벡터 거부', $q$INSERT INTO ai.data_projectteam02 (text, node_id, embedding) VALUES ('x', 'zz_test', '[1,2,3]')$q$, '22000');
SELECT pg_temp.expect_err(19, '본문(text) 없는 행 거부', $q$INSERT INTO ai.data_projectteam02 (node_id) VALUES ('zz_test')$q$, '23502');
INSERT INTO result SELECT 20, 'app_user는 벡터 테이블 접근 불가',
  NOT has_table_privilege('app_user', 'ai.data_projectteam02', 'SELECT') AND NOT has_table_privilege('app_user', 'ai.data_projectteam02', 'INSERT'), 'privileges';
-- 테스트 데이터 정리
DELETE FROM ai.data_projectteam02 WHERE node_id = 'zz_test';
DELETE FROM ai.rag_index_configurations WHERE collection_name = 'zz_test';
DELETE FROM ai.rag_documents WHERE document_id IN ('bok800-154', 'bok800-155', 'bad-hash');

SELECT no || ' | ' || CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END || ' | ' || name || ' | ' || left(detail, 70) FROM result ORDER BY no;
SELECT 'TOTAL ' || count(*) FILTER (WHERE ok) || '/' || count(*) FROM result;
