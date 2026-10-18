// 자동 생성: leren_erd_v2.dbml 기준 (app.user_devices)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DevicePlatform } from '../common/enums';
import { User } from './users.entity';

@Index(['userId', 'deviceUuid'], { unique: true })
@Entity({ name: 'user_devices', schema: 'app' })
export class UserDevice {
  @PrimaryGeneratedColumn('uuid', { name: 'device_id' })
  deviceId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'device_uuid', type: 'varchar', length: 100, comment: '앱 설치 단위 식별자' })
  deviceUuid!: string;

  @Column({ name: 'platform', type: 'enum', enum: DevicePlatform, enumName: 'device_platform' })
  platform!: DevicePlatform;

  @Column({ name: 'os_version', type: 'varchar', length: 30, nullable: true })
  osVersion!: string | null;

  @Column({ name: 'app_version', type: 'varchar', length: 30, nullable: true })
  appVersion!: string | null;

  @Column({ name: 'device_model', type: 'varchar', length: 100, nullable: true })
  deviceModel!: string | null;

  @Column({ name: 'push_token', type: 'varchar', length: 512, unique: true, nullable: true })
  pushToken!: string | null;

  @Column({ name: 'push_token_updated_at', type: 'timestamptz', nullable: true })
  pushTokenUpdatedAt!: Date | null;

  @Column({ name: 'notification_permission', type: 'boolean', default: false })
  notificationPermission!: boolean;

  @Column({ name: 'permission_checked_at', type: 'timestamptz', nullable: true })
  permissionCheckedAt!: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
