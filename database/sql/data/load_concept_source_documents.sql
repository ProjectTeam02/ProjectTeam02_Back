-- BE-02 검수한 개념–근거 문서 연결을 content.concepts.source_document_ids에 적재 (쓰기, app_user로 실행)
-- 입력: 05_concept_source_candidates.sql 결과 CSV에서 approve 열에 Y를 적은 파일 (UTF-8, 헤더 포함)
--   psql "...user=app_user..." -1 -v ON_ERROR_STOP=1 -v csv="C:/Users/LG/leren-report/concept_sources_reviewed.csv" -f database/sql/data/load_concept_source_documents.sql
--   -1: 한 트랜잭션으로 실행 → 검증 실패나 오류가 나면 아무것도 바뀌지 않음
-- 규칙
--   - approve가 Y(대소문자 무관)인 행만 적재. 문서 ID가 ai.rag_documents에 없거나 approved가 아니면 전체 중단
--   - 개념 코드별 기준 버전(PUBLISHED 중 최신)의 source_document_ids를 승인 목록으로 "교체" (여러 번 실행해도 같은 결과)
--   - CSV에 승인 행이 하나도 없는 개념은 건드리지 않음
\set ON_ERROR_STOP 1

CREATE TEMP TABLE reviewed (                                 -- CSV 그대로 받는 임시 테이블 (세션 끝나면 사라짐)
  concept_code text, concept_title text, match_type text, matched_by text,
  document_id text, doc_title text, source_id text, approve text
);
\set copy_cmd '\\copy reviewed FROM ' :'csv' ' WITH (FORMAT csv, HEADER true, ENCODING ''UTF8'')'
:copy_cmd

CREATE TEMP TABLE approved AS                                -- 승인된 연결만 (중복 제거)
SELECT DISTINCT btrim(concept_code) AS concept_code, btrim(document_id) AS document_id
FROM reviewed
WHERE upper(btrim(coalesce(approve, ''))) = 'Y';

DO $$
DECLARE bad text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approved) THEN
    RAISE EXCEPTION 'approve = Y인 행이 없습니다. CSV를 확인하세요.';
  END IF;
  SELECT string_agg(a.concept_code, ', ') INTO bad            -- 없는 개념 코드
  FROM (SELECT DISTINCT concept_code FROM approved) a
  WHERE NOT EXISTS (SELECT 1 FROM content.concepts c WHERE c.concept_code = a.concept_code AND c.status = 'PUBLISHED');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'PUBLISHED 개념에 없는 코드: %', bad; END IF;
  SELECT string_agg(a.document_id, ', ') INTO bad            -- 없거나 승인되지 않은 문서
  FROM approved a
  LEFT JOIN ai.rag_documents d ON d.document_id = a.document_id
  WHERE d.document_id IS NULL OR d.review_status <> 'approved';
  IF bad IS NOT NULL THEN RAISE EXCEPTION '없거나 approved가 아닌 문서: %', bad; END IF;
END $$;

WITH base AS (                                               -- 코드별 기준 버전
  SELECT DISTINCT ON (concept_code) concept_id, concept_code
  FROM content.concepts
  WHERE status = 'PUBLISHED'
  ORDER BY concept_code, version DESC
),
lists AS (                                                   -- 개념별 승인 문서 목록 (정렬해서 저장)
  SELECT concept_code, array_agg(document_id ORDER BY document_id) AS doc_ids
  FROM approved GROUP BY concept_code
)
UPDATE content.concepts c                                    -- 기준 버전의 근거 문서 목록 교체
SET source_document_ids = l.doc_ids, updated_at = now()
FROM base b JOIN lists l ON l.concept_code = b.concept_code
WHERE c.concept_id = b.concept_id;

\qecho '[적재 결과] 개념별 근거 문서 수'
SELECT c.concept_code, c.title, cardinality(c.source_document_ids) AS docs   -- 적재된 개념만 표시
FROM content.concepts c
JOIN approved a ON a.concept_code = c.concept_code
WHERE c.status = 'PUBLISHED'
GROUP BY c.concept_code, c.title, c.source_document_ids
ORDER BY c.concept_code;
