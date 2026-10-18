// 자동 생성: leren_erd_v2.dbml 기준 (app.question_submissions)
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { LearningAttempt } from './learning-attempts.entity';
import { Question } from '../content/questions.entity';
import { QuestionChoice } from '../content/question-choices.entity';

@Index(['attemptId', 'questionId'], { unique: true })
@Index(['attemptId', 'sequenceNo'], { unique: true })
@Check('chk_submissions_position', `"selected_position" BETWEEN 1 AND 4`)
@Entity({ name: 'question_submissions', schema: 'app' })
export class QuestionSubmission {
  @PrimaryGeneratedColumn('uuid', { name: 'submission_id' })
  submissionId!: string;

  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId!: string;

  @ManyToOne(() => LearningAttempt, { nullable: false })
  @JoinColumn({ name: 'attempt_id' })
  attempt?: LearningAttempt;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  @ManyToOne(() => Question, { nullable: false })
  @JoinColumn({ name: 'question_id' })
  question?: Question;

  @Column({ name: 'sequence_no', type: 'smallint' })
  sequenceNo!: number;

  @Column({ name: 'displayed_choice_order', type: 'uuid', array: true })
  displayedChoiceOrder!: string[];

  @Column({ name: 'selected_choice_id', type: 'uuid' })
  selectedChoiceId!: string;

  @ManyToOne(() => QuestionChoice, { nullable: false })
  @JoinColumn({ name: 'selected_choice_id' })
  selectedChoice?: QuestionChoice;

  @Column({ name: 'selected_position', type: 'smallint', comment: '화면상 1~4' })
  selectedPosition!: number;

  @Column({ name: 'is_correct', type: 'boolean' })
  isCorrect!: boolean;

  @Column({ name: 'hp_before', type: 'smallint' })
  hpBefore!: number;

  @Column({ name: 'hp_after', type: 'smallint' })
  hpAfter!: number;

  @Column({ name: 'response_time_ms', type: 'integer', nullable: true })
  responseTimeMs!: number | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100, unique: true, nullable: true })
  idempotencyKey!: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', default: () => 'now()' })
  submittedAt!: Date;
}
