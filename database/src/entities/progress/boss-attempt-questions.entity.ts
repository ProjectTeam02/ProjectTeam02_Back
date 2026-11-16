import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { Question } from '../content/questions.entity';
import { LearningAttempt } from './learning-attempts.entity';

@Entity({ name: 'boss_attempt_questions', schema: 'learning' })
@Unique('uq_boss_attempt_questions_question', ['attemptId', 'questionId'])
@Check('chk_boss_attempt_questions_order', 'question_order BETWEEN 1 AND 7')
export class BossAttemptQuestion {
  @PrimaryColumn({ name: 'attempt_id', type: 'uuid', primaryKeyConstraintName: 'boss_attempt_questions_pkey' })
  attemptId!: string;

  @PrimaryColumn({ name: 'question_order', type: 'smallint', primaryKeyConstraintName: 'boss_attempt_questions_pkey' })
  questionOrder!: number;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  @ManyToOne(() => LearningAttempt, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attempt_id', foreignKeyConstraintName: 'boss_attempt_questions_attempt_id_fkey' })
  attempt?: LearningAttempt;

  @ManyToOne(() => Question, { nullable: false })
  @JoinColumn({ name: 'question_id', foreignKeyConstraintName: 'boss_attempt_questions_question_id_fkey' })
  question?: Question;
}
