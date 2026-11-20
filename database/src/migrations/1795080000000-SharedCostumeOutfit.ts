import { MigrationInterface, QueryRunner } from 'typeorm';

export class SharedCostumeOutfit1795080000000 implements MigrationInterface {
  name = 'SharedCostumeOutfit1795080000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`LOCK TABLE character.costumes, character.user_equipped_costumes IN ACCESS EXCLUSIVE MODE`);

    // A legacy pair cannot share an active slot. Keep the same winner as the previous API.
    await queryRunner.query(`
      CREATE TABLE character.legacy_equipped_costumes (
        user_id uuid NOT NULL,
        item_id uuid NOT NULL,
        category text NOT NULL CHECK (category IN ('TOP', 'BOTTOM')),
        equipped_at timestamptz NOT NULL,
        PRIMARY KEY (user_id, item_id),
        FOREIGN KEY (user_id, item_id) REFERENCES character.user_costumes(user_id, item_id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
          REVOKE ALL ON character.legacy_equipped_costumes FROM app_user;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      WITH ranked AS (
        SELECT user_id, item_id, category, equipped_at,
          row_number() OVER (PARTITION BY user_id ORDER BY equipped_at DESC, item_id ASC) AS position
        FROM character.user_equipped_costumes
      ), archived AS (
        INSERT INTO character.legacy_equipped_costumes (user_id, item_id, category, equipped_at)
        SELECT user_id, item_id, category::text, equipped_at FROM ranked WHERE position > 1
        RETURNING user_id, item_id
      )
      DELETE FROM character.user_equipped_costumes AS active
      USING archived
      WHERE active.user_id = archived.user_id AND active.item_id = archived.item_id
    `);

    await queryRunner.query(`ALTER TABLE character.user_equipped_costumes DROP CONSTRAINT fk_equipped_category`);
    await queryRunner.query(`ALTER TYPE "character".costume_category RENAME TO costume_category_legacy`);
    await queryRunner.query(`CREATE TYPE "character".costume_category AS ENUM ('OUTFIT')`);
    await queryRunner.query(`
      ALTER TABLE character.costumes ALTER COLUMN category TYPE "character".costume_category
        USING 'OUTFIT'::"character".costume_category
    `);
    await queryRunner.query(`
      ALTER TABLE character.user_equipped_costumes ALTER COLUMN category TYPE "character".costume_category
        USING 'OUTFIT'::"character".costume_category
    `);
    await queryRunner.query(`
      ALTER TABLE character.user_equipped_costumes ADD CONSTRAINT fk_equipped_category
        FOREIGN KEY (item_id, category) REFERENCES character.costumes(item_id, category)
    `);
    await queryRunner.query(`DROP TYPE "character".costume_category_legacy`);
  }

  async down(): Promise<void> {
    // The original catalog categories cannot be derived from OUTFIT, including for new products.
    throw new Error('Cannot reconstruct legacy costume categories. Restore the pre-migration backup before resuming writes.');
  }
}
