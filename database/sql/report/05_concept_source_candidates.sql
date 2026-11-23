-- BE-02 개념–근거 문서 연결 후보 추출 (읽기 전용, app_user로 실행)
-- 결과: CSV 1개 (psql --csv -f ... -o 파일.csv). 사람이 approve 열에 Y를 적어 load_concept_source_documents.sql로 적재
-- 매칭 기준 (공백·가운뎃점·괄호·슬래시·하이픈을 지우고 소문자로 비교)
--   EXACT   : 개념 이름 또는 연결된 용어(concept_terms)가 문서 제목(또는 '/'로 나뉜 별칭, 괄호 앞 이름)과 같음
--   PARTIAL : 한쪽 이름이 다른 쪽에 포함됨 (2글자 이상). 오탐이 있으니 꼭 확인
-- 대상: 코드별 기준 버전(PUBLISHED 중 최신), 승인(approved)된 BOK·KDI 문서

WITH base AS (                                               -- 코드별 기준 버전 1건
  SELECT DISTINCT ON (concept_code) concept_code, concept_id, title
  FROM content.concepts
  WHERE status = 'PUBLISHED'
  ORDER BY concept_code, version DESC
),
concept_keys AS (                                            -- 개념 쪽 비교 이름: 개념 이름 + 연결 용어
  SELECT b.concept_code, b.title AS concept_title, 'TITLE' AS key_from, b.title AS key_text FROM base b
  UNION
  SELECT b.concept_code, b.title, 'TERM', g.term
  FROM base b
  JOIN content.concept_terms ct ON ct.concept_code = b.concept_code
  JOIN content.glossary_terms g ON g.term_id = ct.term_id
),
doc_keys AS (                                                -- 문서 쪽 비교 이름: 제목 전체 + '/' 별칭 + 괄호 앞 이름
  SELECT d.document_id, d.title, d.source_id, k.alias
  FROM ai.rag_documents d
  CROSS JOIN LATERAL (
    SELECT d.title
    UNION SELECT btrim(x) FROM unnest(string_to_array(d.title, '/')) x
    UNION SELECT btrim(split_part(d.title, '(', 1))
  ) k(alias)
  WHERE d.review_status = 'approved'
),
norm AS (                                                    -- 정규화 (공백·기호 제거, 소문자)
  SELECT ck.*, lower(regexp_replace(ck.key_text, '[[:space:]·()\[\]/,\-]', '', 'g')) AS ck_norm FROM concept_keys ck
),
dnorm AS (
  SELECT dk.*, lower(regexp_replace(dk.alias, '[[:space:]·()\[\]/,\-]', '', 'g')) AS dk_norm FROM doc_keys dk
),
matched AS (                                                 -- 후보 매칭
  SELECT n.concept_code, n.concept_title, n.key_from, n.key_text, d.document_id, d.title AS doc_title, d.source_id,
         CASE WHEN n.ck_norm = d.dk_norm THEN 'EXACT' ELSE 'PARTIAL' END AS match_type
  FROM norm n
  JOIN dnorm d
    ON n.ck_norm = d.dk_norm
    OR (char_length(n.ck_norm) >= 2 AND char_length(d.dk_norm) >= 2
        AND (position(n.ck_norm IN d.dk_norm) > 0 OR position(d.dk_norm IN n.ck_norm) > 0))
  WHERE n.ck_norm <> '' AND d.dk_norm <> ''
),
best AS (                                                    -- 개념·문서 쌍마다 가장 강한 매칭 1건 (EXACT 우선)
  SELECT DISTINCT ON (concept_code, document_id) *
  FROM matched
  ORDER BY concept_code, document_id, (match_type = 'EXACT') DESC, (key_from = 'TITLE') DESC
)
SELECT concept_code,                                         -- 개념 코드
       concept_title,                                        -- 개념 이름
       match_type,                                           -- EXACT / PARTIAL
       key_from || ':' || key_text AS matched_by,            -- 어떤 이름으로 매칭됐는지 (TITLE:개념명 / TERM:용어)
       document_id,                                          -- 문서 ID (적재 대상)
       doc_title,                                            -- 문서 제목
       source_id,                                            -- 출처
       '' AS approve                                         -- 검수자가 Y 입력 (Y만 적재)
FROM best
UNION ALL                                                    -- 후보가 하나도 없는 개념도 목록에 남김 (직접 찾아 추가)
SELECT b.concept_code, b.title, 'NONE', '', '', '', '', ''
FROM base b
WHERE NOT EXISTS (SELECT 1 FROM best x WHERE x.concept_code = b.concept_code)
ORDER BY 1, 3, 6;
