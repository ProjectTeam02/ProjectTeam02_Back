// 자동 생성: leren_erd_v2.dbml 기준 (app.exp_ledger)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ExpSourceType } from '../common/enums';
import { LearningAttempt } from '../quiz/learning-attempts.entity';
import { Step } from '../content/steps.entity';
import { User } from '../account/users.entity';

@Index(['userId', 'sourceType', 'sourceStepId'], { unique: true })
@Entity({ name: 'exp_ledger', schema: 'app' })
export class ExpLedger {
  @PrimaryGeneratedColumn('uuid', { name: 'exp_ledger_id' })
  expLedgerId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'source_type', type: 'enum', enum: ExpSourceType, enumName: 'exp_source_type' })
  sourceType!: ExpSourceType;

  @Column({ name: 'source_step_id', type: 'uuid' })
  sourceStepId!: string;

  @ManyToOne(() => Step, { nullable: false })
  @JoinColumn({ name: 'source_step_id' })
  sourceStep?: Step;

  @Column({ name: 'attempt_id', type: 'uuid', nullable: true })
  attemptId!: string | null;

  @ManyToOne(() => LearningAttempt, { nullable: true })
  @JoinColumn({ name: 'attempt_id' })
  attempt?: LearningAttempt | null;

  @Column({ name: 'total_exp_amount', type: 'integer' })
  totalExpAmount!: number;

  @Column({ name: 'economy_exp_amount', type: 'integer' })
  economyExpAmount!: number;

  @Column({ name: 'total_exp_after', type: 'integer' })
  totalExpAfter!: number;

  @Column({ name: 'economy_exp_after', type: 'integer' })
  economyExpAfter!: number;

  @Column({ name: 'total_level_after', type: 'integer' })
  totalLevelAfter!: number;

  @Column({ name: 'economy_level_after', type: 'integer' })
  economyLevelAfter!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
