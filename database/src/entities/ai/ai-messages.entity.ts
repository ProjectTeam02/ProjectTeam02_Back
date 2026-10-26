// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.ai_messages)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { GroundingStatus, MessageInputType, MessageRole, MessageStatus } from '../common/enums';
import { AiConversation } from './ai-conversations.entity';
import { AiRequest } from './ai-requests.entity';
import { Concept } from '../content/concepts.entity';
import { Stage } from '../content/stages.entity';

/** 질문·답변 메시지와 멀티턴 상태. */
@Index('ai_messages_conversation_id_client_message_id_idx', ['conversationId', 'clientMessageId'], { unique: true })
@Index('ai_messages_conversation_id_sequence_no_idx', ['conversationId', 'sequenceNo'], { unique: true })
@Index('uq_ai_messages_one_pending_answer', ['conversationId'], { unique: true, where: `"role" = 'ASSISTANT' AND "status" = 'PENDING'` })
@Entity({ name: 'ai_messages', schema: 'app' })
export class AiMessage {
  /** 메시지 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'message_id', primaryKeyConstraintName: 'ai_messages_pkey' })
  messageId!: string;

  /** 소속 대화 */
  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  /** 관계: conversation_id → ai_conversations.conversation_id */
  @ManyToOne(() => AiConversation, { nullable: false })
  @JoinColumn({ name: 'conversation_id', foreignKeyConstraintName: 'ai_messages_conversation_id_fkey' })
  conversation?: AiConversation;

  /** 답변이 가리키는 질문 메시지 */
  @Column({ name: 'parent_message_id', type: 'uuid', nullable: true })
  parentMessageId!: string | null;

  /** 관계: parent_message_id → ai_messages.message_id */
  @ManyToOne(() => AiMessage, { nullable: true })
  @JoinColumn({ name: 'parent_message_id', foreignKeyConstraintName: 'ai_messages_parent_message_id_fkey' })
  parentMessage?: AiMessage | null;

  /** 대화 내 순서. 메시지 조회 cursor 기준 */
  @Column({ name: 'sequence_no', type: 'integer' })
  sequenceNo!: number;

  /** 작성자 (USER / ASSISTANT) */
  @Column({ name: 'role', type: 'enum', enum: MessageRole, enumName: 'message_role' })
  role!: MessageRole;

  /** 입력 방식 (TYPED 직접 입력 / SUGGESTED 추천 질문) */
  @Column({ name: 'input_type', type: 'enum', enum: MessageInputType, enumName: 'message_input_type', nullable: true })
  inputType!: MessageInputType | null;

  /** USER 메시지의 API clientMessageId (재전송 중복 방지) */
  @Column({ name: 'client_message_id', type: 'varchar', length: 100, nullable: true })
  clientMessageId!: string | null;

  /** 이번 질문의 Stage. API stageId */
  @Column({ name: 'context_stage_id', type: 'uuid', nullable: true })
  contextStageId!: string | null;

  /** 관계: context_stage_id → stages.stage_id */
  @ManyToOne(() => Stage, { nullable: true })
  @JoinColumn({ name: 'context_stage_id', foreignKeyConstraintName: 'ai_messages_context_stage_id_fkey' })
  contextStage?: Stage | null;

  /** 이번 질문의 개념. API conceptId */
  @Column({ name: 'context_concept_id', type: 'uuid', nullable: true })
  contextConceptId!: string | null;

  /** 관계: context_concept_id → concepts.concept_id */
  @ManyToOne(() => Concept, { nullable: true })
  @JoinColumn({ name: 'context_concept_id', foreignKeyConstraintName: 'ai_messages_context_concept_id_fkey' })
  contextConcept?: Concept | null;

  /** 질문 또는 답변 본문. USER = API question, ASSISTANT = 답변 */
  @Column({ name: 'content', type: 'text' })
  content!: string;

  /** USER 메시지: 이전 대화를 반영해 다시 쓴 검색 쿼리 (FastAPI 응답) */
  @Column({ name: 'rewritten_query', type: 'text', nullable: true })
  rewrittenQuery!: string | null;

  /** ASSISTANT 메시지: 프롬프트에 원문으로 넣은 첫 sequence_no */
  @Column({ name: 'history_from_seq', type: 'integer', nullable: true })
  historyFromSeq!: number | null;

  /** 토큰 수 (히스토리를 자를 때 사용) */
  @Column({ name: 'token_count', type: 'integer', nullable: true })
  tokenCount!: number | null;

  /** 처리 상태 (PENDING / COMPLETED / FAILED) */
  @Column({ name: 'status', type: 'enum', enum: MessageStatus, enumName: 'message_status', default: MessageStatus.Pending })
  status!: MessageStatus;

  /** 근거 충분 여부 (GROUNDED / INSUFFICIENT). API 검색 상태 */
  @Column({ name: 'grounding_status', type: 'enum', enum: GroundingStatus, enumName: 'grounding_status', nullable: true })
  groundingStatus!: GroundingStatus | null;

  /** 오류 코드 */
  @Column({ name: 'error_code', type: 'varchar', length: 50, nullable: true })
  errorCode!: string | null;

  /** AI 호출 기록 */
  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null;

  /** 관계: request_id → ai_requests.request_id */
  @ManyToOne(() => AiRequest, { nullable: true })
  @JoinColumn({ name: 'request_id', foreignKeyConstraintName: 'ai_messages_request_id_fkey' })
  request?: AiRequest | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 답변 완료 시각 */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
