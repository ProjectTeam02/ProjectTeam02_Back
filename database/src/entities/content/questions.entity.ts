// 자동 생성: leren_erd_v2.dbml 기준 (app.questions)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Difficulty, GeneratedBy, QuestionStatus, QuestionType } from '../common/enums';
import { AiRequest } from '../ai/ai-requests.entity';
import { Concept } from './concepts.entity';
import { User } from '../account/users.entity';

@Index(['questionCode', 'version'], { unique: true })
@Entity({ name: 'questions', schema: 'app' })
export class Question {
  @PrimaryGeneratedColumn('uuid', { name: 'question_id' })
  questionId!: string;

  @Column({ name: 'question_code', type: 'varchar', length: 30, comment: '버전 무관 식별자' })
  questionCode!: string;

  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number;

  @Column({ name: 'supersedes_question_id', type: 'uuid', nullable: true })
  supersedesQuestionId!: string | null;

  @ManyToOne(() => Question, { nullable: true })
  @JoinColumn({ name: 'supersedes_question_id' })
  supersedesQuestion?: Question | null;

  @Column({ name: 'concept_id', type: 'uuid', comment: '1문항 1개념' })
  conceptId!: string;

  @ManyToOne(() => Concept, { nullable: false })
  @JoinColumn({ name: 'concept_id' })
  concept?: Concept;

  @Column({ name: 'question_type', type: 'enum', enum: QuestionType, enumName: 'question_type', default: QuestionType.MultipleChoice })
  questionType!: QuestionType;

  @Column({ name: 'question_text', type: 'text' })
  questionText!: string;

  @Column({ name: 'explanation', type: 'text', comment: '정답 해설' })
  explanation!: string;

  @Column({ name: 'key_point', type: 'varchar', length: 255, nullable: true, comment: '다시 기억해요' })
  keyPoint!: string | null;

  @Column({ name: 'difficulty', type: 'enum', enum: Difficulty, enumName: 'difficulty', nullable: true })
  difficulty!: Difficulty | null;

  @Column({ name: 'generated_by', type: 'enum', enum: GeneratedBy, enumName: 'generated_by' })
  generatedBy!: GeneratedBy;

  @Column({ name: 'generation_request_id', type: 'uuid', nullable: true })
  generationRequestId!: string | null;

  @ManyToOne(() => AiRequest, { nullable: true })
  @JoinColumn({ name: 'generation_request_id' })
  generationRequest?: AiRequest | null;

  @Column({ name: 'source_document_ids', type: 'text', array: true, nullable: true, comment: '논리 참조: ai.knowledge_documents.document_id' })
  sourceDocumentIds!: string[] | null;

  @Column({ name: 'status', type: 'enum', enum: QuestionStatus, enumName: 'question_status', default: QuestionStatus.Generated })
  status!: QuestionStatus;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment!: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer?: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
