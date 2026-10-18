// 자동 생성: leren_erd_v2.dbml 기준 (app.review_submissions)
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Question } from '../content/questions.entity';
import { QuestionChoice } from '../content/question-choices.entity';
import { ReviewItem } from './review-items.entity';
import { ReviewSession } from './review-sessions.entity';

@Index(['reviewSessionId', 'reviewItemId'], { unique: true })
@Index(['reviewSessionId', 'sequenceNo'], { unique: true })
@Entity({ name: 'review_submissions', schema: 'app' })
export class ReviewSubmission {
  @PrimaryGeneratedColumn('uuid', { name: 'submission_id' })
  submissionId!: string;

  @Column({ name: 'review_session_id', type: 'uuid' })
  reviewSessionId!: string;

  @ManyToOne(() => ReviewSession, { nullable: false })
  @JoinColumn({ name: 'review_session_id' })
  reviewSession?: ReviewSession;

  @Column({ name: 'review_item_id', type: 'uuid' })
  reviewItemId!: string;

  @ManyToOne(() => ReviewItem, { nullable: false })
  @JoinColumn({ name: 'review_item_id' })
  reviewItem?: ReviewItem;

  @Column({ name: 'question_id', type: 'uuid', comment: '실제 출제된 문항 버전' })
  questionId!: string;

  @ManyToOne(() => Question, { nullable: false })
  @JoinColumn({ name: 'question_id' })
  question?: Question;

  @Column({ name: 'sequence_no', type: 'smallint' })
  sequenceNo!: number;

  @Column({ name: 'displayed_choice_order', type: 'uuid', array: true })
  displayedChoiceOrder!: string[];

  @Column({ name: 'selected_choice_id', type: 'uuid', nullable: true, comment: '미제출 시 null' })
  selectedChoiceId!: string | null;

  @ManyToOne(() => QuestionChoice, { nullable: true })
  @JoinColumn({ name: 'selected_choice_id' })
  selectedChoice?: QuestionChoice | null;

  @Column({ name: 'is_correct', type: 'boolean', nullable: true })
  isCorrect!: boolean | null;

  @Column({ name: 'confusing_checked', type: 'boolean', default: false, comment: '제출 시점의 헷갈림 체크 상태' })
  confusingChecked!: boolean;

  @Column({ name: 'response_time_ms', type: 'integer', nullable: true })
  responseTimeMs!: number | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;
}
