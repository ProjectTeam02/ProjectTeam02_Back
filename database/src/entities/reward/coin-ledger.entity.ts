// 자동 생성: leren_erd_v2.dbml 기준 (app.coin_ledger)
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CoinReason, CoinRefType, CoinTransactionType } from '../common/enums';
import { LearningAttempt } from '../quiz/learning-attempts.entity';
import { User } from '../account/users.entity';

@Index(['userId', 'reason', 'refId'], { unique: true })
@Check('chk_coin_ledger_balance', `"balance_after" >= 0 AND "balance_after" = "balance_before" + "amount"`)
@Entity({ name: 'coin_ledger', schema: 'app' })
export class CoinLedger {
  @PrimaryGeneratedColumn('uuid', { name: 'coin_ledger_id' })
  coinLedgerId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'transaction_type', type: 'enum', enum: CoinTransactionType, enumName: 'coin_transaction_type' })
  transactionType!: CoinTransactionType;

  @Column({ name: 'reason', type: 'enum', enum: CoinReason, enumName: 'coin_reason' })
  reason!: CoinReason;

  @Column({ name: 'amount', type: 'integer', comment: '+ 지급 / - 차감' })
  amount!: number;

  @Column({ name: 'balance_before', type: 'integer' })
  balanceBefore!: number;

  @Column({ name: 'balance_after', type: 'integer' })
  balanceAfter!: number;

  @Column({ name: 'ref_type', type: 'enum', enum: CoinRefType, enumName: 'coin_ref_type' })
  refType!: CoinRefType;

  @Column({ name: 'ref_id', type: 'uuid', comment: '논리 참조: step → steps.step_id / costume → costumes.costume_id' })
  refId!: string;

  @Column({ name: 'attempt_id', type: 'uuid', nullable: true })
  attemptId!: string | null;

  @ManyToOne(() => LearningAttempt, { nullable: true })
  @JoinColumn({ name: 'attempt_id' })
  attempt?: LearningAttempt | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100, unique: true, nullable: true })
  idempotencyKey!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
