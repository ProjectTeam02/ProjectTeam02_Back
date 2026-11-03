// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.coin_ledger)
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { CoinReason, CoinRefType, CoinTransactionType } from '../common/enums';
import { LearningAttempt } from '../progress/learning-attempts.entity';
import { User } from '../account/users.entity';

/** 코인 지급·차감 원장. */
@Unique('coin_ledger_request_id_key', ['requestId'])
@Index('coin_ledger_user_id_reason_ref_id_idx', ['userId', 'reason', 'refId'], { unique: true })
@Check('chk_coin_ledger_balance', `(balance_after >= 0) AND (balance_after = (balance_before + amount))`)
@Entity({ name: 'coin_ledger', schema: 'app' })
export class CoinLedger {
  /** 코인 원장 ID (구매 시 = API 구매 ID) */
  @PrimaryGeneratedColumn('uuid', { name: 'coin_ledger_id', primaryKeyConstraintName: 'coin_ledger_pkey' })
  coinLedgerId!: string;

  /** 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'coin_ledger_user_id_fkey' })
  user?: User;

  /** 지급/차감 (EARN / SPEND) */
  @Column({ name: 'transaction_type', type: 'enum', enum: CoinTransactionType, enumName: 'coin_transaction_type' })
  transactionType!: CoinTransactionType;

  /** 사유 (STAGE_FIRST_CLEAR / COSTUME_PURCHASE) */
  @Column({ name: 'reason', type: 'enum', enum: CoinReason, enumName: 'coin_reason' })
  reason!: CoinReason;

  /** 금액 (+ 지급 / - 차감) */
  @Column({ name: 'amount', type: 'integer' })
  amount!: number;

  /** 거래 전 잔액 */
  @Column({ name: 'balance_before', type: 'integer' })
  balanceBefore!: number;

  /** 거래 후 잔액 */
  @Column({ name: 'balance_after', type: 'integer' })
  balanceAfter!: number;

  /** 참조 대상 종류 (STAGE / COSTUME) */
  @Column({ name: 'ref_type', type: 'enum', enum: CoinRefType, enumName: 'coin_ref_type' })
  refType!: CoinRefType;

  /** 참조 대상 ID (논리 참조: STAGE → stages.stage_id, COSTUME → costumes.item_id) */
  @Column({ name: 'ref_id', type: 'uuid' })
  refId!: string;

  /** 보상 근거 응시 */
  @Column({ name: 'attempt_id', type: 'uuid', nullable: true })
  attemptId!: string | null;

  /** 관계: attempt_id → learning_attempts.attempt_id */
  @ManyToOne(() => LearningAttempt, { nullable: true })
  @JoinColumn({ name: 'attempt_id', foreignKeyConstraintName: 'coin_ledger_attempt_id_fkey' })
  attempt?: LearningAttempt | null;

  /** 구매 요청 ID. API requestId (중복 구매 방지, ai_requests와 무관) */
  @Column({ name: 'request_id', type: 'varchar', length: 100, nullable: true })
  requestId!: string | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
