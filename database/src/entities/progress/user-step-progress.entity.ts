// 자동 생성: leren_erd_v2.dbml 기준 (app.user_step_progress)
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ProgressStatus } from '../common/enums';
import { Concept } from '../content/concepts.entity';
import { LearningAttempt } from '../quiz/learning-attempts.entity';
import { Step } from '../content/steps.entity';
import { User } from '../account/users.entity';

@Entity({ name: 'user_step_progress', schema: 'app' })
export class UserStepProgress {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @PrimaryColumn({ name: 'step_id', type: 'uuid' })
  stepId!: string;

  @ManyToOne(() => Step, { nullable: false })
  @JoinColumn({ name: 'step_id' })
  step?: Step;

  @Column({ name: 'progress_status', type: 'enum', enum: ProgressStatus, enumName: 'progress_status', default: ProgressStatus.NotStarted, comment: '잠금은 계산, passed는 되돌리지 않음. 응시 결과 저장과 같은 트랜잭션에서 갱신' })
  progressStatus!: ProgressStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'last_concept_id', type: 'uuid', nullable: true })
  lastConceptId!: string | null;

  @ManyToOne(() => Concept, { nullable: true })
  @JoinColumn({ name: 'last_concept_id' })
  lastConcept?: Concept | null;

  @Column({ name: 'last_page_no', type: 'smallint', nullable: true })
  lastPageNo!: number | null;

  @Column({ name: 'read_started_at', type: 'timestamptz', nullable: true })
  readStartedAt!: Date | null;

  @Column({ name: 'read_completed_at', type: 'timestamptz', nullable: true })
  readCompletedAt!: Date | null;

  @Column({ name: 'first_passed_at', type: 'timestamptz', nullable: true })
  firstPassedAt!: Date | null;

  @Column({ name: 'first_pass_attempt_id', type: 'uuid', nullable: true })
  firstPassAttemptId!: string | null;

  @ManyToOne(() => LearningAttempt, { nullable: true })
  @JoinColumn({ name: 'first_pass_attempt_id' })
  firstPassAttempt?: LearningAttempt | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
