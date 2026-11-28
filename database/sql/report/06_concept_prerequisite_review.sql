-- BE-05 선수 관계 검수 목록 추출 (읽기 전용, app_user로 실행)
-- 결과: CSV 1개 (psql --csv -f ... -o 파일.csv). 검수자가 decision 열에 APPROVED / REJECTED를 적어 load_concept_prerequisite_review.sql로 적재
-- 개념 이름은 코드별 기준 버전(PUBLISHED 중 최신). 이름이 비어 있으면 개념 테이블에 없는 코드 → REJECTED 권장

WITH base AS (                                               -- 코드별 기준 버전의 이름
  SELECT DISTINCT ON (concept_code) concept_code, title
  FROM content.concepts
  WHERE status = 'PUBLISHED'
  ORDER BY concept_code, version DESC
)
SELECT p.concept_code,                                       -- 개념 (이 개념을 배우기 전에)
       c.title AS concept_title,
       p.prerequisite_concept_code,                          -- 선수 개념 (먼저 알아야 하는 개념)
       pc.title AS prerequisite_title,
       p.display_order,                                      -- 표시 순서
       p.review_status AS current_status,                    -- 현재 상태 (PENDING / APPROVED / REJECTED)
       CASE WHEN c.concept_code IS NULL OR pc.concept_code IS NULL
            THEN 'MISSING_CONCEPT' ELSE '' END AS note,      -- 없는 개념 코드 표시
       '' AS decision                                        -- 검수자가 APPROVED 또는 REJECTED 입력 (빈칸은 변경 안 함)
FROM content.concept_prerequisites p
LEFT JOIN base c  ON c.concept_code  = p.concept_code
LEFT JOIN base pc ON pc.concept_code = p.prerequisite_concept_code
ORDER BY p.concept_code, p.display_order, p.prerequisite_concept_code;
