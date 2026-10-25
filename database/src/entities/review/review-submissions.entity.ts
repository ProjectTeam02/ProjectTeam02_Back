// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.review_submissions)
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Question } from '../content/questions.entity';
import { QuestionChoice } from '../content/question-choices.entity';
import { ReviewAttempt } from './review-attempts.entity';
import { ReviewItem } from './review-items.entity';

/** 복습 문항별 답안. */
@Index('review_submissions_review_attempt_id_review_item_id_idx', ['reviewAttemptId', 'reviewItemId'], { unique: true })
@Index('review_submissions_review_attempt_id_sequence_no_idx', ['reviewAttemptId', 'sequenceNo'], { unique: true })
@Entity({ name: 'review_submissions', schema: 'app' })
export class ReviewSubmission {
  /** 답안 ID = API submissionId. 복습 시작 시 서버가 문항별로 미리 발급 */
  @PrimaryGeneratedColumn('uuid', { name: 'submission_id', primaryKeyConstraintName: 'review_submissions_pkey' })
  submissionId!: string;

  /** 소속 복습 응시 */
  @Column({ name: 'review_attempt_id', type: 'uuid' })
  reviewAttemptId!: string;

  /** 관계: review_attempt_id → review_attempts.review_attempt_id */
  @ManyToOne(() => ReviewAttempt, { nullable: false })
  @JoinColumn({ name: 'review_attempt_id', foreignKeyConstraintName: 'review_submissions_review_attempt_id_fkey' })
  reviewAttempt?: ReviewAttempt;

  /** 대상 오답·북마크 항목 */
  @Column({ name: 'review_item_id', type: 'uuid' })
  reviewItemId!: string;

  /** 관계: review_item_id → review_items.review_item_id */
  @ManyToOne(() => ReviewItem, { nullable: false })
  @JoinColumn({ name: 'review_item_id', foreignKeyConstraintName: 'review_submissions_review_item_id_fkey' })
  reviewItem?: ReviewItem;

  /** 실제 출제된 문항 버전 */
  @Column({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  /** 관계: question_id → questions.question_id */
  @ManyToOne(() => Question, { nullable: false })
  @JoinColumn({ name: 'question_id', foreignKeyConstraintName: 'review_submissions_question_id_fkey' })
  question?: Question;

  /** 출제 순서 */
  @Column({ name: 'sequence_no', type: 'smallint' })
  sequenceNo!: number;

  /** 화면에 보인 선택지 순서 */
  @Column({ name: 'displayed_choice_order', type: 'uuid', array: true })
  displayedChoiceOrder!: string[];

  /** 고른 선택지. API choiceId (미제출 시 null, 그 문항의 선택지만 허용) */
  @Column({ name: 'choice_id', type: 'uuid', nullable: true })
  choiceId!: string | null;

  /** 정답 여부 */
  @Column({ name: 'is_correct', type: 'boolean', nullable: true })
  isCorrect!: boolean | null;

  /** 제출 시점 북마크 상태 */
  @Column({ name: 'bookmark_checked', type: 'boolean', default: false })
  bookmarkChecked!: boolean;

  /** 응답 시간(ms) */
  @Column({ name: 'response_time_ms', type: 'integer', nullable: true })
  responseTimeMs!: number | null;

  /** 제출 시각 */
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  /** 관계(복합 FK fk_review_submissions_choice): (question_id, choice_id) → question_choices(question_id, choice_id) */
  @ManyToOne(() => QuestionChoice, { nullable: true })
  @JoinColumn([{ name: 'question_id', referencedColumnName: 'questionId', foreignKeyConstraintName: 'fk_review_submissions_choice' }, { name: 'choice_id', referencedColumnName: 'choiceId' }])
  choice?: QuestionChoice | null;
}
