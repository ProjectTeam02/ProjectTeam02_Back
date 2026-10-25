// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.user_stage_progress)
import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ProgressStatus } from '../common/enums';
import { LearningAttempt } from './learning-attempts.entity';
import { Stage } from '../content/stages.entity';
import { User } from '../account/users.entity';

/** 사용자별 Stage 진행도와 학습 위치. */
@Check('chk_progress_content_position', `(content_position IS NULL) OR (content_position >= 1)`)
@Entity({ name: 'user_stage_progress', schema: 'app' })
export class UserStageProgress {
  /** 사용자 */
  @PrimaryColumn({ name: 'user_id', type: 'uuid', primaryKeyConstraintName: 'user_stage_progress_pkey' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'user_stage_progress_user_id_fkey' })
  user?: User;

  /** Stage */
  @PrimaryColumn({ name: 'stage_id', type: 'uuid', primaryKeyConstraintName: 'user_stage_progress_pkey' })
  stageId!: string;

  /** 관계: stage_id → stages.stage_id */
  @ManyToOne(() => Stage, { nullable: false })
  @JoinColumn({ name: 'stage_id', foreignKeyConstraintName: 'user_stage_progress_stage_id_fkey' })
  stage?: Stage;

  /** 진행 상태 (NOT_STARTED / IN_PROGRESS / PASSED). PASSED는 되돌리지 않음 */
  @Column({ name: 'progress_status', type: 'enum', enum: ProgressStatus, enumName: 'progress_status', default: ProgressStatus.NotStarted })
  progressStatus!: ProgressStatus;

  /** 학습 시작 시각 */
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  /** 학습 위치 (Stage 콘텐츠 페이지 번호, 1부터). API contentPosition */
  @Column({ name: 'content_position', type: 'smallint', nullable: true })
  contentPosition!: number | null;

  /** 학습 위치 저장 시각 (위치 저장 API 응답의 수정 시간) */
  @Column({ name: 'content_position_updated_at', type: 'timestamptz', nullable: true })
  contentPositionUpdatedAt!: Date | null;

  /** 콘텐츠 읽기 시작 시각 */
  @Column({ name: 'read_started_at', type: 'timestamptz', nullable: true })
  readStartedAt!: Date | null;

  /** 콘텐츠 읽기 완료 시각 */
  @Column({ name: 'read_completed_at', type: 'timestamptz', nullable: true })
  readCompletedAt!: Date | null;

  /** 최초 통과 시각 */
  @Column({ name: 'first_passed_at', type: 'timestamptz', nullable: true })
  firstPassedAt!: Date | null;

  /** 최초 통과 응시 */
  @Column({ name: 'first_pass_attempt_id', type: 'uuid', nullable: true })
  firstPassAttemptId!: string | null;

  /** 관계: first_pass_attempt_id → learning_attempts.attempt_id */
  @ManyToOne(() => LearningAttempt, { nullable: true })
  @JoinColumn({ name: 'first_pass_attempt_id', foreignKeyConstraintName: 'user_stage_progress_first_pass_attempt_id_fkey' })
  firstPassAttempt?: LearningAttempt | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
