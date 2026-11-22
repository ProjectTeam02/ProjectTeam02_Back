-- 판매 한벌옷: 상점(GET /api/v1/shop/costumes)에 나오는 상품 (character.costumes, is_on_sale = true)
-- 로컬과 RDS에 같은 파일로 적용. 여러 번 실행해도 같은 결과 (같은 costume_code 행은 값만 갱신)
-- 실행 계정: 로컬 postgres / RDS app_user 또는 migrator (마이그레이션 적용 후, 01_master_data.sql 다음)
--
-- [임시값] 상품명·가격·설명은 확정 전 임시값. 확정되면 아래 VALUES만 고쳐서 다시 실행
-- 이미지 키: 앱에 포함된 이미지 파일 경로 (프론트 frontend/assets/<image_key>)
--            나중에 S3·CloudFront로 옮기면 같은 키를 객체 경로로 사용
-- 판매 중지: 그 줄의 is_on_sale만 false로 바꿔 다시 실행. 이미 산 사용자의 보유·장착은 유지
-- 행 삭제·costume_code 변경 금지: 구매 원장(coin_ledger.ref_id)과 보유 기록이 item_id를 참조
BEGIN;

INSERT INTO character.costumes
  (costume_code, name, description, flavor_text, category, price_coin, image_key, thumbnail_key, is_on_sale, sort_order)
SELECT v.costume_code, v.name, v.description, v.flavor_text, 'OUTFIT', v.price_coin,
       v.image_key, v.thumbnail_key, v.is_on_sale, v.sort_order
FROM (VALUES
  -- costume_code,     name,            description, flavor_text, price_coin, image_key,                       thumbnail_key,                    is_on_sale, sort_order
  ('BLUE_DAWN_ROBE',  '푸른 새벽 로브', NULL,        NULL,         50,        'costumes/blue_dawn_robe.png',  'costumes/blue_dawn_robe.png',  true,       10),
  ('STARLIGHT_ROBE',  '별빛 로브',      NULL,        NULL,        100,        'costumes/starlight_robe.png',  'costumes/starlight_robe.png',  true,       20),
  ('GOLDEN_GUARDIAN', '황금 수호자',    NULL,        NULL,        150,        'costumes/golden_guardian.png', 'costumes/golden_guardian.png', true,       30)
) AS v(costume_code, name, description, flavor_text, price_coin, image_key, thumbnail_key, is_on_sale, sort_order)
ON CONFLICT (costume_code) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, flavor_text = EXCLUDED.flavor_text,
  price_coin = EXCLUDED.price_coin, image_key = EXCLUDED.image_key, thumbnail_key = EXCLUDED.thumbnail_key,
  is_on_sale = EXCLUDED.is_on_sale, sort_order = EXCLUDED.sort_order, updated_at = now();

-- 검증: 어긋나면 오류를 내고 위 변경을 모두 취소
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM character.costumes
    WHERE is_on_sale AND (price_coin IS NULL OR price_coin < 0 OR NULLIF(btrim(image_key), '') IS NULL
                          OR NULLIF(btrim(thumbnail_key), '') IS NULL)
  ) THEN
    RAISE EXCEPTION '판매 상품에는 가격(0 이상)과 image_key·thumbnail_key가 있어야 합니다';
  END IF;

  IF EXISTS (
    SELECT 1 FROM character.costumes c JOIN character.character_classes cc ON cc.default_item_id = c.item_id
    WHERE c.is_on_sale
  ) THEN
    RAISE EXCEPTION '직업 기본 한벌옷은 상점에서 팔 수 없습니다';
  END IF;
END $$;

COMMIT;

-- 결과 확인: 지금 상점에 나오는 상품
SELECT costume_code, name, price_coin, image_key, sort_order
FROM character.costumes WHERE is_on_sale ORDER BY sort_order, costume_code;
