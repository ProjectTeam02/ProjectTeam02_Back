import { MigrationInterface, QueryRunner } from "typeorm";

// rev.8: 화면 검토(피그마 06·08·10) 반영
// 1) glossary_terms + concept_terms: 개념별 용어 (클리어 화면 "학습 키워드 N개")
// 2) badges + user_badges: 배지 마스터·획득 기록 (마이페이지 "획득 배지 N개"). 조건은 미정이라 condition_type은 문자열
// 3) user_settings: daily_goal_count → goal_count 이름 변경 + goal_period(Enum, 현재 WEEKLY만) 추가 (마이페이지 "목표 달성률")
// 4) concept_sections: page_no >= 1, sort_order >= 1 CHECK
// 주의: TypeORM 자동 생성본은 3)을 DROP 후 ADD(데이터 삭제)로 만들어서, 값을 보존하는 RENAME으로 직접 수정했다.
//       기존 값은 그대로 옮겨지므로, 하루 기준으로 넣은 값이 있다면 주 단위 값으로 다시 설정해야 한다.
export class GlossaryBadgeGoal1794105526130 implements MigrationInterface {
    name = 'GlossaryBadgeGoal1794105526130'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 기존 행이 새 CHECK를 어기면 원인을 알 수 있게 멈춘다
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM "concept_sections" WHERE "page_no" < 1 OR "sort_order" < 1) THEN
                    RAISE EXCEPTION 'concept_sections에 page_no 또는 sort_order가 1보다 작은 행이 있습니다. 정리한 뒤 다시 실행하세요.';
                END IF;
            END $$`);

        // 1) 용어
        await queryRunner.query(`CREATE TABLE "glossary_terms" ("term_id" uuid NOT NULL DEFAULT gen_random_uuid(), "term_code" character varying(30) NOT NULL, "term" character varying(50) NOT NULL, "definition" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "glossary_terms_term_code_key" UNIQUE ("term_code"), CONSTRAINT "chk_glossary_terms_definition" CHECK (char_length((definition)::text) >= 1), CONSTRAINT "chk_glossary_terms_term" CHECK (char_length((term)::text) >= 1), CONSTRAINT "glossary_terms_pkey" PRIMARY KEY ("term_id"))`);
        await queryRunner.query(`CREATE TABLE "concept_terms" ("concept_code" character varying(30) NOT NULL, "term_id" uuid NOT NULL, "display_order" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "concept_terms_pkey" PRIMARY KEY ("concept_code", "term_id"))`);
        await queryRunner.query(`CREATE INDEX "concept_terms_term_id_idx" ON "concept_terms" ("term_id") `);
        await queryRunner.query(`ALTER TABLE "concept_terms" ADD CONSTRAINT "concept_terms_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "glossary_terms"("term_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        // 2) 배지
        await queryRunner.query(`CREATE TABLE "badges" ("badge_id" uuid NOT NULL DEFAULT gen_random_uuid(), "badge_code" character varying(50) NOT NULL, "name" character varying(50) NOT NULL, "description" character varying(255), "icon_key" character varying(255), "condition_type" character varying(50), "condition_value" integer, "sort_order" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "badges_badge_code_key" UNIQUE ("badge_code"), CONSTRAINT "chk_badges_condition_value" CHECK ((condition_value IS NULL) OR (condition_value > 0)), CONSTRAINT "badges_pkey" PRIMARY KEY ("badge_id"))`);
        await queryRunner.query(`CREATE TABLE "user_badges" ("user_id" uuid NOT NULL, "badge_id" uuid NOT NULL, "earned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "user_badges_pkey" PRIMARY KEY ("user_id", "badge_id"))`);
        await queryRunner.query(`CREATE INDEX "user_badges_user_id_earned_at_idx" ON "user_badges" ("user_id", "earned_at") `);
        await queryRunner.query(`ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("badge_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        // 3) 목표 (값 보존)
        await queryRunner.query(`ALTER TABLE "user_settings" DROP CONSTRAINT "chk_settings_daily_goal"`);
        await queryRunner.query(`ALTER TABLE "user_settings" RENAME COLUMN "daily_goal_count" TO "goal_count"`);
        await queryRunner.query(`ALTER TABLE "user_settings" ADD CONSTRAINT "chk_settings_goal_count" CHECK ((goal_count IS NULL) OR (goal_count > 0))`);
        await queryRunner.query(`CREATE TYPE "app"."goal_period" AS ENUM('WEEKLY')`);
        await queryRunner.query(`ALTER TABLE "user_settings" ADD "goal_period" "app"."goal_period" NOT NULL DEFAULT 'WEEKLY'`);

        // 4) 학습 카드 번호
        await queryRunner.query(`ALTER TABLE "concept_sections" ADD CONSTRAINT "chk_concept_sections_page_no" CHECK (page_no >= 1)`);
        await queryRunner.query(`ALTER TABLE "concept_sections" ADD CONSTRAINT "chk_concept_sections_sort_order" CHECK (sort_order >= 1)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "concept_sections" DROP CONSTRAINT "chk_concept_sections_sort_order"`);
        await queryRunner.query(`ALTER TABLE "concept_sections" DROP CONSTRAINT "chk_concept_sections_page_no"`);

        await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "goal_period"`);
        await queryRunner.query(`DROP TYPE "app"."goal_period"`);
        await queryRunner.query(`ALTER TABLE "user_settings" DROP CONSTRAINT "chk_settings_goal_count"`);
        await queryRunner.query(`ALTER TABLE "user_settings" RENAME COLUMN "goal_count" TO "daily_goal_count"`);
        await queryRunner.query(`ALTER TABLE "user_settings" ADD CONSTRAINT "chk_settings_daily_goal" CHECK ((daily_goal_count IS NULL) OR (daily_goal_count > 0))`);

        await queryRunner.query(`ALTER TABLE "user_badges" DROP CONSTRAINT "user_badges_badge_id_fkey"`);
        await queryRunner.query(`ALTER TABLE "user_badges" DROP CONSTRAINT "user_badges_user_id_fkey"`);
        await queryRunner.query(`DROP INDEX "app"."user_badges_user_id_earned_at_idx"`);
        await queryRunner.query(`DROP TABLE "user_badges"`);
        await queryRunner.query(`DROP TABLE "badges"`);

        await queryRunner.query(`ALTER TABLE "concept_terms" DROP CONSTRAINT "concept_terms_term_id_fkey"`);
        await queryRunner.query(`DROP INDEX "app"."concept_terms_term_id_idx"`);
        await queryRunner.query(`DROP TABLE "concept_terms"`);
        await queryRunner.query(`DROP TABLE "glossary_terms"`);
    }

}
