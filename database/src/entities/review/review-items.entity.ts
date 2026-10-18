// 자동 생성: leren_erd_v2.dbml 기준 (app.review_items)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AnswerResult, ReviewFirstReason } from '../common/enums';
import { Question } from '../content/questions.entity';
import { Step } from '../content/steps.entity';
import { User } from '../account/users.entity';

@Index(['userId', 'questionCode'], { unique: true })
@Index(['userId', 'conceptCode'])
@Entity({ name: 'review_items', schema: 'app' })
export class ReviewItem {
  @PrimaryGeneratedColumn('uuid', { name: 'review_item_id' })
  reviewItemId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'question_code', type: 'varchar', length: 30, comment: '논리 참조: questions.question_code' })
  questionCode!: string;

  @Column({ name: 'latest_question_id', type: 'uuid' })
  latestQuestionId!: string;

  @ManyToOne(() => Question, { nullable: false })
  @JoinColumn({ name: 'latest_question_id' })
  latestQuestion?: Question;

  @Column({ name: 'concept_code', type: 'varchar', length: 30, comment: '논리 참조: concepts.concept_code' })
  conceptCode!: string;

  @Column({ name: 'source_step_id', type: 'uuid', nullable: true })
  sourceStepId!: string | null;

  @ManyToOne(() => Step, { nullable: true })
  @JoinColumn({ name: 'source_step_id' })
  sourceStep?: Step | null;

  @Column({ name: 'first_reason', type: 'enum', enum: ReviewFirstReason, enumName: 'review_first_reason' })
  firstReason!: ReviewFirstReason;

  @Column({ name: 'wrong_count', type: 'integer', default: 0, comment: '데이터 계약 필드, 제출과 같은 트랜잭션에서 갱신' })
  wrongCount!: number;

  @Column({ name: 'last_answer_result', type: 'enum', enum: AnswerResult, enumName: 'answer_result', nullable: true })
  lastAnswerResult!: AnswerResult | null;

  @Column({ name: 'last_answered_at', type: 'timestamptz', nullable: true })
  lastAnsweredAt!: Date | null;

  @Column({ name: 'is_confusing', type: 'boolean', default: false })
  isConfusing!: boolean;

  @Column({ name: 'flagged_at', type: 'timestamptz', nullable: true })
  flaggedAt!: Date | null;

  @Column({ name: 'unflagged_at', type: 'timestamptz', nullable: true })
  unflaggedAt!: Date | null;

  @Column({ name: 'first_registered_at', type: 'timestamptz', default: () => 'now()' })
  firstRegisteredAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
