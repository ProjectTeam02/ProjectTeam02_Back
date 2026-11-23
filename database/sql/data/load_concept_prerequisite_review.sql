-- BE-05 선수 관계 검수 결과 적재 (쓰기, app_user로 실행)
-- 입력: 06_concept_prerequisite_review.sql 결과 CSV에서 decision 열에 APPROVED / REJECTED를 적은 파일 (UTF-8, 헤더 포함)
--   psql "...user=app_user..." -1 -v ON_ERROR_STOP=1 -v csv="C:/Users/LG/leren-report/prerequisite_review.csv" -f database/sql/data/load_concept_prerequisite_review.sql
--   -1: 한 트랜잭션으로 실행 → 검증 실패나 오류가 나면 아무것도 바뀌지 않음
-- 규칙
--   - decision이 APPROVED / REJECTED(대소문자 무관)인 행만 반영, 빈칸은 건너뜀. 다른 값이 있으면 전체 중단
--   - CSV의 (개념, 선수 개념) 쌍이 DB에 없으면 전체 중단
--   - reviewed_at = 지금 시각. reviewed_by는 앱 사용자 계정이 아닌 팀 검수라 비워 두고, 검수자는 이슈에 기록
--   - 여러 번 실행해도 같은 결과 (상태가 같으면 검수 시각만 갱신)
\set ON_ERROR_STOP 1

CREATE TEMP TABLE reviewed (                                 -- CSV 그대로 받는 임시 테이블
  concept_code text, concept_title text, prerequisite_concept_code text, prerequisite_title text,
  display_order text, current_status text, note text, decision text
);
\set copy_cmd '\\copy reviewed FROM ' :'csv' ' WITH (FORMAT csv, HEADER true, ENCODING ''UTF8'')'
:copy_cmd

CREATE TEMP TABLE decided AS                                 -- 결정이 적힌 행만
SELECT DISTINCT btrim(concept_code) AS concept_code, btrim(prerequisite_concept_code) AS prerequisite_concept_code,
       upper(btrim(decision)) AS decision
FROM reviewed
WHERE btrim(coalesce(decision, '')) <> '';

DO $$
DECLARE bad text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decided) THEN
    RAISE EXCEPTION 'decision이 적힌 행이 없습니다. CSV를 확인하세요.';
  END IF;
  SELECT string_agg(concept_code || '→' || prerequisite_concept_code || ':' || decision, ', ') INTO bad   -- 허용되지 않은 값
  FROM decided WHERE decision NOT IN ('APPROVED', 'REJECTED');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'decision은 APPROVED 또는 REJECTED만 가능합니다: %', bad; END IF;
  SELECT string_agg(concept_code || '→' || prerequisite_concept_code, ', ') INTO bad   -- 같은 쌍에 서로 다른 결정
  FROM (SELECT concept_code, prerequisite_concept_code FROM decided GROUP BY 1, 2 HAVING count(*) > 1) x;
  IF bad IS NOT NULL THEN RAISE EXCEPTION '같은 관계에 결정이 여러 개입니다: %', bad; END IF;
  SELECT string_agg(d.concept_code || '→' || d.prerequisite_concept_code, ', ') INTO bad   -- DB에 없는 관계
  FROM decided d
  WHERE NOT EXISTS (SELECT 1 FROM content.concept_prerequisites p
                    WHERE p.concept_code = d.concept_code AND p.prerequisite_concept_code = d.prerequisite_concept_code);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'DB에 없는 선수 관계: %', bad; END IF;
END $$;

UPDATE content.concept_prerequisites p                       -- 검수 결과 반영
SET review_status = d.decision::content.relation_review_status,
    reviewed_at = now()
FROM decided d
WHERE p.concept_code = d.concept_code AND p.prerequisite_concept_code = d.prerequisite_concept_code;

\qecho '[적재 결과] 검수 상태별 선수 관계 수'
SELECT review_status, count(*) AS relations                  -- 전체 상태 분포 (PENDING이 남으면 미검수)
FROM content.concept_prerequisites
GROUP BY 1
ORDER BY 1;
