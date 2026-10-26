// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.users)
import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { AccountStatus, LoginMethod, UserPlan, UserRole } from '../common/enums';

/** 회원. 탈퇴해도 행은 남고 개인정보만 지웁니다. */
@Unique('users_email_key', ['email'])
@Check('chk_users_withdrawn', `(account_status = 'WITHDRAWN'::account_status) = (withdrawn_at IS NOT NULL)`)
@Entity({ name: 'users', schema: 'app' })
export class User {
  /** 사용자 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'user_id', primaryKeyConstraintName: 'users_pkey' })
  userId!: string;

  /** 이메일 (소셜 전용 계정·탈퇴 후 null) */
  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  /** 이메일 인증 시각 */
  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  /** 비밀번호 해시 (소셜 전용 계정·탈퇴 후 null, 응답 노출 금지) */
  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  /** 비밀번호 변경 시각 */
  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  passwordChangedAt!: Date | null;

  /** 닉네임 (탈퇴 시 익명값) */
  @Column({ name: 'nickname', type: 'varchar', length: 30 })
  nickname!: string;

  /** 닉네임 변경 시각 */
  @Column({ name: 'nickname_updated_at', type: 'timestamptz', nullable: true })
  nicknameUpdatedAt!: Date | null;

  /** 권한 (USER / ADMIN) */
  @Column({ name: 'role', type: 'enum', enum: UserRole, enumName: 'user_role', default: UserRole.User })
  role!: UserRole;

  /** 요금제 (FREE / PREMIUM). AI Tutor 일일 한도 기준 */
  @Column({ name: 'plan', type: 'enum', enum: UserPlan, enumName: 'user_plan', default: UserPlan.Free })
  plan!: UserPlan;

  /** 계정 상태 (ACTIVE / SUSPENDED / LOCKED / WITHDRAWN) */
  @Column({ name: 'account_status', type: 'enum', enum: AccountStatus, enumName: 'account_status', default: AccountStatus.Active })
  accountStatus!: AccountStatus;

  /** 상태 사유 */
  @Column({ name: 'status_reason', type: 'varchar', length: 255, nullable: true })
  statusReason!: string | null;

  /** 로그인 실패 횟수 */
  @Column({ name: 'failed_login_count', type: 'integer', default: 0 })
  failedLoginCount!: number;

  /** 잠금 해제 시각 */
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  /** 온보딩(최초 직업 선택) 완료 시각. 값이 있으면 API onboardingCompleted = true */
  @Column({ name: 'onboarding_completed_at', type: 'timestamptz', nullable: true })
  onboardingCompletedAt!: Date | null;

  /** 마지막 로그인 시각 */
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  /** 마지막 로그인 방식 */
  @Column({ name: 'last_login_method', type: 'enum', enum: LoginMethod, enumName: 'users_last_login_method', nullable: true })
  lastLoginMethod!: LoginMethod | null;

  /** 탈퇴 시각. 탈퇴 시 이메일·비밀번호는 비우고 닉네임은 익명값으로 변경 */
  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt!: Date | null;

  /** 탈퇴 사유 (선택 입력) */
  @Column({ name: 'withdrawal_reason', type: 'varchar', length: 255, nullable: true })
  withdrawalReason!: string | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
