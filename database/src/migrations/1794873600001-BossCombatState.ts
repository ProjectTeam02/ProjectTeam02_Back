import { MigrationInterface, QueryRunner } from 'typeorm';

export class BossCombatState1794873600001 implements MigrationInterface {
  name = 'BossCombatState1794873600001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE learning.learning_attempts ADD COLUMN boss_combat_state jsonb');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE learning.learning_attempts IN ACCESS EXCLUSIVE MODE');
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM learning.learning_attempts
          WHERE boss_combat_state IS NOT NULL AND status = 'IN_PROGRESS'
        ) THEN
          RAISE EXCEPTION 'Cannot remove Boss combat state while new-rule Boss attempts are in progress';
        END IF;
      END $$
    `);
    await queryRunner.query('ALTER TABLE learning.learning_attempts DROP COLUMN boss_combat_state');
  }
}
