// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.review_items)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AnswerResult, ReviewFirstReason } from '../common/enums';
import { Question } from '../content/questions.entity';
import { Stage } from '../content/stages.entity';
import { User } from '../account/users.entity';

/** 오답·북마크 통합 목록 (문제당 1행). */
@Index('review_items_user_id_concept_code_idx', ['userId', 'conceptCode'])
@Index('review_items_user_id_is_bookmarked_idx', ['userId', 'isBookmarked'])
@Index('review_items_user_id_question_code_idx', ['userId', 'questionCode'], { unique: true })
@Entity({ name: 'review_items', schema: 'app' })
export class ReviewItem {
  /** 오답·북마크 항목 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'review_item_id', primaryKeyConstraintName: 'review_items_pkey' })
  reviewItemId!: string;

  /** 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'review_items_user_id_fkey' })
  user?: User;

  /** 문항 코드 (논리 참조) */
  @Column({ name: 'question_code', type: 'varchar', length: 30 })
  questionCode!: string;

  /** 가장 최근 버전 문항 */
  @Column({ name: 'latest_question_id', type: 'uuid' })
  latestQuestionId!: string;

  /** 관계: latest_question_id → questions.question_id */
  @ManyToOne(() => Question, { nullable: false })
  @JoinColumn({ name: 'latest_question_id', foreignKeyConstraintName: 'review_items_latest_question_id_fkey' })
  latestQuestion?: Question;

  /** 개념 코드 (논리 참조) */
  @Column({ name: 'concept_code', type: 'varchar', length: 30 })
  conceptCode!: string;

  /** 처음 틀린 Stage */
  @Column({ name: 'source_stage_id', type: 'uuid', nullable: true })
  sourceStageId!: string | null;

  /** 관계: source_stage_id → stages.stage_id */
  @ManyToOne(() => Stage, { nullable: true })
  @JoinColumn({ name: 'source_stage_id', foreignKeyConstraintName: 'review_items_source_stage_id_fkey' })
  sourceStage?: Stage | null;

  /** 최초 등록 사유 (WRONG 오답 / BOOKMARK 북마크) */
  @Column({ name: 'first_reason', type: 'enum', enum: ReviewFirstReason, enumName: 'review_first_reason' })
  firstReason!: ReviewFirstReason;

  /** 오답 횟수. 0보다 크면 오답 목록에 표시 */
  @Column({ name: 'wrong_count', type: 'integer', default: 0 })
  wrongCount!: number;

  /** 마지막 풀이 결과 */
  @Column({ name: 'last_answer_result', type: 'enum', enum: AnswerResult, enumName: 'answer_result', nullable: true })
  lastAnswerResult!: AnswerResult | null;

  /** 마지막 풀이 시각 */
  @Column({ name: 'last_answered_at', type: 'timestamptz', nullable: true })
  lastAnsweredAt!: Date | null;

  /** 북마크 여부. true면 북마크 목록에 표시 */
  @Column({ name: 'is_bookmarked', type: 'boolean', default: false })
  isBookmarked!: boolean;

  /** 북마크 등록 시각 */
  @Column({ name: 'bookmarked_at', type: 'timestamptz', nullable: true })
  bookmarkedAt!: Date | null;

  /** 북마크 해제 시각 (해제해도 오답 이력은 유지) */
  @Column({ name: 'unbookmarked_at', type: 'timestamptz', nullable: true })
  unbookmarkedAt!: Date | null;

  /** 최초 등록 시각 */
  @Column({ name: 'first_registered_at', type: 'timestamptz', default: () => 'now()' })
  firstRegisteredAt!: Date;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
