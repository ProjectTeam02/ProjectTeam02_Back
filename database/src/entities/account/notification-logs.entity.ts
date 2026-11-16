// 알림 발송 기록 (account.notification_logs) — 같은 사용자·종류·날짜에는 한 번만 발송하도록 막는다
import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { NotificationStatus, NotificationType } from '../common/enums';
import { User } from './users.entity';

/** 알림 발송 기록. 발송 전 PENDING으로 INSERT(UNIQUE 충돌이면 이미 처리된 것) → 결과에 따라 SENT/FAILED */
@Unique('uq_notification_logs_user_type_date', ['userId', 'notificationType', 'targetDate'])
@Check('chk_notification_logs_counts', `(device_count >= 0) AND (success_count >= 0) AND (success_count <= device_count)`)
@Entity({ name: 'notification_logs', schema: 'account' })
export class NotificationLog {
  /** 발송 기록 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'notification_log_id', primaryKeyConstraintName: 'notification_logs_pkey' })
  notificationLogId!: string;

  /** 받는 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'notification_logs_user_id_fkey' })
  user?: User;

  /** 알림 종류 (LEARNING_REMINDER) */
  @Column({ name: 'notification_type', type: 'enum', enum: NotificationType, enumName: 'notification_type' })
  notificationType!: NotificationType;

  /** 발송 날짜 (사용자 시간대 기준, 'YYYY-MM-DD') */
  @Column({ name: 'target_date', type: 'date' })
  targetDate!: string;

  /** 발송 상태 (PENDING → SENT / FAILED) */
  @Column({ name: 'status', type: 'enum', enum: NotificationStatus, enumName: 'notification_status', default: NotificationStatus.Pending })
  status!: NotificationStatus;

  /** 보낸 기기 수 */
  @Column({ name: 'device_count', type: 'smallint', default: 0 })
  deviceCount!: number;

  /** 성공한 기기 수 */
  @Column({ name: 'success_count', type: 'smallint', default: 0 })
  successCount!: number;

  /** 실패 사유 (Expo 오류 코드 등) */
  @Column({ name: 'error_code', type: 'varchar', length: 50, nullable: true })
  errorCode!: string | null;

  /** 기록 시각 (PENDING 생성) */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 발송 완료 시각 */
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;
}
