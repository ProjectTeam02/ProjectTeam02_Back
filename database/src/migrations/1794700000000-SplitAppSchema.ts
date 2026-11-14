import { MigrationInterface, QueryRunner } from "typeorm";

// #98 app 스키마를 영역별 스키마 7개로 분리 (테이블 47개, Enum 54개 이동)
// - 테이블·컬럼·제약·인덱스 이름은 그대로, 위치(스키마)만 바뀐다 → API·DTO 변경 없음
// - ALTER TABLE/TYPE ... SET SCHEMA는 데이터·인덱스·제약·권한(GRANT)을 그대로 옮긴다 (데이터 손실 없음)
// - 스키마 7개는 01_app_schema.sql(관리자 계정)이 만든다. 이 마이그레이션은 migrator 권한으로 옮기기만 한다
// - app 스키마에는 TypeORM 관리용(migrations, typeorm_metadata)만 남는다
// - Enum은 그 Enum을 쓰는 테이블과 같은 스키마로 옮긴다 (여러 영역이 같이 쓰는 Enum 없음)
// 적용 순서 (RDS): 스냅샷 → 01_app_schema.sql 다시 실행 → 이 마이그레이션 → 새 백엔드 배포 (엔티티가 새 스키마 이름을 쓰므로 함께 배포)
export class SplitAppSchema1794700000000 implements MigrationInterface {
    name = 'SplitAppSchema1794700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 스키마 7개가 없으면 원인을 알 수 있게 멈춘다 (01_app_schema.sql을 먼저 실행)
        await queryRunner.query(`
            DO $$
            DECLARE missing text;
            BEGIN
                SELECT string_agg(s, ', ') INTO missing
                FROM unnest(ARRAY['account', 'character', 'content', 'learning', 'reward', 'review', 'tutor']) AS s
                WHERE NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s);
                IF missing IS NOT NULL THEN
                    RAISE EXCEPTION '스키마가 없습니다: %. 관리자 계정으로 database/sql/init/01_app_schema.sql을 먼저 실행하세요.', missing;
                END IF;
            END $$`);
        // account: 계정·인증·약관 (테이블 9개, Enum 11개)
        await queryRunner.query(`ALTER TABLE "app"."account_tokens" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TABLE "app"."kakao_oauth_entries" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TABLE "app"."social_accounts" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TABLE "app"."terms" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TABLE "app"."user_devices" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TABLE "app"."user_sessions" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TABLE "app"."user_settings" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TABLE "app"."user_terms_agreements" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TABLE "app"."users" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TYPE "app"."account_status" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TYPE "app"."device_platform" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TYPE "app"."goal_period" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TYPE "app"."session_revoke_reason" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TYPE "app"."social_provider" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TYPE "app"."terms_type" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TYPE "app"."token_type" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TYPE "app"."user_plan" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TYPE "app"."user_role" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TYPE "app"."user_sessions_login_method" SET SCHEMA "account"`);
        await queryRunner.query(`ALTER TYPE "app"."users_last_login_method" SET SCHEMA "account"`);
        // character: 캐릭터·상점 (테이블 5개, Enum 3개)
        await queryRunner.query(`ALTER TABLE "app"."character_classes" SET SCHEMA "character"`);
        await queryRunner.query(`ALTER TABLE "app"."costumes" SET SCHEMA "character"`);
        await queryRunner.query(`ALTER TABLE "app"."user_characters" SET SCHEMA "character"`);
        await queryRunner.query(`ALTER TABLE "app"."user_costumes" SET SCHEMA "character"`);
        await queryRunner.query(`ALTER TABLE "app"."user_equipped_costumes" SET SCHEMA "character"`);
        await queryRunner.query(`ALTER TYPE "app"."class_code" SET SCHEMA "character"`);
        await queryRunner.query(`ALTER TYPE "app"."costume_acquire_type" SET SCHEMA "character"`);
        await queryRunner.query(`ALTER TYPE "app"."costume_category" SET SCHEMA "character"`);
        // content: 학습 콘텐츠 (테이블 12개, Enum 11개)
        await queryRunner.query(`ALTER TABLE "app"."concept_prerequisites" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TABLE "app"."concept_sections" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TABLE "app"."concept_terms" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TABLE "app"."concepts" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TABLE "app"."glossary_terms" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TABLE "app"."question_choices" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TABLE "app"."questions" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TABLE "app"."stage_concepts" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TABLE "app"."stage_questions" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TABLE "app"."stages" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TABLE "app"."topic_prerequisites" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TABLE "app"."topics" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TYPE "app"."card_tone" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TYPE "app"."concept_status" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TYPE "app"."difficulty" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TYPE "app"."generated_by" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TYPE "app"."question_category" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TYPE "app"."question_status" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TYPE "app"."question_type" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TYPE "app"."section_type" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TYPE "app"."stage_type" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TYPE "app"."stages_status" SET SCHEMA "content"`);
        await queryRunner.query(`ALTER TYPE "app"."topics_status" SET SCHEMA "content"`);
        // learning: 진행도·퀴즈 (테이블 3개, Enum 5개)
        await queryRunner.query(`ALTER TABLE "app"."learning_attempts" SET SCHEMA "learning"`);
        await queryRunner.query(`ALTER TABLE "app"."question_submissions" SET SCHEMA "learning"`);
        await queryRunner.query(`ALTER TABLE "app"."user_stage_progress" SET SCHEMA "learning"`);
        await queryRunner.query(`ALTER TYPE "app"."attempt_end_reason" SET SCHEMA "learning"`);
        await queryRunner.query(`ALTER TYPE "app"."attempt_mode" SET SCHEMA "learning"`);
        await queryRunner.query(`ALTER TYPE "app"."attempt_status" SET SCHEMA "learning"`);
        await queryRunner.query(`ALTER TYPE "app"."attempt_type" SET SCHEMA "learning"`);
        await queryRunner.query(`ALTER TYPE "app"."progress_status" SET SCHEMA "learning"`);
        // reward: 보상·성장 (테이블 7개, Enum 5개)
        await queryRunner.query(`ALTER TABLE "app"."badges" SET SCHEMA "reward"`);
        await queryRunner.query(`ALTER TABLE "app"."coin_ledger" SET SCHEMA "reward"`);
        await queryRunner.query(`ALTER TABLE "app"."exp_ledger" SET SCHEMA "reward"`);
        await queryRunner.query(`ALTER TABLE "app"."level_thresholds" SET SCHEMA "reward"`);
        await queryRunner.query(`ALTER TABLE "app"."user_badges" SET SCHEMA "reward"`);
        await queryRunner.query(`ALTER TABLE "app"."user_growth" SET SCHEMA "reward"`);
        await queryRunner.query(`ALTER TABLE "app"."user_wallets" SET SCHEMA "reward"`);
        await queryRunner.query(`ALTER TYPE "app"."coin_reason" SET SCHEMA "reward"`);
        await queryRunner.query(`ALTER TYPE "app"."coin_ref_type" SET SCHEMA "reward"`);
        await queryRunner.query(`ALTER TYPE "app"."coin_transaction_type" SET SCHEMA "reward"`);
        await queryRunner.query(`ALTER TYPE "app"."exp_source_type" SET SCHEMA "reward"`);
        await queryRunner.query(`ALTER TYPE "app"."level_scope" SET SCHEMA "reward"`);
        // review: 오답·복습·일정 (테이블 5개, Enum 8개)
        await queryRunner.query(`ALTER TABLE "app"."review_attempts" SET SCHEMA "review"`);
        await queryRunner.query(`ALTER TABLE "app"."review_items" SET SCHEMA "review"`);
        await queryRunner.query(`ALTER TABLE "app"."review_missions" SET SCHEMA "review"`);
        await queryRunner.query(`ALTER TABLE "app"."review_submissions" SET SCHEMA "review"`);
        await queryRunner.query(`ALTER TABLE "app"."study_plans" SET SCHEMA "review"`);
        await queryRunner.query(`ALTER TYPE "app"."answer_result" SET SCHEMA "review"`);
        await queryRunner.query(`ALTER TYPE "app"."plan_status" SET SCHEMA "review"`);
        await queryRunner.query(`ALTER TYPE "app"."plan_type" SET SCHEMA "review"`);
        await queryRunner.query(`ALTER TYPE "app"."review_attempt_status" SET SCHEMA "review"`);
        await queryRunner.query(`ALTER TYPE "app"."review_attempt_type" SET SCHEMA "review"`);
        await queryRunner.query(`ALTER TYPE "app"."review_entry_point" SET SCHEMA "review"`);
        await queryRunner.query(`ALTER TYPE "app"."review_first_reason" SET SCHEMA "review"`);
        await queryRunner.query(`ALTER TYPE "app"."review_mission_status" SET SCHEMA "review"`);
        // tutor: AI 튜터 대화 (테이블 6개, Enum 11개)
        await queryRunner.query(`ALTER TABLE "app"."ai_conversation_summaries" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TABLE "app"."ai_conversations" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TABLE "app"."ai_message_sources" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TABLE "app"."ai_messages" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TABLE "app"."ai_requests" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TABLE "app"."ai_user_memories" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TYPE "app"."ai_entry_point" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TYPE "app"."ai_memory_status" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TYPE "app"."ai_memory_type" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TYPE "app"."ai_request_status" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TYPE "app"."ai_request_type" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TYPE "app"."conversation_status" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TYPE "app"."grounding_status" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TYPE "app"."message_input_type" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TYPE "app"."message_role" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TYPE "app"."message_status" SET SCHEMA "tutor"`);
        await queryRunner.query(`ALTER TYPE "app"."model_tier" SET SCHEMA "tutor"`);
        // 생성 컬럼 메타데이터 (ai_requests.usage_date)를 새 스키마로
        await queryRunner.query(`UPDATE "app"."typeorm_metadata" SET "schema" = 'tutor' WHERE "type" = 'GENERATED_COLUMN' AND "schema" = 'app' AND "table" = 'ai_requests'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`UPDATE "app"."typeorm_metadata" SET "schema" = 'app' WHERE "type" = 'GENERATED_COLUMN' AND "schema" = 'tutor' AND "table" = 'ai_requests'`);
        // account
        await queryRunner.query(`ALTER TABLE "account"."account_tokens" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "account"."kakao_oauth_entries" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "account"."social_accounts" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "account"."terms" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "account"."user_devices" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "account"."user_sessions" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "account"."user_settings" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "account"."user_terms_agreements" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "account"."users" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "account"."account_status" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "account"."device_platform" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "account"."goal_period" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "account"."session_revoke_reason" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "account"."social_provider" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "account"."terms_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "account"."token_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "account"."user_plan" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "account"."user_role" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "account"."user_sessions_login_method" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "account"."users_last_login_method" SET SCHEMA "app"`);
        // character
        await queryRunner.query(`ALTER TABLE "character"."character_classes" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "character"."costumes" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "character"."user_characters" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "character"."user_costumes" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "character"."user_equipped_costumes" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "character"."class_code" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "character"."costume_acquire_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "character"."costume_category" SET SCHEMA "app"`);
        // content
        await queryRunner.query(`ALTER TABLE "content"."concept_prerequisites" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "content"."concept_sections" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "content"."concept_terms" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "content"."concepts" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "content"."glossary_terms" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "content"."question_choices" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "content"."questions" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "content"."stage_concepts" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "content"."stage_questions" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "content"."stages" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "content"."topic_prerequisites" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "content"."topics" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "content"."card_tone" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "content"."concept_status" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "content"."difficulty" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "content"."generated_by" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "content"."question_category" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "content"."question_status" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "content"."question_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "content"."section_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "content"."stage_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "content"."stages_status" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "content"."topics_status" SET SCHEMA "app"`);
        // learning
        await queryRunner.query(`ALTER TABLE "learning"."learning_attempts" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "learning"."question_submissions" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "learning"."user_stage_progress" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "learning"."attempt_end_reason" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "learning"."attempt_mode" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "learning"."attempt_status" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "learning"."attempt_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "learning"."progress_status" SET SCHEMA "app"`);
        // reward
        await queryRunner.query(`ALTER TABLE "reward"."badges" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "reward"."coin_ledger" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "reward"."exp_ledger" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "reward"."level_thresholds" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "reward"."user_badges" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "reward"."user_growth" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "reward"."user_wallets" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "reward"."coin_reason" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "reward"."coin_ref_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "reward"."coin_transaction_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "reward"."exp_source_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "reward"."level_scope" SET SCHEMA "app"`);
        // review
        await queryRunner.query(`ALTER TABLE "review"."review_attempts" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "review"."review_items" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "review"."review_missions" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "review"."review_submissions" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "review"."study_plans" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "review"."answer_result" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "review"."plan_status" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "review"."plan_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "review"."review_attempt_status" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "review"."review_attempt_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "review"."review_entry_point" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "review"."review_first_reason" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "review"."review_mission_status" SET SCHEMA "app"`);
        // tutor
        await queryRunner.query(`ALTER TABLE "tutor"."ai_conversation_summaries" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "tutor"."ai_conversations" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "tutor"."ai_message_sources" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "tutor"."ai_messages" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "tutor"."ai_requests" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TABLE "tutor"."ai_user_memories" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "tutor"."ai_entry_point" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "tutor"."ai_memory_status" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "tutor"."ai_memory_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "tutor"."ai_request_status" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "tutor"."ai_request_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "tutor"."conversation_status" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "tutor"."grounding_status" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "tutor"."message_input_type" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "tutor"."message_role" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "tutor"."message_status" SET SCHEMA "app"`);
        await queryRunner.query(`ALTER TYPE "tutor"."model_tier" SET SCHEMA "app"`);
        // 빈 스키마 7개는 남겨 둔다 (01_app_schema.sql이 관리, 다시 적용할 때 사용)
    }
}
