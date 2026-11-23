import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 선수 개념 관계를 사람이 승인한 관계와 구분한다.
 * 기존 관계는 근거가 없는 상태에서 자동 승인하지 않고 REVIEW_PENDING으로 남긴다.
 */
export class ConceptPrerequisiteReview1795200000000 implements MigrationInterface {
  name = 'ConceptPrerequisiteReview1795200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE content.concept_prerequisites
        ADD COLUMN review_status varchar(30) NOT NULL DEFAULT 'REVIEW_PENDING',
        ADD COLUMN reviewed_by uuid,
        ADD COLUMN reviewed_at timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE content.concept_prerequisites
        ADD CONSTRAINT chk_concept_prereq_review_status
        CHECK (review_status IN ('REVIEW_PENDING', 'APPROVED', 'REJECTED'))
    `);
    await queryRunner.query(`
      ALTER TABLE content.concept_prerequisites
        ADD CONSTRAINT concept_prerequisites_reviewed_by_fkey
        FOREIGN KEY (reviewed_by) REFERENCES account.users (user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX concept_prerequisites_review_status_idx
        ON content.concept_prerequisites (review_status)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX content.concept_prerequisites_review_status_idx',
    );
    await queryRunner.query(
      'ALTER TABLE content.concept_prerequisites DROP CONSTRAINT concept_prerequisites_reviewed_by_fkey',
    );
    await queryRunner.query(
      'ALTER TABLE content.concept_prerequisites DROP CONSTRAINT chk_concept_prereq_review_status',
    );
    await queryRunner.query(`
      ALTER TABLE content.concept_prerequisites
        DROP COLUMN reviewed_at,
        DROP COLUMN reviewed_by,
        DROP COLUMN review_status
    `);
  }
}
