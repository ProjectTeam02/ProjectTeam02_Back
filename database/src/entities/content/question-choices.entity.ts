// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.question_choices)
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Question } from './questions.entity';

/** 선택지. 문항당 4개, 정답 1개(앱 검증). */
@Index('question_choices_question_id_base_order_idx', ['questionId', 'baseOrder'], { unique: true })
@Index('question_choices_question_id_choice_id_idx', ['questionId', 'choiceId'], { unique: true })
@Check('chk_choices_base_order', `(base_order >= 1) AND (base_order <= 4)`)
@Entity({ name: 'question_choices', schema: 'app' })
export class QuestionChoice {
  /** 선택지 ID. API choiceId */
  @PrimaryGeneratedColumn('uuid', { name: 'choice_id', primaryKeyConstraintName: 'question_choices_pkey' })
  choiceId!: string;

  /** 소속 문항 */
  @Column({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  /** 관계: question_id → questions.question_id */
  @ManyToOne(() => Question, { nullable: false })
  @JoinColumn({ name: 'question_id', foreignKeyConstraintName: 'question_choices_question_id_fkey' })
  question?: Question;

  /** 기본 순서 (1~4) */
  @Column({ name: 'base_order', type: 'smallint' })
  baseOrder!: number;

  /** 선택지 내용 */
  @Column({ name: 'choice_text', type: 'varchar', length: 255 })
  choiceText!: string;

  /** 정답 여부 (제출 전 응답 노출 금지) */
  @Column({ name: 'is_correct', type: 'boolean', default: false })
  isCorrect!: boolean;

  /** 오답 선택 시 피드백 */
  @Column({ name: 'feedback_text', type: 'varchar', length: 255, nullable: true })
  feedbackText!: string | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
