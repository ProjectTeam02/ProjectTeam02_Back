// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.social_accounts)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { SocialProvider } from '../common/enums';
import { User } from './users.entity';

/** 소셜 로그인 연결. 탈퇴 시 행을 삭제해 같은 계정으로 재가입할 수 있게 합니다. */
@Index('social_accounts_provider_provider_user_id_idx', ['provider', 'providerUserId'], { unique: true })
@Entity({ name: 'social_accounts', schema: 'app' })
export class SocialAccount {
  /** 소셜 계정 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'social_account_id', primaryKeyConstraintName: 'social_accounts_pkey' })
  socialAccountId!: string;

  /** 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'social_accounts_user_id_fkey' })
  user?: User;

  /** 소셜 제공자 */
  @Column({ name: 'provider', type: 'enum', enum: SocialProvider, enumName: 'social_provider' })
  provider!: SocialProvider;

  /** 제공자 회원 번호 */
  @Column({ name: 'provider_user_id', type: 'varchar', length: 255 })
  providerUserId!: string;

  /** 제공자 이메일 */
  @Column({ name: 'provider_email', type: 'varchar', length: 255, nullable: true })
  providerEmail!: string | null;

  /** 제공자 닉네임 */
  @Column({ name: 'provider_nickname', type: 'varchar', length: 100, nullable: true })
  providerNickname!: string | null;

  /** 연결 시각 */
  @Column({ name: 'connected_at', type: 'timestamptz', default: () => 'now()' })
  connectedAt!: Date;

  /** 마지막 사용 시각 */
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  /** 연결 해제 시각 */
  @Column({ name: 'disconnected_at', type: 'timestamptz', nullable: true })
  disconnectedAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
