-- #164 RDS ai 스키마가 레포 정의(03_ai_tables.sql, 04_ai_vector_table.sql)와 같은지 점검 (읽기 전용)
-- app_user로 실행 가능: pg_catalog와 OID 기준으로 조회해서 ai 스키마 권한이 없어도 오류 없이 FAIL로 표시된다
-- 결과: 항목별 PASS/FAIL과 실제 값. FAIL 항목은 03_ai_tables.sql 재실행 또는 sql/ai/ 변경 SQL로 맞춘다

\qecho '[ai 스키마 정의 점검] PASS/FAIL'
WITH rel AS (                                              -- ai 스키마 테이블 목록 (OID 기준)
  SELECT c.oid, c.relname, pg_get_userbyid(c.relowner) AS owner
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'ai' AND c.relkind = 'r'
),
col AS (                                                   -- 컬럼·기본값·NOT NULL
  SELECT r.relname, a.attname, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS def
  FROM rel r
  JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = r.oid AND d.adnum = a.attnum
),
con AS (                                                   -- 제약 조건
  SELECT r.relname, k.conname, k.contype, pg_get_constraintdef(k.oid) AS def
  FROM rel r JOIN pg_constraint k ON k.conrelid = r.oid
),
idx AS (                                                   -- 인덱스
  SELECT r.relname, i.relname AS indexname, x.indisunique
  FROM rel r JOIN pg_index x ON x.indrelid = r.oid JOIN pg_class i ON i.oid = x.indexrelid
),
checks(no, item, ok, actual) AS (
  -- 1. 테이블·소유자
  SELECT 1, '테이블 4개, 소유자 ai_user (rag_documents, rag_document_chunks, rag_index_configurations, data_projectteam02)',
         count(*) FILTER (WHERE owner = 'ai_user') = 4,
         coalesce(string_agg(relname || ':' || owner, ', ' ORDER BY relname), '없음')
    FROM rel WHERE relname IN ('rag_documents', 'rag_document_chunks', 'rag_index_configurations', 'data_projectteam02')
  -- 2. CHECK 제약
  UNION ALL SELECT 2, 'CHECK chk_rag_documents_content_hash',
         count(*) = 1, coalesce(max(def), '없음') FROM con WHERE conname = 'chk_rag_documents_content_hash'
  UNION ALL SELECT 3, 'CHECK chk_rag_index_dimension',
         count(*) = 1, coalesce(max(def), '없음') FROM con WHERE conname = 'chk_rag_index_dimension'
  UNION ALL SELECT 4, 'CHECK chk_rag_documents_license_review_status (#164)',
         count(*) = 1, coalesce(max(def), '없음') FROM con WHERE conname = 'chk_rag_documents_license_review_status'
  -- 3. 청크 UNIQUE·FK
  UNION ALL SELECT 5, 'UNIQUE uq_rag_document_chunk (document_id, chunk_id)',
         count(*) = 1, coalesce(max(def), '없음') FROM con WHERE conname = 'uq_rag_document_chunk'
  UNION ALL SELECT 6, 'FK 청크 → 문서 ON DELETE CASCADE',
         bool_or(def LIKE '%ON DELETE CASCADE%') IS TRUE, coalesce(max(def), '없음')
    FROM con WHERE relname = 'rag_document_chunks' AND contype = 'f'
  -- 4. 인덱스
  UNION ALL SELECT 7, 'ix_rag_documents_content_hash (UNIQUE)',
         bool_or(indisunique) IS TRUE, coalesce(string_agg(indexname, ','), '없음') FROM idx WHERE indexname = 'ix_rag_documents_content_hash'
  UNION ALL SELECT 8, '문서 인덱스 5개 (source_id, concept_id, stage_id, review_status, license_review_status)',
         count(*) = 5, coalesce(string_agg(indexname, ',' ORDER BY indexname), '없음')
    FROM idx WHERE indexname IN ('ix_rag_documents_source_id', 'ix_rag_documents_concept_id', 'ix_rag_documents_stage_id',
                                 'ix_rag_documents_review_status', 'ix_rag_documents_license_review_status')
  UNION ALL SELECT 9, '청크 인덱스 ix_rag_document_chunks_document_id',
         count(*) = 1, coalesce(string_agg(indexname, ','), '없음') FROM idx WHERE indexname = 'ix_rag_document_chunks_document_id'
  UNION ALL SELECT 10, '벡터 인덱스 projectteam02_idx_1 (ref_doc_id)',
         count(*) = 1, coalesce(string_agg(indexname, ','), '없음') FROM idx WHERE indexname = 'projectteam02_idx_1'
  -- 5. 기본값
  UNION ALL SELECT 11, '청크 id 기본값 gen_random_uuid()',
         bool_or(def = 'gen_random_uuid()') IS TRUE, coalesce(max(def), '기본값 없음') FROM col WHERE relname = 'rag_document_chunks' AND attname = 'id'
  UNION ALL SELECT 12, 'metadata_json 기본값 {} (문서·청크)',
         count(*) FILTER (WHERE def LIKE '''{}''::jsonb') = 2, coalesce(string_agg(relname || ':' || coalesce(def, '없음'), ', '), '없음')
    FROM col WHERE relname IN ('rag_documents', 'rag_document_chunks') AND attname = 'metadata_json'
  -- 6. #164 라이선스 상태 컬럼
  UNION ALL SELECT 13, 'license_review_status NOT NULL, 기본 PENDING (#164)',
         bool_or(attnotnull AND def LIKE '''PENDING''%') IS TRUE, coalesce(max(def), '컬럼 없음')
    FROM col WHERE relname = 'rag_documents' AND attname = 'license_review_status'
  -- 7. 청크에 embedding 컬럼 없음
  UNION ALL SELECT 14, '청크 embedding 컬럼 없음 (벡터는 data_projectteam02에만)',
         count(*) = 0, coalesce(string_agg(attname, ','), '없음') FROM col WHERE relname = 'rag_document_chunks' AND attname = 'embedding'
  -- 8. app_user 권한 (OID 기준이라 스키마 권한이 없어도 조회 가능)
  UNION ALL SELECT 15, 'app_user: ai 스키마 USAGE',
         has_schema_privilege('app_user', (SELECT oid FROM pg_namespace WHERE nspname = 'ai'), 'USAGE'), 'USAGE'
  UNION ALL SELECT 16, 'app_user: rag_documents SELECT만 (쓰기 불가)',
         bool_and(has_table_privilege('app_user', oid, 'SELECT') AND NOT has_table_privilege('app_user', oid, 'INSERT')) IS TRUE, 'rag_documents'
    FROM rel WHERE relname = 'rag_documents'
  UNION ALL SELECT 17, 'app_user: 청크·임베딩 설정·벡터 테이블 접근 불가',
         count(*) = 3 AND NOT bool_or(has_table_privilege('app_user', oid, 'SELECT')), coalesce(string_agg(relname, ','), '없음')
    FROM rel WHERE relname IN ('rag_document_chunks', 'rag_index_configurations', 'data_projectteam02')
)
SELECT no, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, item, left(actual, 90) AS actual
FROM checks ORDER BY no;

\qecho '[문서 라이선스 상태별 개수 (#164)]'
SELECT EXISTS (                                             -- 컬럼이 있고 조회 권한도 있을 때만 개수 조회 (적용 전 실행 대비)
  SELECT 1 FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'ai'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'license_review_status' AND NOT a.attisdropped
  WHERE c.relname = 'rag_documents'
    AND has_schema_privilege(n.oid, 'USAGE') AND has_table_privilege(c.oid, 'SELECT')
) AS can_count_license \gset
\if :can_count_license
SELECT source_id, license_review_status, count(*) AS docs   -- 출처별 라이선스 승인 현황
FROM ai.rag_documents
GROUP BY 1, 2
ORDER BY 1, 2;
\else
\qecho 'license_review_status 컬럼이 없거나 조회 권한 없음 → 위 13·15·16번 항목 확인'
\endif
