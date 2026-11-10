import { MigrationInterface, QueryRunner } from 'typeorm';

// 콘텐츠(토픽·스테이지·개념)를 상태 지정 없이 넣으면 바로 공개(PUBLISHED)되도록 기본값 변경
// 기존 행의 상태는 바꾸지 않음. 숨길 콘텐츠는 넣을 때 status = 'DRAFT'를 직접 지정
// 문항(questions)은 검수 전 노출을 막기 위해 기본값(GENERATED)을 유지
export class ContentDefaultPublished1794301200000 implements MigrationInterface {
  name = 'ContentDefaultPublished1794301200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app"."topics" ALTER COLUMN "status" SET DEFAULT 'PUBLISHED'`);
    await queryRunner.query(`ALTER TABLE "app"."stages" ALTER COLUMN "status" SET DEFAULT 'PUBLISHED'`);
    await queryRunner.query(`ALTER TABLE "app"."concepts" ALTER COLUMN "status" SET DEFAULT 'PUBLISHED'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app"."concepts" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`);
    await queryRunner.query(`ALTER TABLE "app"."stages" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`);
    await queryRunner.query(`ALTER TABLE "app"."topics" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`);
  }
}
