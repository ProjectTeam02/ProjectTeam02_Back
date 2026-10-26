// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.learning_attempts)
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { AttemptEndReason, AttemptMode, AttemptStatus, AttemptType } from '../common/enums';
import { Stage } from '../content/stages.entity';
import { User } from '../account/users.entity';

/** 퀴즈 응시 (일반·BOSS·재학습 공통). */
@Unique('learning_attempts_idempotency_key_key', ['idempotencyKey'])
@Index('learning_attempts_user_id_stage_id_attempt_no_idx', ['userId', 'stageId', 'attemptNo'], { unique: true })
@Index('learning_attempts_user_id_started_at_idx', ['userId', 'startedAt'])
@Index('uq_learning_attempts_one_in_progress', ['userId', 'stageId'], { unique: true, where: `"status" = 'IN_PROGRESS'` })
@Check('chk_attempts_counts', `(correct_count <= submitted_count) AND (submitted_count <= max_question_count)`)
@Entity({ name: 'learning_attempts', schema: 'app' })
export class LearningAttempt {
  /** 응시 ID (재학습 세션 포함). API attemptId */
  @PrimaryGeneratedColumn('uuid', { name: 'attempt_id', primaryKeyConstraintName: 'learning_attempts_pkey' })
  attemptId!: string;

  /** 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'learning_attempts_user_id_fkey' })
  user?: User;

  /** Stage (일반·Boss 공통) */
  @Column({ name: 'stage_id', type: 'uuid' })
  stageId!: string;

  /** 관계: stage_id → stages.stage_id */
  @ManyToOne(() => Stage, { nullable: false })
  @JoinColumn({ name: 'stage_id', foreignKeyConstraintName: 'learning_attempts_stage_id_fkey' })
  stage?: Stage;

  /** 사용자·Stage별 응시 회차 */
  @Column({ name: 'attempt_no', type: 'integer' })
  attemptNo!: number;

  /** 응시 종류 (PLAY 응시 / RELEARN 완료 Stage 재학습, 보상 없음) */
  @Column({ name: 'attempt_type', type: 'enum', enum: AttemptType, enumName: 'attempt_type', default: AttemptType.Play })
  attemptType!: AttemptType;

  /** 시작 방식 (START 처음 / RETRY 재도전). API mode */
  @Column({ name: 'mode', type: 'enum', enum: AttemptMode, enumName: 'attempt_mode', default: AttemptMode.Start })
  mode!: AttemptMode;

  /** 응시 상태 (IN_PROGRESS / PASSED / FAILED / ABANDONED) */
  @Column({ name: 'status', type: 'enum', enum: AttemptStatus, enumName: 'attempt_status', default: AttemptStatus.InProgress })
  status!: AttemptStatus;

  /** 종료 사유 (MONSTER_DEFEATED / QUESTIONS_EXHAUSTED / ABANDONED) */
  @Column({ name: 'end_reason', type: 'enum', enum: AttemptEndReason, enumName: 'attempt_end_reason', nullable: true })
  endReason!: AttemptEndReason | null;

  /** 최대 문항 수 (응시 시점 스냅샷) */
  @Column({ name: 'max_question_count', type: 'smallint' })
  maxQuestionCount!: number;

  /** 통과 필요 정답 수 (응시 시점 스냅샷) */
  @Column({ name: 'required_correct_count', type: 'smallint' })
  requiredCorrectCount!: number;

  /** 초기 HP (응시 시점 스냅샷) */
  @Column({ name: 'initial_hp', type: 'smallint' })
  initialHp!: number;

  /** 종료 시 남은 HP */
  @Column({ name: 'final_hp', type: 'smallint', nullable: true })
  finalHp!: number | null;

  /** 제출 문항 수 */
  @Column({ name: 'submitted_count', type: 'smallint', default: 0 })
  submittedCount!: number;

  /** 정답 수 */
  @Column({ name: 'correct_count', type: 'smallint', default: 0 })
  correctCount!: number;

  /** 최초 통과 여부 */
  @Column({ name: 'is_first_pass', type: 'boolean', default: false })
  isFirstPass!: boolean;

  /** 보상 지급 여부 */
  @Column({ name: 'reward_granted', type: 'boolean', default: false })
  rewardGranted!: boolean;

  /** 시작 시각 */
  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  /** 종료 시각 */
  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  /** 결과 저장 시각 */
  @Column({ name: 'result_saved_at', type: 'timestamptz', nullable: true })
  resultSavedAt!: Date | null;

  /** 서버 내부용 중복 방지 키 (API 필드 없음) */
  @Column({ name: 'idempotency_key', type: 'varchar', length: 100, nullable: true })
  idempotencyKey!: string | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
