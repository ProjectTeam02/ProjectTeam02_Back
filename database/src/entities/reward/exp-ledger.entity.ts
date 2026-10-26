// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.exp_ledger)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ExpSourceType } from '../common/enums';
import { LearningAttempt } from '../progress/learning-attempts.entity';
import { Stage } from '../content/stages.entity';
import { User } from '../account/users.entity';

/** EXP 지급 원장. */
@Index('exp_ledger_user_id_source_type_source_stage_id_idx', ['userId', 'sourceType', 'sourceStageId'], { unique: true })
@Entity({ name: 'exp_ledger', schema: 'app' })
export class ExpLedger {
  /** EXP 원장 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'exp_ledger_id', primaryKeyConstraintName: 'exp_ledger_pkey' })
  expLedgerId!: string;

  /** 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'exp_ledger_user_id_fkey' })
  user?: User;

  /** 지급 사유 (STAGE_FIRST_CLEAR) */
  @Column({ name: 'source_type', type: 'enum', enum: ExpSourceType, enumName: 'exp_source_type' })
  sourceType!: ExpSourceType;

  /** 보상 대상 Stage */
  @Column({ name: 'source_stage_id', type: 'uuid' })
  sourceStageId!: string;

  /** 관계: source_stage_id → stages.stage_id */
  @ManyToOne(() => Stage, { nullable: false })
  @JoinColumn({ name: 'source_stage_id', foreignKeyConstraintName: 'exp_ledger_source_stage_id_fkey' })
  sourceStage?: Stage;

  /** 보상 근거 응시 */
  @Column({ name: 'attempt_id', type: 'uuid', nullable: true })
  attemptId!: string | null;

  /** 관계: attempt_id → learning_attempts.attempt_id */
  @ManyToOne(() => LearningAttempt, { nullable: true })
  @JoinColumn({ name: 'attempt_id', foreignKeyConstraintName: 'exp_ledger_attempt_id_fkey' })
  attempt?: LearningAttempt | null;

  /** 지급 전체 EXP */
  @Column({ name: 'total_exp_amount', type: 'integer' })
  totalExpAmount!: number;

  /** 지급 경제 EXP */
  @Column({ name: 'economy_exp_amount', type: 'integer' })
  economyExpAmount!: number;

  /** 지급 후 전체 EXP */
  @Column({ name: 'total_exp_after', type: 'integer' })
  totalExpAfter!: number;

  /** 지급 후 경제 EXP */
  @Column({ name: 'economy_exp_after', type: 'integer' })
  economyExpAfter!: number;

  /** 지급 후 전체 레벨 */
  @Column({ name: 'total_level_after', type: 'integer' })
  totalLevelAfter!: number;

  /** 지급 후 경제 레벨 */
  @Column({ name: 'economy_level_after', type: 'integer' })
  economyLevelAfter!: number;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
