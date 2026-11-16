import { MigrationInterface, QueryRunner } from "typeorm";

// E-1 푸시 알림 기반: 알림 발송 기록 account.notification_logs 추가
// - (user_id, notification_type, target_date) UNIQUE: 같은 사용자·종류·날짜(사용자 시간대 기준)에는 한 번만 발송
//   발송 모듈은 PENDING으로 먼저 INSERT하고, 충돌하면 이미 처리된 것으로 보고 보내지 않는다 (서버 재시작·중복 실행 대비)
// - Enum notification_type(LEARNING_REMINDER), notification_status(PENDING/SENT/FAILED)는 테이블과 같은 account 스키마
// - 새 테이블만 추가하므로 기존 데이터 영향 없음. app_user 권한은 01_app_schema.sql의 기본 권한(DEFAULT PRIVILEGES)으로 부여됨

export class NotificationLogs1794740815295 implements MigrationInterface {
    name = 'NotificationLogs1794740815295'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "account"."notification_type" AS ENUM('LEARNING_REMINDER')`);
        await queryRunner.query(`CREATE TYPE "account"."notification_status" AS ENUM('PENDING', 'SENT', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "account"."notification_logs" ("notification_log_id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "notification_type" "account"."notification_type" NOT NULL, "target_date" date NOT NULL, "status" "account"."notification_status" NOT NULL DEFAULT 'PENDING', "device_count" smallint NOT NULL DEFAULT '0', "success_count" smallint NOT NULL DEFAULT '0', "error_code" character varying(50), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "sent_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_notification_logs_user_type_date" UNIQUE ("user_id", "notification_type", "target_date"), CONSTRAINT "chk_notification_logs_counts" CHECK ((device_count >= 0) AND (success_count >= 0) AND (success_count <= device_count)), CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("notification_log_id"))`);
        await queryRunner.query(`ALTER TABLE "account"."notification_logs" ADD CONSTRAINT "notification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account"."users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "account"."notification_logs" DROP CONSTRAINT "notification_logs_user_id_fkey"`);
        await queryRunner.query(`DROP TABLE "account"."notification_logs"`);
        await queryRunner.query(`DROP TYPE "account"."notification_status"`);
        await queryRunner.query(`DROP TYPE "account"."notification_type"`);
    }

}
