// 자동 생성: leren_erd_v2.dbml 기준 (app.learning_attempts)
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AttemptEndReason, AttemptStatus, AttemptType } from '../common/enums';
import { Step } from '../content/steps.entity';
import { User } from '../account/users.entity';

@Index(['userId', 'stepId', 'attemptNo'], { unique: true })
@Index(['userId', 'startedAt'])
@Check('chk_attempts_counts', `"correct_count" <= "submitted_count" AND "submitted_count" <= "max_question_count"`)
@Entity({ name: 'learning_attempts', schema: 'app' })
export class LearningAttempt {
  @PrimaryGeneratedColumn('uuid', { name: 'attempt_id' })
  attemptId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'step_id', type: 'uuid' })
  stepId!: string;

  @ManyToOne(() => Step, { nullable: false })
  @JoinColumn({ name: 'step_id' })
  step?: Step;

  @Column({ name: 'attempt_no', type: 'integer' })
  attemptNo!: number;

  @Column({ name: 'attempt_type', type: 'enum', enum: AttemptType, enumName: 'attempt_type', default: AttemptType.Play })
  attemptType!: AttemptType;

  @Column({ name: 'is_retry', type: 'boolean', default: false, comment: '실패 후 새 전투로 다시 도전' })
  isRetry!: boolean;

  @Column({ name: 'status', type: 'enum', enum: AttemptStatus, enumName: 'attempt_status', default: AttemptStatus.InProgress })
  status!: AttemptStatus;

  @Column({ name: 'end_reason', type: 'enum', enum: AttemptEndReason, enumName: 'attempt_end_reason', nullable: true })
  endReason!: AttemptEndReason | null;

  @Column({ name: 'max_question_count', type: 'smallint', comment: '응시 시점 스냅샷' })
  maxQuestionCount!: number;

  @Column({ name: 'required_correct_count', type: 'smallint', comment: '응시 시점 스냅샷' })
  requiredCorrectCount!: number;

  @Column({ name: 'initial_hp', type: 'smallint', comment: '응시 시점 스냅샷' })
  initialHp!: number;

  @Column({ name: 'final_hp', type: 'smallint', nullable: true })
  finalHp!: number | null;

  @Column({ name: 'submitted_count', type: 'smallint', default: 0 })
  submittedCount!: number;

  @Column({ name: 'correct_count', type: 'smallint', default: 0 })
  correctCount!: number;

  @Column({ name: 'is_first_pass', type: 'boolean', default: false })
  isFirstPass!: boolean;

  @Column({ name: 'reward_granted', type: 'boolean', default: false })
  rewardGranted!: boolean;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ name: 'result_saved_at', type: 'timestamptz', nullable: true })
  resultSavedAt!: Date | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100, unique: true, nullable: true })
  idempotencyKey!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
