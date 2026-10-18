// 자동 생성: leren_erd_v2.dbml 기준 (app.review_sessions)
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ReviewEntryPoint, ReviewSessionStatus, ReviewSessionType } from '../common/enums';
import { ConceptAutoReview } from './concept-auto-reviews.entity';
import { User } from '../account/users.entity';

@Index(['userId', 'startedAt'])
@Check('chk_review_sessions_counts', `"correct_count" <= "submitted_count" AND "submitted_count" <= "question_count"`)
@Entity({ name: 'review_sessions', schema: 'app' })
export class ReviewSession {
  @PrimaryGeneratedColumn('uuid', { name: 'review_session_id' })
  reviewSessionId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'auto_review_id', type: 'uuid', nullable: true, comment: 'session_type = auto 일 때만' })
  autoReviewId!: string | null;

  @ManyToOne(() => ConceptAutoReview, { nullable: true })
  @JoinColumn({ name: 'auto_review_id' })
  autoReview?: ConceptAutoReview | null;

  @Column({ name: 'session_type', type: 'enum', enum: ReviewSessionType, enumName: 'review_session_type' })
  sessionType!: ReviewSessionType;

  @Column({ name: 'entry_point', type: 'enum', enum: ReviewEntryPoint, enumName: 'review_entry_point' })
  entryPoint!: ReviewEntryPoint;

  @Column({ name: 'concept_code', type: 'varchar', length: 30, nullable: true, comment: '논리 참조: concepts.concept_code' })
  conceptCode!: string | null;

  @Column({ name: 'status', type: 'enum', enum: ReviewSessionStatus, enumName: 'review_session_status', default: ReviewSessionStatus.InProgress })
  status!: ReviewSessionStatus;

  @Column({ name: 'question_count', type: 'smallint', comment: '시작 시점 고정' })
  questionCount!: number;

  @Column({ name: 'submitted_count', type: 'smallint', default: 0 })
  submittedCount!: number;

  @Column({ name: 'correct_count', type: 'smallint', default: 0 })
  correctCount!: number;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
