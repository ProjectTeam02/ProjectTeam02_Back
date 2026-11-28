-- BE-01 공식 개념 코드 마스터 내보내기 (읽기 전용)
-- 결과: JSON 1개 (psql -At 로 실행해 그대로 .json 파일로 저장)
-- 기준 버전 규칙(임시): PUBLISHED 버전 중 최신 → 없으면 전체 중 최신

WITH ranked AS (                                        -- 개념 코드별로 버전 순위 매기기
  SELECT
    c.*,                                                -- 개념 컬럼 전체
    ROW_NUMBER() OVER (
      PARTITION BY c.concept_code                       -- 같은 개념 코드끼리 묶어서
      ORDER BY (c.status = 'PUBLISHED') DESC,           -- PUBLISHED 버전을 먼저
               c.version DESC                           -- 그중 최신 버전을 1순위로
    ) AS rn,
    COUNT(*) OVER (PARTITION BY c.concept_code) AS version_count,          -- 코드별 전체 버전 수
    COUNT(*) FILTER (WHERE c.status = 'PUBLISHED')
      OVER (PARTITION BY c.concept_code) AS published_count                -- 코드별 PUBLISHED 버전 수
  FROM content.concepts c
)
SELECT json_build_object(
  'generatedAt', now(),                                 -- 추출 시각
  'baseVersionRule', 'PUBLISHED_LATEST_ELSE_LATEST',    -- 기준 버전 규칙 표시
  'conceptCount', count(*),                             -- 개념 코드 수
  'concepts', COALESCE(json_agg(json_build_object(
    'conceptCode',       concept_code,                  -- 버전 무관 개념 코드
    'conceptId',         concept_id,                    -- 기준 버전의 UUID
    'title',             title,                         -- 개념 이름
    'version',           version,                       -- 기준 버전 번호
    'status',            status,                        -- 기준 버전 상태
    'reviewedBy',        reviewed_by,                   -- 검수자 (null이면 사람 검수 기록 없음)
    'reviewedAt',        reviewed_at,                   -- 검수 시각
    'sourceDocumentIds', COALESCE(source_document_ids, '{}'),  -- 근거 문서 ID 목록
    'versionCount',      version_count,                 -- 전체 버전 수
    'publishedCount',    published_count                -- PUBLISHED 버전 수 (0 또는 2 이상이면 확인 필요)
  ) ORDER BY concept_code), '[]'::json)
)
FROM ranked
WHERE rn = 1;                                           -- 코드별 기준 버전 1건만
