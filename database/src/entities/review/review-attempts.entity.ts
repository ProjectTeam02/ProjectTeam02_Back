// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.review_attempts)
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ReviewAttemptStatus, ReviewAttemptType, ReviewEntryPoint } from '../common/enums';
import { ReviewMission } from './review-missions.entity';
import { User } from '../account/users.entity';

/** 복습 응시 (전투·HP 없음). */
@Index('review_attempts_user_id_started_at_idx', ['userId', 'startedAt'])
@Check('chk_review_attempts_counts', `(correct_count <= submitted_count) AND (submitted_count <= question_count)`)
@Entity({ name: 'review_attempts', schema: 'app' })
export class ReviewAttempt {
  /** 복습 응시 ID. API reviewAttemptId */
  @PrimaryGeneratedColumn('uuid', { name: 'review_attempt_id', primaryKeyConstraintName: 'review_attempts_pkey' })
  reviewAttemptId!: string;

  /** 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'review_attempts_user_id_fkey' })
  user?: User;

  /** 연결된 임무 (review_type = AUTO일 때만) */
  @Column({ name: 'mission_id', type: 'uuid', nullable: true })
  missionId!: string | null;

  /** 관계: mission_id → review_missions.mission_id */
  @ManyToOne(() => ReviewMission, { nullable: true })
  @JoinColumn({ name: 'mission_id', foreignKeyConstraintName: 'review_attempts_mission_id_fkey' })
  mission?: ReviewMission | null;

  /** 복습 종류 (AUTO / RECOMMENDED / SINGLE) */
  @Column({ name: 'review_type', type: 'enum', enum: ReviewAttemptType, enumName: 'review_attempt_type' })
  reviewType!: ReviewAttemptType;

  /** 진입 화면 */
  @Column({ name: 'entry_point', type: 'enum', enum: ReviewEntryPoint, enumName: 'review_entry_point' })
  entryPoint!: ReviewEntryPoint;

  /** 대상 개념 코드 (논리 참조) */
  @Column({ name: 'concept_code', type: 'varchar', length: 30, nullable: true })
  conceptCode!: string | null;

  /** 복습 상태 (IN_PROGRESS / COMPLETED / ABANDONED) */
  @Column({ name: 'status', type: 'enum', enum: ReviewAttemptStatus, enumName: 'review_attempt_status', default: ReviewAttemptStatus.InProgress })
  status!: ReviewAttemptStatus;

  /** 문항 수 (시작 시점 고정) */
  @Column({ name: 'question_count', type: 'smallint' })
  questionCount!: number;

  /** 제출 문항 수 */
  @Column({ name: 'submitted_count', type: 'smallint', default: 0 })
  submittedCount!: number;

  /** 정답 수 */
  @Column({ name: 'correct_count', type: 'smallint', default: 0 })
  correctCount!: number;

  /** 시작 시각 */
  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  /** 완료 시각 */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
