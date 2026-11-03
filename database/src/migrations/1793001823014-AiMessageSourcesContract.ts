import { MigrationInterface, QueryRunner } from "typeorm";

// rev.6: AI 내부 API 계약(ProjectTeam02_AI docs/TUTOR_INTERNAL_API_CONTRACT.md) 반영
// - document_version: integer NOT NULL → varchar(50) NULL (응답 documentVersion은 문자열, null 가능)
// - chunk_id: NULL 허용 → NOT NULL (응답 chunkId는 항상 존재)
// - (message_id, document_id, chunk_id) 유니크: 같은 답변에 같은 근거 중복 저장 방지
// 주의: TypeORM 자동 생성본은 document_version을 DROP 후 ADD(데이터 삭제)로 만들어서, 값을 보존하는 ALTER로 직접 수정했다.
export class AiMessageSourcesContract1793001823014 implements MigrationInterface {
    name = 'AiMessageSourcesContract1793001823014'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 기존 행이 새 규칙을 어기면 원인을 알 수 있게 멈춘다 (임의로 값을 채우거나 지우지 않음)
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM "ai_message_sources" WHERE "chunk_id" IS NULL) THEN
                    RAISE EXCEPTION 'ai_message_sources에 chunk_id가 NULL인 행이 있습니다. 값을 채운 뒤 다시 실행하세요.';
                END IF;
                IF EXISTS (
                    SELECT 1 FROM "ai_message_sources"
                    GROUP BY "message_id", "document_id", "chunk_id" HAVING count(*) > 1
                ) THEN
                    RAISE EXCEPTION 'ai_message_sources에 (message_id, document_id, chunk_id) 중복 행이 있습니다. 정리한 뒤 다시 실행하세요.';
                END IF;
            END $$`);
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "document_version" TYPE character varying(50) USING "document_version"::text`);
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "document_version" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "chunk_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ADD CONSTRAINT "uq_ai_message_sources_message_document_chunk" UNIQUE ("message_id", "document_id", "chunk_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_message_sources" DROP CONSTRAINT "uq_ai_message_sources_message_document_chunk"`);
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "chunk_id" DROP NOT NULL`);
        // 되돌릴 때 숫자가 아닌 버전·null은 0으로 바꾼다 (integer NOT NULL로 복귀)
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "document_version" TYPE integer USING (CASE WHEN "document_version" ~ '^[0-9]+$' THEN "document_version"::integer ELSE 0 END)`);
        await queryRunner.query(`UPDATE "ai_message_sources" SET "document_version" = 0 WHERE "document_version" IS NULL`);
        await queryRunner.query(`ALTER TABLE "ai_message_sources" ALTER COLUMN "document_version" SET NOT NULL`);
    }

}
