// 자동 생성: leren_erd_v2.dbml 기준 (app.step_questions)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Question } from './questions.entity';
import { Step } from './steps.entity';

@Index(['stepId', 'questionId'], { unique: true })
@Entity({ name: 'step_questions', schema: 'app' })
export class StepQuestion {
  @PrimaryColumn({ name: 'step_id', type: 'uuid' })
  stepId!: string;

  @ManyToOne(() => Step, { nullable: false })
  @JoinColumn({ name: 'step_id' })
  step?: Step;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  @ManyToOne(() => Question, { nullable: false })
  @JoinColumn({ name: 'question_id' })
  question?: Question;

  @PrimaryColumn({ name: 'question_order', type: 'smallint' })
  questionOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
