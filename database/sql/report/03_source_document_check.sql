-- BE-02 개념–근거 문서 연결 점검 (읽기 전용)
-- app_user는 ai.rag_documents 조회 권한이 있음 (청크 본문은 조회 불가, 여기선 안 씀)

\qecho '[1] 개념이 가리키는 문서 ID별 대조 결과'
WITH refs AS (                                           -- 개념의 source_document_ids를 한 줄씩 펼치기
  SELECT c.concept_code, c.version, c.status,
         unnest(c.source_document_ids) AS document_id
  FROM content.concepts c
)
SELECT r.concept_code, r.version, r.status AS concept_status,
       r.document_id,                                    -- 개념이 적어 둔 문서 ID
       CASE
         WHEN d.document_id IS NULL        THEN 'MISSING'       -- rag_documents에 없음 (오류)
         WHEN d.review_status = 'approved' THEN 'APPROVED'      -- 검색 대상 문서
         ELSE 'NOT_APPROVED'                                    -- 검수 대기 등
       END AS check_result,
       d.source_id,                                      -- 출처 묶음 (예: bok800)
       d.version  AS doc_version,                        -- 원문 버전
       d.license,                                        -- 이용 조건 (텍스트)
       left(d.content_hash, 12) AS hash12                -- 해시 앞 12자리
FROM refs r
LEFT JOIN ai.rag_documents d ON d.document_id = r.document_id
ORDER BY check_result, r.concept_code, r.version;

\qecho '[2] 근거 문서가 하나도 없는 PUBLISHED 개념 수'
SELECT count(*) AS published_without_source              -- source_document_ids 비어 있음
FROM content.concepts
WHERE status = 'PUBLISHED'
  AND COALESCE(cardinality(source_document_ids), 0) = 0;

\qecho '[3] RAG 문서 현황 (출처·검수 상태·license 유무·개념 연결 유무)'
SELECT source_id, review_status,
       (license IS NOT NULL)    AS has_license,          -- 이용 조건 기록 여부
       (concept_id IS NOT NULL) AS has_concept,          -- 문서 쪽 개념 연결 여부
       count(*) AS docs
FROM ai.rag_documents
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3, 4;

\qecho '[4] 문서의 concept_id가 어떤 개념과도 안 맞는 문서'
SELECT d.document_id, d.concept_id                       -- 문서 쪽에 적힌 개념 값
FROM ai.rag_documents d
WHERE d.concept_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM content.concepts c
    WHERE c.concept_id::text = d.concept_id              -- UUID로 적혀 있거나
       OR c.concept_code     = d.concept_id              -- 개념 코드로 적혀 있는 경우 둘 다 허용
  )
ORDER BY d.document_id;

\qecho '[5] 양쪽 연결이 서로 다른 경우 (개념→문서는 있는데 문서→개념은 다름)'
WITH refs AS (
  SELECT c.concept_id, c.concept_code, unnest(c.source_document_ids) AS document_id
  FROM content.concepts c
)
SELECT r.concept_code, r.document_id,
       d.concept_id AS doc_side_concept
FROM refs r
JOIN ai.rag_documents d ON d.document_id = r.document_id
WHERE d.concept_id IS NOT NULL                         -- 역방향 연결이 있는 문서만 비교
  AND d.concept_id IS DISTINCT FROM r.concept_id::text   -- UUID로도
  AND d.concept_id IS DISTINCT FROM r.concept_code       -- 코드로도 안 맞음
ORDER BY r.concept_code;
