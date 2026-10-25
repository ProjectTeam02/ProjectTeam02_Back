// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.ai_conversations)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AiEntryPoint, ConversationStatus } from '../common/enums';
import { Concept } from '../content/concepts.entity';
import { LearningAttempt } from '../progress/learning-attempts.entity';
import { Question } from '../content/questions.entity';
import { Stage } from '../content/stages.entity';
import { Topic } from '../content/topics.entity';
import { User } from '../account/users.entity';

/** AI Tutor 대화방. */
@Index('ai_conversations_user_id_updated_at_idx', ['userId', 'updatedAt'])
@Entity({ name: 'ai_conversations', schema: 'app' })
export class AiConversation {
  /** 대화 ID. API conversationId */
  @PrimaryGeneratedColumn('uuid', { name: 'conversation_id', primaryKeyConstraintName: 'ai_conversations_pkey' })
  conversationId!: string;

  /** 대화 소유자 (소유자 확인 기준) */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'ai_conversations_user_id_fkey' })
  user?: User;

  /** 진입 위치 (선택) */
  @Column({ name: 'entry_point', type: 'enum', enum: AiEntryPoint, enumName: 'ai_entry_point', nullable: true })
  entryPoint!: AiEntryPoint | null;

  /** 시작 문맥: 주제 */
  @Column({ name: 'context_topic_id', type: 'uuid', nullable: true })
  contextTopicId!: string | null;

  /** 관계: context_topic_id → topics.topic_id */
  @ManyToOne(() => Topic, { nullable: true })
  @JoinColumn({ name: 'context_topic_id', foreignKeyConstraintName: 'ai_conversations_context_topic_id_fkey' })
  contextTopic?: Topic | null;

  /** 시작 문맥: Stage. API stageId */
  @Column({ name: 'context_stage_id', type: 'uuid', nullable: true })
  contextStageId!: string | null;

  /** 관계: context_stage_id → stages.stage_id */
  @ManyToOne(() => Stage, { nullable: true })
  @JoinColumn({ name: 'context_stage_id', foreignKeyConstraintName: 'ai_conversations_context_stage_id_fkey' })
  contextStage?: Stage | null;

  /** 시작 문맥: 개념. API conceptId */
  @Column({ name: 'context_concept_id', type: 'uuid', nullable: true })
  contextConceptId!: string | null;

  /** 관계: context_concept_id → concepts.concept_id */
  @ManyToOne(() => Concept, { nullable: true })
  @JoinColumn({ name: 'context_concept_id', foreignKeyConstraintName: 'ai_conversations_context_concept_id_fkey' })
  contextConcept?: Concept | null;

  /** 시작 문맥: 문항 */
  @Column({ name: 'context_question_id', type: 'uuid', nullable: true })
  contextQuestionId!: string | null;

  /** 관계: context_question_id → questions.question_id */
  @ManyToOne(() => Question, { nullable: true })
  @JoinColumn({ name: 'context_question_id', foreignKeyConstraintName: 'ai_conversations_context_question_id_fkey' })
  contextQuestion?: Question | null;

  /** 시작 문맥: 응시 */
  @Column({ name: 'context_attempt_id', type: 'uuid', nullable: true })
  contextAttemptId!: string | null;

  /** 관계: context_attempt_id → learning_attempts.attempt_id */
  @ManyToOne(() => LearningAttempt, { nullable: true })
  @JoinColumn({ name: 'context_attempt_id', foreignKeyConstraintName: 'ai_conversations_context_attempt_id_fkey' })
  contextAttempt?: LearningAttempt | null;

  /** 대화 제목 */
  @Column({ name: 'title', type: 'varchar', length: 100, nullable: true })
  title!: string | null;

  /** 대화 상태 (ACTIVE / ARCHIVED) */
  @Column({ name: 'status', type: 'enum', enum: ConversationStatus, enumName: 'conversation_status', default: ConversationStatus.Active })
  status!: ConversationStatus;

  /** 오래된 턴의 요약 (대화가 길어질 때만 사용) */
  @Column({ name: 'summary', type: 'text', nullable: true })
  summary!: string | null;

  /** summary가 반영한 마지막 sequence_no */
  @Column({ name: 'summary_until_seq', type: 'integer', nullable: true })
  summaryUntilSeq!: number | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각. 대화 목록 정렬 기준, 메시지 저장 시 함께 갱신 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
