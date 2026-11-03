-- ai 스키마 RAG 메타 테이블 검증 rev.7 (ai_user 계정으로 실행, 03_ai_tables.sql 적용 후)
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
-- 테스트 데이터 정리
DELETE FROM ai.rag_index_configurations WHERE collection_name = 'zz_test';
DELETE FROM ai.rag_documents WHERE document_id IN ('bok800-154', 'bok800-155', 'bad-hash');

SELECT no || ' | ' || CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END || ' | ' || name || ' | ' || left(detail, 70) FROM result ORDER BY no;
SELECT 'TOTAL ' || count(*) FILTER (WHERE ok) || '/' || count(*) FROM result;
