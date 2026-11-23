import { MigrationInterface, QueryRunner } from "typeorm";

// #164 선수 관계 검수 상태 + 오개념 진단 가설 테이블 (Backend 계획서 BE-05, #160 결정)
// - content.concept_prerequisites: review_status(PENDING/APPROVED/REJECTED, 기본 PENDING), reviewed_by, reviewed_at 추가
//   기존 행은 모두 PENDING으로 들어간다 (운영 26행은 적용 후 사람이 검수). APPROVED·REJECTED이면 reviewed_at 필수
// - learning.misconception_hypotheses 신규: 기본 UNCONFIRMED, CONFIRMED는 근거 제출 기록 2개 이상 (단일 오답 확정 금지)
//   같은 사용자·개념·유형의 UNCONFIRMED 가설은 1개만. 근거는 최대 20개 (AI 계약과 동일)
// - 새 테이블 app_user 권한은 01_app_schema.sql의 기본 권한(DEFAULT PRIVILEGES)으로 부여됨. 기존 데이터 변경 없음

export class ConceptReviewMisconception1795300000000 implements MigrationInterface {
    name = 'ConceptReviewMisconception1795300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "learning"."misconception_status" AS ENUM('UNCONFIRMED', 'CONFIRMED', 'REJECTED')`);
        await queryRunner.query(`CREATE TYPE "learning"."misconception_source" AS ENUM('RULE', 'AI')`);
        await queryRunner.query(`CREATE TABLE "learning"."misconception_hypotheses" ("hypothesis_id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "concept_code" character varying(30) NOT NULL, "hypothesis_type" character varying(40) NOT NULL, "status" "learning"."misconception_status" NOT NULL DEFAULT 'UNCONFIRMED', "source" "learning"."misconception_source" NOT NULL, "evidence_submission_ids" uuid array NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resolved_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_misconception_resolved_at" CHECK (((status = 'UNCONFIRMED') AND (resolved_at IS NULL)) OR ((status <> 'UNCONFIRMED') AND (resolved_at IS NOT NULL))), CONSTRAINT "chk_misconception_confirmed_evidence" CHECK ((status <> 'CONFIRMED') OR (cardinality(evidence_submission_ids) >= 2)), CONSTRAINT "chk_misconception_evidence_max" CHECK (cardinality(evidence_submission_ids) <= 20), CONSTRAINT "chk_misconception_type_not_blank" CHECK (btrim((hypothesis_type)::text) <> ''), CONSTRAINT "misconception_hypotheses_pkey" PRIMARY KEY ("hypothesis_id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_misconception_hypotheses_one_unconfirmed" ON "learning"."misconception_hypotheses" ("user_id", "concept_code", "hypothesis_type") WHERE "status" = 'UNCONFIRMED'`);
        await queryRunner.query(`CREATE INDEX "misconception_hypotheses_user_id_concept_code_idx" ON "learning"."misconception_hypotheses" ("user_id", "concept_code") `);
        await queryRunner.query(`CREATE TYPE "content"."relation_review_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`);
        await queryRunner.query(`ALTER TABLE "content"."concept_prerequisites" ADD "review_status" "content"."relation_review_status" NOT NULL DEFAULT 'PENDING'`);
        await queryRunner.query(`ALTER TABLE "content"."concept_prerequisites" ADD "reviewed_by" uuid`);
        await queryRunner.query(`ALTER TABLE "content"."concept_prerequisites" ADD "reviewed_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "content"."concept_prerequisites" ADD CONSTRAINT "chk_concept_prereq_reviewed_at" CHECK ((review_status = 'PENDING') OR (reviewed_at IS NOT NULL))`);
        await queryRunner.query(`ALTER TABLE "content"."concept_prerequisites" ADD CONSTRAINT "concept_prerequisites_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "account"."users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "learning"."misconception_hypotheses" ADD CONSTRAINT "misconception_hypotheses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account"."users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "learning"."misconception_hypotheses" DROP CONSTRAINT "misconception_hypotheses_user_id_fkey"`);
        await queryRunner.query(`ALTER TABLE "content"."concept_prerequisites" DROP CONSTRAINT "concept_prerequisites_reviewed_by_fkey"`);
        await queryRunner.query(`ALTER TABLE "content"."concept_prerequisites" DROP CONSTRAINT "chk_concept_prereq_reviewed_at"`);
        await queryRunner.query(`ALTER TABLE "content"."concept_prerequisites" DROP COLUMN "reviewed_at"`);
        await queryRunner.query(`ALTER TABLE "content"."concept_prerequisites" DROP COLUMN "reviewed_by"`);
        await queryRunner.query(`ALTER TABLE "content"."concept_prerequisites" DROP COLUMN "review_status"`);
        await queryRunner.query(`DROP TYPE "content"."relation_review_status"`);
        await queryRunner.query(`DROP INDEX "learning"."misconception_hypotheses_user_id_concept_code_idx"`);
        await queryRunner.query(`DROP INDEX "learning"."uq_misconception_hypotheses_one_unconfirmed"`);
        await queryRunner.query(`DROP TABLE "learning"."misconception_hypotheses"`);
        await queryRunner.query(`DROP TYPE "learning"."misconception_source"`);
        await queryRunner.query(`DROP TYPE "learning"."misconception_status"`);
    }

}
