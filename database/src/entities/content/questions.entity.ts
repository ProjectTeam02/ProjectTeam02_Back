// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.questions)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Difficulty, GeneratedBy, QuestionStatus, QuestionType } from '../common/enums';
import { AiRequest } from '../ai/ai-requests.entity';
import { Concept } from './concepts.entity';
import { User } from '../account/users.entity';

/** 퀴즈 문항 (버전 관리). */
@Index('questions_concept_id_idx', ['conceptId'])
@Index('questions_question_code_version_idx', ['questionCode', 'version'], { unique: true })
@Entity({ name: 'questions', schema: 'app' })
export class Question {
  /** 문항 ID (버전별). API questionId */
  @PrimaryGeneratedColumn('uuid', { name: 'question_id', primaryKeyConstraintName: 'questions_pkey' })
  questionId!: string;

  /** 문항 코드 (버전 무관 식별자) */
  @Column({ name: 'question_code', type: 'varchar', length: 30 })
  questionCode!: string;

  /** 버전 */
  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number;

  /** 이전 버전 문항 */
  @Column({ name: 'supersedes_question_id', type: 'uuid', nullable: true })
  supersedesQuestionId!: string | null;

  /** 관계: supersedes_question_id → questions.question_id */
  @ManyToOne(() => Question, { nullable: true })
  @JoinColumn({ name: 'supersedes_question_id', foreignKeyConstraintName: 'questions_supersedes_question_id_fkey' })
  supersedesQuestion?: Question | null;

  /** 개념 (1문항 1개념) */
  @Column({ name: 'concept_id', type: 'uuid' })
  conceptId!: string;

  /** 관계: concept_id → concepts.concept_id */
  @ManyToOne(() => Concept, { nullable: false })
  @JoinColumn({ name: 'concept_id', foreignKeyConstraintName: 'questions_concept_id_fkey' })
  concept?: Concept;

  /** 문항 유형 */
  @Column({ name: 'question_type', type: 'enum', enum: QuestionType, enumName: 'question_type', default: QuestionType.MultipleChoice })
  questionType!: QuestionType;

  /** 문제 본문 */
  @Column({ name: 'question_text', type: 'text' })
  questionText!: string;

  /** 정답 해설 */
  @Column({ name: 'explanation', type: 'text' })
  explanation!: string;

  /** 다시 기억해요 (핵심 정리) */
  @Column({ name: 'key_point', type: 'varchar', length: 255, nullable: true })
  keyPoint!: string | null;

  /** 난이도 (BEGINNER / INTERMEDIATE / ADVANCED) */
  @Column({ name: 'difficulty', type: 'enum', enum: Difficulty, enumName: 'difficulty', nullable: true })
  difficulty!: Difficulty | null;

  /** 생성 방식 (AI / MANUAL) */
  @Column({ name: 'generated_by', type: 'enum', enum: GeneratedBy, enumName: 'generated_by' })
  generatedBy!: GeneratedBy;

  /** AI 생성 요청 */
  @Column({ name: 'generation_request_id', type: 'uuid', nullable: true })
  generationRequestId!: string | null;

  /** 관계: generation_request_id → ai_requests.request_id */
  @ManyToOne(() => AiRequest, { nullable: true })
  @JoinColumn({ name: 'generation_request_id', foreignKeyConstraintName: 'questions_generation_request_id_fkey' })
  generationRequest?: AiRequest | null;

  /** 근거 문서 ID 목록 (논리 참조: ai 스키마) */
  @Column({ name: 'source_document_ids', type: 'text', array: true, nullable: true })
  sourceDocumentIds!: string[] | null;

  /** 검수·공개 상태 (GENERATED ~ PUBLISHED / RETIRED) */
  @Column({ name: 'status', type: 'enum', enum: QuestionStatus, enumName: 'question_status', default: QuestionStatus.Generated })
  status!: QuestionStatus;

  /** 검수 의견 */
  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment!: string | null;

  /** 검수자 */
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  /** 관계: reviewed_by → users.user_id */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by', foreignKeyConstraintName: 'questions_reviewed_by_fkey' })
  reviewer?: User | null;

  /** 검수 시각 */
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  /** 공개 시각 */
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
