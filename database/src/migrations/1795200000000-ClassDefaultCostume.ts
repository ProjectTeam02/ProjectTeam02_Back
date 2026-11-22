import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 직업별 기본 한벌옷
 * - 직업마다 기본 한벌옷 1개(character_classes.default_item_id, 필수). 상점에서는 팔지 않음
 * - 직업 선택 시 서버가 지급(DEFAULT)하고, 장착한 옷이 없으면 바로 장착
 * - 이미 직업을 고른 사용자도 같은 규칙으로 지급·장착 (이미 장착한 옷은 그대로 둠)
 * - 직업 공용 기본 지급 표시(costumes.is_default)는 역할이 겹쳐 삭제
 */
export class ClassDefaultCostume1795200000000 implements MigrationInterface {
  name = 'ClassDefaultCostume1795200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`LOCK TABLE character.character_classes, character.costumes IN ACCESS EXCLUSIVE MODE`);

    // 직업별 기본 한벌옷 상품. 이미지는 확정되면 database/sql/seed/01_master_data.sql로 채움
    await queryRunner.query(`
      INSERT INTO character.costumes (costume_code, name, category, price_coin, is_on_sale, sort_order) VALUES
        ('WARRIOR_DEFAULT_OUTFIT', '검사 기본 한벌옷',   'OUTFIT', NULL, false, 1),
        ('MAGE_DEFAULT_OUTFIT',    '마법사 기본 한벌옷', 'OUTFIT', NULL, false, 2),
        ('ARCHER_DEFAULT_OUTFIT',  '궁수 기본 한벌옷',   'OUTFIT', NULL, false, 3)
      ON CONFLICT (costume_code) DO NOTHING
    `);

    await queryRunner.query(`ALTER TABLE character.character_classes ADD COLUMN default_item_id uuid`);
    await queryRunner.query(`
      UPDATE character.character_classes AS cc SET default_item_id = c.item_id
      FROM character.costumes AS c
      WHERE c.costume_code = cc.class_code::text || '_DEFAULT_OUTFIT'
    `);
    await queryRunner.query(`ALTER TABLE character.character_classes ALTER COLUMN default_item_id SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE character.character_classes ADD CONSTRAINT character_classes_default_item_id_fkey
        FOREIGN KEY (default_item_id) REFERENCES character.costumes(item_id)
    `);

    // 이미 직업을 고른 사용자: 기본 한벌옷 지급, 장착한 옷이 없을 때만 장착
    await queryRunner.query(`
      INSERT INTO character.user_costumes (user_id, item_id, acquire_type)
      SELECT uc.user_id, cc.default_item_id, 'DEFAULT'
      FROM character.user_characters AS uc
      JOIN character.character_classes AS cc USING (class_id)
      ON CONFLICT (user_id, item_id) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO character.user_equipped_costumes (user_id, category, item_id)
      SELECT uc.user_id, 'OUTFIT', cc.default_item_id
      FROM character.user_characters AS uc
      JOIN character.character_classes AS cc USING (class_id)
      ON CONFLICT (user_id, category) DO NOTHING
    `);

    await queryRunner.query(`ALTER TABLE character.costumes DROP COLUMN is_default`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // 구조만 되돌림. 기본 한벌옷 상품과 이미 지급·장착한 행은 사용자 데이터라 그대로 둠
    await queryRunner.query(`ALTER TABLE character.costumes ADD COLUMN is_default boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE character.character_classes DROP CONSTRAINT character_classes_default_item_id_fkey`);
    await queryRunner.query(`ALTER TABLE character.character_classes DROP COLUMN default_item_id`);
  }
}
