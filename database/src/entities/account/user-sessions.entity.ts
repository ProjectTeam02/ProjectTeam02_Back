// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.user_sessions)
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { LoginMethod, SessionRevokeReason } from '../common/enums';
import { User } from './users.entity';
import { UserDevice } from './user-devices.entity';

/** 로그인 세션(refresh 토큰). */
@Unique('user_sessions_refresh_token_hash_key', ['refreshTokenHash'])
@Entity({ name: 'user_sessions', schema: 'app' })
export class UserSession {
  /** 세션 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'session_id', primaryKeyConstraintName: 'user_sessions_pkey' })
  sessionId!: string;

  /** 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'user_sessions_user_id_fkey' })
  user?: User;

  /** 로그인 기기 */
  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId!: string | null;

  /** 관계: device_id → user_devices.device_id */
  @ManyToOne(() => UserDevice, { nullable: true })
  @JoinColumn({ name: 'device_id', foreignKeyConstraintName: 'user_sessions_device_id_fkey' })
  device?: UserDevice | null;

  /** Cookie refreshToken의 해시 (/auth/refresh에서 회전) */
  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 255 })
  refreshTokenHash!: string;

  /** 로그인 방식 (EMAIL / KAKAO …) */
  @Column({ name: 'login_method', type: 'enum', enum: LoginMethod, enumName: 'user_sessions_login_method' })
  loginMethod!: LoginMethod;

  /** 발급 시각 */
  @Column({ name: 'issued_at', type: 'timestamptz', default: () => 'now()' })
  issuedAt!: Date;

  /** 마지막 재발급 시각 */
  @Column({ name: 'last_refreshed_at', type: 'timestamptz', nullable: true })
  lastRefreshedAt!: Date | null;

  /** 만료 시각 */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  /** 폐기 시각 */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  /** 폐기 사유 */
  @Column({ name: 'revoke_reason', type: 'enum', enum: SessionRevokeReason, enumName: 'session_revoke_reason', nullable: true })
  revokeReason!: SessionRevokeReason | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
