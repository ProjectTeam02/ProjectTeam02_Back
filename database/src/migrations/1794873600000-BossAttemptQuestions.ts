import { MigrationInterface, QueryRunner } from 'typeorm';

export class BossAttemptQuestions1794873600000 implements MigrationInterface {
  name = 'BossAttemptQuestions1794873600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE learning.boss_attempt_questions (
        attempt_id uuid NOT NULL,
        question_order smallint NOT NULL,
        question_id uuid NOT NULL,
        CONSTRAINT boss_attempt_questions_pkey PRIMARY KEY (attempt_id, question_order),
        CONSTRAINT uq_boss_attempt_questions_question UNIQUE (attempt_id, question_id),
        CONSTRAINT chk_boss_attempt_questions_order CHECK (question_order BETWEEN 1 AND 7),
        CONSTRAINT boss_attempt_questions_attempt_id_fkey FOREIGN KEY (attempt_id)
          REFERENCES learning.learning_attempts (attempt_id) ON DELETE CASCADE,
        CONSTRAINT boss_attempt_questions_question_id_fkey FOREIGN KEY (question_id)
          REFERENCES content.questions (question_id)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE learning.boss_attempt_questions IN ACCESS EXCLUSIVE MODE');
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM learning.boss_attempt_questions AS snapshot
          JOIN learning.learning_attempts AS attempt USING (attempt_id)
          WHERE attempt.status = 'IN_PROGRESS'
        ) THEN
          RAISE EXCEPTION 'Cannot drop Boss question snapshots while Boss attempts are in progress';
        END IF;
      END $$
    `);
    await queryRunner.query('DROP TABLE learning.boss_attempt_questions');
  }
}
