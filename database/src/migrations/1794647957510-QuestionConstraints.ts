import { MigrationInterface, QueryRunner } from "typeorm";

// #97 문제·선택지 저장 제약 보강 (다른 PC에서 만든 AI 문제를 DB에 바로 적재해도 잘못된 문제가 들어가지 않게)
// 1) question_choices.choice_text: varchar(255) → varchar(500) (AI 보기 최대 500자)
// 2) uq_question_choices_one_correct: 문항당 정답 1개 (is_correct = true인 행은 문항당 1개만)
// 3) CHECK: 문제 본문·해설·선택지 공백 금지, AI 생성 문제(generated_by = 'AI')는 근거 문서(source_document_ids) 1개 이상
// 4) questions.question_category(Enum CONCEPT/COMPARISON/SCENARIO/APPLICATION), learning_objective: AI 생성 결과 필드 (수동 문항은 null)
// 주의: TypeORM 자동 생성본은 1)을 DROP 후 ADD(데이터 삭제)로 만들어서, 값을 보존하는 ALTER TYPE으로 직접 수정했다.
export class QuestionConstraints1794647957510 implements MigrationInterface {
    name = 'QuestionConstraints1794647957510'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 기존 행이 새 제약을 어기면 원인을 알 수 있게 멈춘다 (임의로 값을 고치거나 지우지 않음)
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM "question_choices" WHERE "is_correct" GROUP BY "question_id" HAVING count(*) > 1) THEN
                    RAISE EXCEPTION 'question_choices에 정답(is_correct)이 2개 이상인 문항이 있습니다. 정리한 뒤 다시 실행하세요.';
                END IF;
                IF EXISTS (SELECT 1 FROM "question_choices" WHERE char_length(btrim("choice_text")) = 0) THEN
                    RAISE EXCEPTION 'question_choices에 내용이 빈 선택지가 있습니다. 정리한 뒤 다시 실행하세요.';
                END IF;
                IF EXISTS (SELECT 1 FROM "questions" WHERE char_length(btrim("question_text")) = 0 OR char_length(btrim("explanation")) = 0) THEN
                    RAISE EXCEPTION 'questions에 본문 또는 해설이 빈 문항이 있습니다. 정리한 뒤 다시 실행하세요.';
                END IF;
                IF EXISTS (SELECT 1 FROM "questions" WHERE "generated_by" = 'AI' AND COALESCE(cardinality("source_document_ids"), 0) = 0) THEN
                    RAISE EXCEPTION 'questions에 근거 문서(source_document_ids)가 없는 AI 문항이 있습니다. 정리한 뒤 다시 실행하세요.';
                END IF;
            END $$`);
        // 1) 보기 길이 확장 (늘리기만 하므로 데이터 손실 없음)
        await queryRunner.query(`ALTER TABLE "question_choices" ALTER COLUMN "choice_text" TYPE character varying(500)`);
        // 2) 문항당 정답 1개
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_question_choices_one_correct" ON "question_choices" ("question_id") WHERE "is_correct"`);
        // 3) 필수값
        await queryRunner.query(`ALTER TABLE "questions" ADD CONSTRAINT "chk_questions_question_text" CHECK (char_length(btrim(question_text)) >= 1)`);
        await queryRunner.query(`ALTER TABLE "questions" ADD CONSTRAINT "chk_questions_explanation" CHECK (char_length(btrim(explanation)) >= 1)`);
        await queryRunner.query(`ALTER TABLE "questions" ADD CONSTRAINT "chk_questions_ai_sources" CHECK ((generated_by <> 'AI'::app.generated_by) OR (COALESCE(cardinality(source_document_ids), 0) >= 1))`);
        await queryRunner.query(`ALTER TABLE "question_choices" ADD CONSTRAINT "chk_choices_choice_text" CHECK (char_length(btrim((choice_text)::text)) >= 1)`);
        // 4) AI 생성 결과 필드
        await queryRunner.query(`CREATE TYPE "app"."question_category" AS ENUM('CONCEPT', 'COMPARISON', 'SCENARIO', 'APPLICATION')`);
        await queryRunner.query(`ALTER TABLE "questions" ADD "question_category" "app"."question_category"`);
        await queryRunner.query(`ALTER TABLE "questions" ADD "learning_objective" character varying(255)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 줄이기 전에 255자를 넘는 보기가 있으면 멈춘다 (임의로 자르지 않음)
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM "question_choices" WHERE char_length("choice_text") > 255) THEN
                    RAISE EXCEPTION 'question_choices에 255자를 넘는 선택지가 있어 되돌릴 수 없습니다.';
                END IF;
            END $$`);
        await queryRunner.query(`ALTER TABLE "questions" DROP COLUMN "learning_objective"`);
        await queryRunner.query(`ALTER TABLE "questions" DROP COLUMN "question_category"`);
        await queryRunner.query(`DROP TYPE "app"."question_category"`);
        await queryRunner.query(`ALTER TABLE "question_choices" DROP CONSTRAINT "chk_choices_choice_text"`);
        await queryRunner.query(`ALTER TABLE "questions" DROP CONSTRAINT "chk_questions_ai_sources"`);
        await queryRunner.query(`ALTER TABLE "questions" DROP CONSTRAINT "chk_questions_explanation"`);
        await queryRunner.query(`ALTER TABLE "questions" DROP CONSTRAINT "chk_questions_question_text"`);
        await queryRunner.query(`DROP INDEX "app"."uq_question_choices_one_correct"`);
        await queryRunner.query(`ALTER TABLE "question_choices" ALTER COLUMN "choice_text" TYPE character varying(255)`);
    }
}
