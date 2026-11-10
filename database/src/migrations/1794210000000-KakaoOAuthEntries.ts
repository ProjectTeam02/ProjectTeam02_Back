import { MigrationInterface, QueryRunner } from 'typeorm';

export class KakaoOAuthEntries1794210000000 implements MigrationInterface {
  name = 'KakaoOAuthEntries1794210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "app"."kakao_oauth_entries" (
        "kind" varchar(8) NOT NULL,
        "token_hash" varchar(64) NOT NULL,
        "payload" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        CONSTRAINT "kakao_oauth_entries_pkey" PRIMARY KEY ("kind", "token_hash"),
        CONSTRAINT "chk_kakao_oauth_entries_kind" CHECK ("kind" IN ('state', 'exchange'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "kakao_oauth_entries_expires_at_idx" ON "app"."kakao_oauth_entries" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "app"."kakao_oauth_entries"');
  }
}
