import { MigrationInterface, QueryRunner } from "typeorm";

// rev.7: 멀티턴 RAG 메모리 (AI 파트 멀티턴 구현용 DB)
// 1) ai_conversation_summaries: 대화 요약 이력 (rolling summary, 요약할 때마다 1행 추가)
// 2) ai_messages.summary_id: 답변 생성에 쓴 요약 → history_from_seq와 함께 답변 재현
// 3) ai_user_memories (+ Enum ai_memory_type, ai_memory_status): 대화방을 넘는 사용자 장기 메모리
// 4) ai_conversations: summary와 summary_until_seq는 항상 같이 채움 (CHECK)
// 5) ai_message_sources: 길이를 ai 스키마 rag_* 테이블과 맞춤 (document_id·chunk_id 255, document_version 100, title_snapshot 500)
// 6) ai_messages(summary_id) 인덱스: 탈퇴 시 요약 행을 지울 때 FK 확인이 메시지 전체를 훑지 않게
// 탈퇴 정책(2026-11-03 결정): AI 대화는 행을 남기고 본문만 비움 → FK 삭제 동작(CASCADE)은 바꾸지 않음
// 주의: TypeORM 자동 생성본은 5)를 DROP 후 ADD(데이터 삭제)로 만들어서, 값을 보존하는 ALTER TYPE으로 직접 수정했다.
export class AiMultiturnMemory1793620640955 implements MigrationInterface {
    name = 'AiMultiturnMemory1793620640955'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 기존 행이 새 CHECK를 어기면 원인을 알 수 있게 멈춘다
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM "ai_conversations" WHERE ("summary" IS NULL) <> ("summary_until_seq" IS NULL)) THEN
                    RAISE EXCEPTION 'ai_conversations에 summary와 summary_until_seq 중 하나만 있는 행이 있습니다. 정리한 뒤 다시 실행하세요.';
                END IF;
            END $$`);

        // 1) 요약 이력
        await queryRunner.query(`CREATE TABLE "ai_conversation_summaries" ("summary_id" uuid NOT NULL DEFAULT gen_random_uuid(), "conversation_id" uuid NOT NULL, "summary_until_seq" integer NOT NULL, "content" text NOT NULL, "token_count" integer, "request_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ai_conversation_summaries_conversation_id_summary_until_seq_key" UNIQUE ("conversation_id", "summary_until_seq"), CONSTRAINT "chk_ai_summaries_content" CHECK ((char_length(content) >= 1) AND (char_length(content) <= 12000)), CONSTRAINT "chk_ai_summaries_until_seq" CHECK (summary_until_seq >= 1), CONSTRAINT "ai_conversation_summaries_pkey" PRIMARY KEY ("summary_id"))`);
        await queryRunner.query(`ALTER TABLE "ai_conversation_summaries" ADD CONSTRAINT "ai_conversation_summaries_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("conversation_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ai_conversation_summaries" ADD CONSTRAINT "ai_conversation_summaries_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ai_requests"("request_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        // 2) 답변이 쓴 요약
        await queryRunner.query(`ALTER TABLE "ai_messages" ADD "summary_id" uuid`);
        await queryRunner.query(`ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_summary_id_fkey" FOREIGN KEY ("summary_id") REFERENCES "ai_conversation_summaries"("summary_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE INDEX "ai_messages_summary_id_idx" ON "ai_messages" ("summary_id") `);

        // 3) 장기 메모리
        await queryRunner.query(`CREATE TYPE "app"."ai_memory_type" AS ENUM('PREFERENCE', 'MISCONCEPTION', 'GOAL', 'INTEREST')`);
        await queryRunner.query(`CREATE TYPE "app"."ai_memory_status" AS ENUM('ACTIVE', 'ARCHIVED')`);
        await queryRunner.query(`CREATE TABLE "ai_user_memories" ("memory_id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "memory_type" "app"."ai_memory_type" NOT NULL, "memory_key" character varying(100), "content" character varying(500) NOT NULL, "concept_code" character varying(30), "confidence" numeric(3,2), "source_message_id" uuid, "status" "app"."ai_memory_status" NOT NULL DEFAULT 'ACTIVE', "archived_at" TIMESTAMP WITH TIME ZONE, "last_used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ai_user_memories_user_id_memory_type_memory_key_key" UNIQUE ("user_id", "memory_type", "memory_key"), CONSTRAINT "chk_ai_memories_archived" CHECK ((status = 'ARCHIVED'::ai_memory_status) = (archived_at IS NOT NULL)), CONSTRAINT "chk_ai_memories_confidence" CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)), CONSTRAINT "chk_ai_memories_content" CHECK ((char_length((content)::text) >= 1) AND (char_length((content)::text) <= 500)), CONSTRAINT "ai_user_memories_pkey" PRIMARY KEY ("memory_id"))`);
        await queryRunner.query(`CREATE INDEX "ai_user_memories_user_id_status_updated_at_idx" ON "ai_user_memories" ("user_id", "status", "updated_at") `);
        await queryRunner.query(`ALTER TABLE "ai_user_memories" ADD CONSTRAINT "ai_user_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ai_user_memories" ADD CONSTRAINT "ai_user_memories_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "ai_messages"("message_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        // 4) 요약 짝 맞춤
        await queryRunner.query(`ALTER TABLE "ai_conversations" ADD CONSTRAINT "chk_ai_conversations_summary" CHECK ((summary IS NULL) = (summary_until_seq IS NULL))`);

        // 5) 근거 길이 확장 (늘리기만 하므로 데이터 손실 없음, 유니크 제약은 그대로 유지됨)
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "document_id" TYPE character varying(255)`);
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "chunk_id" TYPE character varying(255)`);
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "document_version" TYPE character varying(100)`);
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "title_snapshot" TYPE character varying(500)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 줄이기 전에 긴 값이 있으면 멈춘다 (임의로 자르지 않음)
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM "ai_message_sources" WHERE char_length("document_id") > 100 OR char_length("chunk_id") > 100 OR char_length("document_version") > 50 OR char_length("title_snapshot") > 255) THEN
                    RAISE EXCEPTION 'ai_message_sources에 rev.6 길이를 넘는 값이 있어 되돌릴 수 없습니다.';
                END IF;
            END $$`);
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "title_snapshot" TYPE character varying(255)`);
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "document_version" TYPE character varying(50)`);
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "chunk_id" TYPE character varying(100)`);
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "document_id" TYPE character varying(100)`);
        await queryRunner.query(`ALTER TABLE "ai_conversations" DROP CONSTRAINT "chk_ai_conversations_summary"`);
        await queryRunner.query(`ALTER TABLE "ai_user_memories" DROP CONSTRAINT "ai_user_memories_source_message_id_fkey"`);
        await queryRunner.query(`ALTER TABLE "ai_user_memories" DROP CONSTRAINT "ai_user_memories_user_id_fkey"`);
        await queryRunner.query(`DROP INDEX "app"."ai_user_memories_user_id_status_updated_at_idx"`);
        await queryRunner.query(`DROP TABLE "ai_user_memories"`);
        await queryRunner.query(`DROP TYPE "app"."ai_memory_status"`);
        await queryRunner.query(`DROP TYPE "app"."ai_memory_type"`);
        await queryRunner.query(`DROP INDEX "app"."ai_messages_summary_id_idx"`);
        await queryRunner.query(`ALTER TABLE "ai_messages" DROP CONSTRAINT "ai_messages_summary_id_fkey"`);
        await queryRunner.query(`ALTER TABLE "ai_messages" DROP COLUMN "summary_id"`);
        await queryRunner.query(`ALTER TABLE "ai_conversation_summaries" DROP CONSTRAINT "ai_conversation_summaries_request_id_fkey"`);
        await queryRunner.query(`ALTER TABLE "ai_conversation_summaries" DROP CONSTRAINT "ai_conversation_summaries_conversation_id_fkey"`);
        await queryRunner.query(`DROP TABLE "ai_conversation_summaries"`);
    }

}
