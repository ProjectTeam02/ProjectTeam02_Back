import { MigrationInterface, QueryRunner } from 'typeorm';

export class TutorMessageMetadata1795650000000 implements MigrationInterface {
  name = 'TutorMessageMetadata1795650000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tutor"."ai_messages"
      ADD COLUMN "tutoring_meta" jsonb,
      ADD COLUMN "proposed_action" jsonb`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tutor"."ai_messages"
      DROP COLUMN "proposed_action",
      DROP COLUMN "tutoring_meta"`);
  }
}
