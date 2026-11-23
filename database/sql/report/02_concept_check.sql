-- BE-01 개념 코드 현황 점검 (읽기 전용)

\qecho '[1] 상태별 개념 행 수'
SELECT status, count(*) AS rows                         -- 상태별 행 수
FROM content.concepts
GROUP BY status
ORDER BY status;

\qecho '[2] PUBLISHED 버전이 하나도 없는 개념 코드'
SELECT concept_code,                                     -- 개념 코드
       array_agg(status::text || ':v' || version ORDER BY version) AS versions  -- 가진 버전·상태
FROM content.concepts
GROUP BY concept_code
HAVING count(*) FILTER (WHERE status = 'PUBLISHED') = 0  -- 공개 버전 0개
ORDER BY concept_code;

\qecho '[3] PUBLISHED 버전이 2개 이상인 개념 코드 (기준 버전 정책 필요)'
SELECT concept_code,
       array_agg(version ORDER BY version) AS published_versions  -- 공개된 버전 목록
FROM content.concepts
WHERE status = 'PUBLISHED'
GROUP BY concept_code
HAVING count(*) > 1                                      -- 공개 버전 2개 이상
ORDER BY concept_code;

\qecho '[4] PUBLISHED인데 검수 기록(reviewed_at)이 없는 개념 수'
SELECT count(*) AS published_without_review              -- 기본값 PUBLISHED로 들어온 것들
FROM content.concepts
WHERE status = 'PUBLISHED'
  AND reviewed_at IS NULL;

\qecho '[5] 이전 버전 연결 이상 (다른 코드를 가리키거나 버전이 거꾸로)'
SELECT c.concept_code, c.version,                        -- 현재 버전
       p.concept_code AS prev_code, p.version AS prev_version  -- 가리키는 이전 버전
FROM content.concepts c
JOIN content.concepts p ON p.concept_id = c.supersedes_concept_id
WHERE p.concept_code <> c.concept_code                   -- 다른 개념을 가리킴
   OR p.version >= c.version                             -- 이전 버전 번호가 같거나 큼
ORDER BY c.concept_code;

\qecho '[6] 코드 형식 확인 (공백·소문자 등 섞인 코드)'
SELECT DISTINCT concept_code                             -- 형식이 튀는 코드
FROM content.concepts
WHERE concept_code <> btrim(concept_code)                -- 앞뒤 공백
   OR concept_code !~ '^[A-Z0-9_-]+$'                    -- 대문자·숫자·_·- 외 문자
ORDER BY concept_code;
