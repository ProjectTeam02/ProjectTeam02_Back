// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.account_tokens)
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { TokenType } from '../common/enums';
import { User } from './users.entity';

/** 이메일 인증·비밀번호 재설정 토큰. */
@Unique('account_tokens_token_hash_key', ['tokenHash'])
@Entity({ name: 'account_tokens', schema: 'app' })
export class AccountToken {
  /** 토큰 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'token_id', primaryKeyConstraintName: 'account_tokens_pkey' })
  tokenId!: string;

  /** 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'account_tokens_user_id_fkey' })
  user?: User;

  /** 토큰 종류 (EMAIL_VERIFICATION / PASSWORD_RESET) */
  @Column({ name: 'token_type', type: 'enum', enum: TokenType, enumName: 'token_type' })
  tokenType!: TokenType;

  /** 토큰 해시. 비밀번호 재설정은 API resetToken의 해시 */
  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash!: string;

  /** 발송 대상 이메일 */
  @Column({ name: 'target_email', type: 'varchar', length: 255 })
  targetEmail!: string;

  /** 발송 횟수 */
  @Column({ name: 'send_count', type: 'integer', default: 1 })
  sendCount!: number;

  /** 마지막 발송 시각 */
  @Column({ name: 'last_sent_at', type: 'timestamptz', default: () => 'now()' })
  lastSentAt!: Date;

  /** 만료 시각 */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  /** 사용 시각 */
  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
