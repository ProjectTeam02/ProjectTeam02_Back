// 자동 생성: leren_erd_v2.dbml 기준 (app.users)
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AccountStatus, LoginMethod, UserPlan, UserRole } from '../common/enums';

@Entity({ name: 'users', schema: 'app' })
export class User {
  @PrimaryGeneratedColumn('uuid', { name: 'user_id' })
  userId!: string;

  @Column({ name: 'email', type: 'varchar', length: 255, unique: true, nullable: true, comment: 'null 허용(소셜 전용 계정)' })
  email!: string | null;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true, comment: 'null 허용(소셜 전용 계정)' })
  passwordHash!: string | null;

  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  passwordChangedAt!: Date | null;

  @Column({ name: 'nickname', type: 'varchar', length: 30 })
  nickname!: string;

  @Column({ name: 'nickname_updated_at', type: 'timestamptz', nullable: true })
  nicknameUpdatedAt!: Date | null;

  @Column({ name: 'role', type: 'enum', enum: UserRole, enumName: 'user_role', default: UserRole.User })
  role!: UserRole;

  @Column({ name: 'plan', type: 'enum', enum: UserPlan, enumName: 'user_plan', default: UserPlan.Free })
  plan!: UserPlan;

  @Column({ name: 'account_status', type: 'enum', enum: AccountStatus, enumName: 'account_status', default: AccountStatus.Active })
  accountStatus!: AccountStatus;

  @Column({ name: 'status_reason', type: 'varchar', length: 255, nullable: true })
  statusReason!: string | null;

  @Column({ name: 'failed_login_count', type: 'integer', default: 0 })
  failedLoginCount!: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @Column({ name: 'initial_setup_completed_at', type: 'timestamptz', nullable: true, comment: 'null = 첫 직업 선택 필요' })
  initialSetupCompletedAt!: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'last_login_method', type: 'enum', enum: LoginMethod, enumName: 'users_last_login_method', nullable: true })
  lastLoginMethod!: LoginMethod | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
