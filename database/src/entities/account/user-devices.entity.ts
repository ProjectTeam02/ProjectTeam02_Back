// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.user_devices)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { DevicePlatform } from '../common/enums';
import { User } from './users.entity';

/** 기기와 푸시 토큰. */
@Unique('user_devices_push_token_key', ['pushToken'])
@Index('user_devices_user_id_device_uuid_idx', ['userId', 'deviceUuid'], { unique: true })
@Entity({ name: 'user_devices', schema: 'app' })
export class UserDevice {
  /** 기기 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'device_id', primaryKeyConstraintName: 'user_devices_pkey' })
  deviceId!: string;

  /** 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'user_devices_user_id_fkey' })
  user?: User;

  /** 앱 설치 단위 식별자 */
  @Column({ name: 'device_uuid', type: 'varchar', length: 100 })
  deviceUuid!: string;

  /** OS 종류 (IOS / ANDROID) */
  @Column({ name: 'platform', type: 'enum', enum: DevicePlatform, enumName: 'device_platform' })
  platform!: DevicePlatform;

  /** OS 버전 */
  @Column({ name: 'os_version', type: 'varchar', length: 30, nullable: true })
  osVersion!: string | null;

  /** 앱 버전 */
  @Column({ name: 'app_version', type: 'varchar', length: 30, nullable: true })
  appVersion!: string | null;

  /** 기기 모델 */
  @Column({ name: 'device_model', type: 'varchar', length: 100, nullable: true })
  deviceModel!: string | null;

  /** 푸시 토큰 */
  @Column({ name: 'push_token', type: 'varchar', length: 512, nullable: true })
  pushToken!: string | null;

  /** 푸시 토큰 갱신 시각 */
  @Column({ name: 'push_token_updated_at', type: 'timestamptz', nullable: true })
  pushTokenUpdatedAt!: Date | null;

  /** 알림 권한 허용 */
  @Column({ name: 'notification_permission', type: 'boolean', default: false })
  notificationPermission!: boolean;

  /** 권한 확인 시각 */
  @Column({ name: 'permission_checked_at', type: 'timestamptz', nullable: true })
  permissionCheckedAt!: Date | null;

  /** 사용 여부 */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** 마지막 접속 시각 */
  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
