// 자동 생성: leren_erd_v2.dbml 기준 (app.user_sessions)
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { LoginMethod, SessionRevokeReason } from '../common/enums';
import { User } from './users.entity';
import { UserDevice } from './user-devices.entity';

@Entity({ name: 'user_sessions', schema: 'app' })
export class UserSession {
  @PrimaryGeneratedColumn('uuid', { name: 'session_id' })
  sessionId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId!: string | null;

  @ManyToOne(() => UserDevice, { nullable: true })
  @JoinColumn({ name: 'device_id' })
  device?: UserDevice | null;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 255, unique: true })
  refreshTokenHash!: string;

  @Column({ name: 'login_method', type: 'enum', enum: LoginMethod, enumName: 'user_sessions_login_method' })
  loginMethod!: LoginMethod;

  @Column({ name: 'issued_at', type: 'timestamptz', default: () => 'now()' })
  issuedAt!: Date;

  @Column({ name: 'last_refreshed_at', type: 'timestamptz', nullable: true })
  lastRefreshedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'revoke_reason', type: 'enum', enum: SessionRevokeReason, enumName: 'session_revoke_reason', nullable: true })
  revokeReason!: SessionRevokeReason | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
