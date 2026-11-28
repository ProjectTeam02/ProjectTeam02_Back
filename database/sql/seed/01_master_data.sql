-- 기준 데이터: 레벨 기준표(reward.level_thresholds), 직업별 기본 한벌옷(character.costumes), 직업(character.character_classes)
-- 로컬과 RDS에 같은 파일로 적용. 여러 번 실행해도 같은 결과 (있으면 값 갱신)
-- 실행 계정: 로컬 postgres / RDS migrator (마이그레이션 적용 후 실행)
-- 값 변경: VALUES 부분만 수정해서 다시 실행. 줄을 지워도 DB의 기존 행은 삭제되지 않음
BEGIN;

-- 1) 레벨 기준표: 해당 레벨에 도달하는 데 필요한 "누적" EXP. 레벨 1은 반드시 0
--    레벨 2 이상은 임시값. PDF 권장값이 확정되면 수정·추가 후 다시 실행
INSERT INTO reward.level_thresholds (scope, level, required_exp) VALUES
  ('ACCOUNT', 1, 0),
  ('ACCOUNT', 2, 100),
  ('ECONOMY', 1, 0),
  ('ECONOMY', 2, 100)
ON CONFLICT (scope, level) DO UPDATE
  SET required_exp = EXCLUDED.required_exp, updated_at = now()
  WHERE reward.level_thresholds.required_exp IS DISTINCT FROM EXCLUDED.required_exp;

-- 2) 직업별 기본 한벌옷: 직업 선택 시 서버가 지급·장착. 상점에서는 팔지 않음 (is_on_sale = false, 가격 없음)
--    이름·이미지 키는 확정되면 채워서 다시 실행
INSERT INTO character.costumes (costume_code, name, category, price_coin, image_key, thumbnail_key, is_on_sale, sort_order)
SELECT v.costume_code, v.name, 'OUTFIT', NULL, v.image_key, v.thumbnail_key, false, v.sort_order
FROM (VALUES
  ('WARRIOR_DEFAULT_OUTFIT', '검사 기본 한벌옷',   NULL, NULL, 1),
  ('MAGE_DEFAULT_OUTFIT',    '마법사 기본 한벌옷', NULL, NULL, 2),
  ('ARCHER_DEFAULT_OUTFIT',  '궁수 기본 한벌옷',   NULL, NULL, 3)
) AS v(costume_code, name, image_key, thumbnail_key, sort_order)
ON CONFLICT (costume_code) DO UPDATE SET
  name = EXCLUDED.name, image_key = EXCLUDED.image_key, thumbnail_key = EXCLUDED.thumbnail_key,
  price_coin = NULL, is_on_sale = false, sort_order = EXCLUDED.sort_order, updated_at = now();

-- 3) 직업: 설명·이미지 키는 확정되면 채워서 다시 실행. 기본 한벌옷은 위 2)의 코드로 연결
INSERT INTO character.character_classes
  (class_code, name, description, image_key, preview_image_key, battle_effect_key, sort_order, is_active, default_item_id)
SELECT v.class_code::"character".class_code, v.name, v.description, v.image_key, v.preview_image_key, v.battle_effect_key,
       v.sort_order, v.is_active, c.item_id
FROM (VALUES
  ('WARRIOR', '검사',   NULL, NULL, NULL, NULL, 1, true, 'WARRIOR_DEFAULT_OUTFIT'),
  ('MAGE',    '마법사', NULL, NULL, NULL, NULL, 2, true, 'MAGE_DEFAULT_OUTFIT'),
  ('ARCHER',  '궁수',   NULL, NULL, NULL, NULL, 3, true, 'ARCHER_DEFAULT_OUTFIT')
) AS v(class_code, name, description, image_key, preview_image_key, battle_effect_key, sort_order, is_active, default_costume_code)
JOIN character.costumes AS c ON c.costume_code = v.default_costume_code
ON CONFLICT (class_code) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, image_key = EXCLUDED.image_key,
  preview_image_key = EXCLUDED.preview_image_key, battle_effect_key = EXCLUDED.battle_effect_key,
  sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active, default_item_id = EXCLUDED.default_item_id,
  updated_at = now();

-- 4) 검증: 어긋나면 오류를 내고 위 변경을 모두 취소
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['ACCOUNT', 'ECONOMY']::reward.level_scope[]) AS s(scope)
    WHERE NOT EXISTS (SELECT 1 FROM reward.level_thresholds t
                      WHERE t.scope = s.scope AND t.level = 1 AND t.required_exp = 0)
  ) THEN
    RAISE EXCEPTION '레벨 1(필요 EXP 0)이 없는 레벨 종류가 있습니다';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT level, required_exp,
             lag(level)        OVER (PARTITION BY scope ORDER BY level) AS prev_level,
             lag(required_exp) OVER (PARTITION BY scope ORDER BY level) AS prev_exp
      FROM reward.level_thresholds
    ) x
    WHERE prev_level IS NOT NULL AND (level <> prev_level + 1 OR required_exp <= prev_exp)
  ) THEN
    RAISE EXCEPTION '레벨 기준표가 1씩 이어지지 않거나 필요 EXP가 증가하지 않습니다';
  END IF;

  IF (SELECT count(*) FROM character.character_classes WHERE class_code IN ('WARRIOR', 'MAGE', 'ARCHER')) <> 3 THEN
    RAISE EXCEPTION '직업 3개(WARRIOR, MAGE, ARCHER)가 모두 있어야 합니다';
  END IF;

  IF EXISTS (
    SELECT 1 FROM character.character_classes cc JOIN character.costumes c ON c.item_id = cc.default_item_id
    WHERE c.is_on_sale OR c.category <> 'OUTFIT'
  ) THEN
    RAISE EXCEPTION '직업 기본 한벌옷은 OUTFIT이고 상점에서 팔지 않아야 합니다';
  END IF;
END $$;

COMMIT;

-- 결과 확인
SELECT scope, level, required_exp FROM reward.level_thresholds ORDER BY scope, level;
SELECT class_code, name, sort_order, is_active FROM character.character_classes ORDER BY sort_order;
