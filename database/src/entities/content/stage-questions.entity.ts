// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.stage_questions)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Question } from './questions.entity';
import { Stage } from './stages.entity';

/** Stage별 출제 문항과 순서. */
@Index('stage_questions_stage_id_question_id_idx', ['stageId', 'questionId'], { unique: true })
@Entity({ name: 'stage_questions', schema: 'app' })
export class StageQuestion {
  /** Stage */
  @PrimaryColumn({ name: 'stage_id', type: 'uuid', primaryKeyConstraintName: 'stage_questions_pkey' })
  stageId!: string;

  /** 관계: stage_id → stages.stage_id */
  @ManyToOne(() => Stage, { nullable: false })
  @JoinColumn({ name: 'stage_id', foreignKeyConstraintName: 'stage_questions_stage_id_fkey' })
  stage?: Stage;

  /** 문항 */
  @Column({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  /** 관계: question_id → questions.question_id */
  @ManyToOne(() => Question, { nullable: false })
  @JoinColumn({ name: 'question_id', foreignKeyConstraintName: 'stage_questions_question_id_fkey' })
  question?: Question;

  /** 출제 순서 */
  @PrimaryColumn({ name: 'question_order', type: 'smallint', primaryKeyConstraintName: 'stage_questions_pkey' })
  questionOrder!: number;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
