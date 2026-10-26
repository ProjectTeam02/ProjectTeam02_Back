-- ai 스키마·계정 검증 (ai_user 계정으로 실행, 02_ai_schema.sql 적용 후)
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

INSERT INTO result SELECT 1, 'pgvector 확장 설치됨', count(*) = 1, coalesce(max(extversion), '없음') FROM pg_extension WHERE extname = 'vector';
INSERT INTO result SELECT 2, '기본 스키마가 ai', current_schema() = 'ai', current_schema();
SELECT pg_temp.expect_ok (3, 'ai 스키마에 벡터 테이블 생성 (1536차원)', $q$CREATE TABLE ai.zz_vector_check (id text PRIMARY KEY, embedding vector(1536))$q$);
SELECT pg_temp.expect_ok (4, '벡터 저장', $q$INSERT INTO ai.zz_vector_check SELECT 'd' || i, array_fill(i::real, ARRAY[1536])::vector FROM generate_series(1,3) i$q$);
INSERT INTO result SELECT 8, '가장 가까운 벡터 검색 (유사도 검색)', id IS NOT NULL, coalesce(id, '결과 없음') FROM (SELECT (SELECT id FROM ai.zz_vector_check ORDER BY embedding <-> array_fill(1::real, ARRAY[1536])::vector LIMIT 1) AS id) x;
SELECT pg_temp.expect_err(5, '차원이 다른 벡터 거부 (임베딩 모델 불일치 방지)', $q$INSERT INTO ai.zz_vector_check VALUES ('bad', '[1,2,3]')$q$, '22000');
SELECT pg_temp.expect_err(6, 'app 스키마(백엔드 소유) 조회 거부', $q$SELECT count(*) FROM app.users$q$, '42501');
SELECT pg_temp.expect_err(7, 'public 스키마에 테이블 생성 거부 (ai 스키마로만)', $q$CREATE TABLE public.zz_public_check (id int)$q$, '42501');
DROP TABLE IF EXISTS ai.zz_vector_check;

SELECT no || ' | ' || CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END || ' | ' || name || ' | ' || left(detail, 70) FROM result ORDER BY no;
SELECT 'TOTAL ' || count(*) FILTER (WHERE ok) || '/' || count(*) FROM result;
