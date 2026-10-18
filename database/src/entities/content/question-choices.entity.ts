// 자동 생성: leren_erd_v2.dbml 기준 (app.question_choices)
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Question } from './questions.entity';

@Index(['questionId', 'baseOrder'], { unique: true })
@Check('chk_choices_base_order', `"base_order" BETWEEN 1 AND 4`)
@Entity({ name: 'question_choices', schema: 'app', comment: '문항당 4행, 정답 1개(앱 검증)' })
export class QuestionChoice {
  @PrimaryGeneratedColumn('uuid', { name: 'choice_id' })
  choiceId!: string;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  @ManyToOne(() => Question, { nullable: false })
  @JoinColumn({ name: 'question_id' })
  question?: Question;

  @Column({ name: 'base_order', type: 'smallint', comment: '1~4' })
  baseOrder!: number;

  @Column({ name: 'choice_text', type: 'varchar', length: 255 })
  choiceText!: string;

  @Column({ name: 'is_correct', type: 'boolean', default: false })
  isCorrect!: boolean;

  @Column({ name: 'feedback_text', type: 'varchar', length: 255, nullable: true, comment: '오답 선택 시 피드백' })
  feedbackText!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
