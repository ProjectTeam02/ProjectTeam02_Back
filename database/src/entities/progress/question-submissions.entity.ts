// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.question_submissions)
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { LearningAttempt } from './learning-attempts.entity';
import { Question } from '../content/questions.entity';
import { QuestionChoice } from '../content/question-choices.entity';

/** 퀴즈 문항별 답안. */
@Index('question_submissions_attempt_id_question_id_idx', ['attemptId', 'questionId'], { unique: true })
@Index('question_submissions_attempt_id_sequence_no_idx', ['attemptId', 'sequenceNo'], { unique: true })
@Index('question_submissions_question_id_idx', ['questionId'])
@Check('chk_submissions_position', `(selected_position >= 1) AND (selected_position <= 4)`)
@Entity({ name: 'question_submissions', schema: 'app' })
export class QuestionSubmission {
  /** 답안 ID = API submissionId. 앱이 만든 UUID를 그대로 저장, 같은 값 재제출은 거부 */
  @PrimaryColumn({ name: 'submission_id', type: 'uuid', primaryKeyConstraintName: 'question_submissions_pkey' })
  submissionId!: string;

  /** 소속 응시 */
  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId!: string;

  /** 관계: attempt_id → learning_attempts.attempt_id */
  @ManyToOne(() => LearningAttempt, { nullable: false })
  @JoinColumn({ name: 'attempt_id', foreignKeyConstraintName: 'question_submissions_attempt_id_fkey' })
  attempt?: LearningAttempt;

  /** 문항 */
  @Column({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  /** 관계: question_id → questions.question_id */
  @ManyToOne(() => Question, { nullable: false })
  @JoinColumn({ name: 'question_id', foreignKeyConstraintName: 'question_submissions_question_id_fkey' })
  question?: Question;

  /** 출제 순서 */
  @Column({ name: 'sequence_no', type: 'smallint' })
  sequenceNo!: number;

  /** 화면에 보인 선택지 순서 */
  @Column({ name: 'displayed_choice_order', type: 'uuid', array: true })
  displayedChoiceOrder!: string[];

  /** 고른 선택지. API choiceId (그 문항의 선택지만 허용) */
  @Column({ name: 'choice_id', type: 'uuid' })
  choiceId!: string;

  /** 화면상 선택 위치 (1~4) */
  @Column({ name: 'selected_position', type: 'smallint' })
  selectedPosition!: number;

  /** 정답 여부 */
  @Column({ name: 'is_correct', type: 'boolean' })
  isCorrect!: boolean;

  /** 제출 전 HP */
  @Column({ name: 'hp_before', type: 'smallint' })
  hpBefore!: number;

  /** 제출 후 HP */
  @Column({ name: 'hp_after', type: 'smallint' })
  hpAfter!: number;

  /** 응답 시간(ms) */
  @Column({ name: 'response_time_ms', type: 'integer', nullable: true })
  responseTimeMs!: number | null;

  /** 제출 시각 */
  @Column({ name: 'submitted_at', type: 'timestamptz', default: () => 'now()' })
  submittedAt!: Date;

  /** 관계(복합 FK fk_question_submissions_choice): (question_id, choice_id) → question_choices(question_id, choice_id) */
  @ManyToOne(() => QuestionChoice, { nullable: false })
  @JoinColumn([{ name: 'question_id', referencedColumnName: 'questionId', foreignKeyConstraintName: 'fk_question_submissions_choice' }, { name: 'choice_id', referencedColumnName: 'choiceId' }])
  choice?: QuestionChoice;
}
