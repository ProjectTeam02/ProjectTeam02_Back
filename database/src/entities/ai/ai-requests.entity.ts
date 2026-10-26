// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.ai_requests)
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AiRequestStatus, AiRequestType, ModelTier } from '../common/enums';
import { AiConversation } from './ai-conversations.entity';
import { User } from '../account/users.entity';

/** AI 호출 기록·비용·일일 사용량. 턴 1회 = TUTOR 요청 1건. */
@Unique('ai_requests_idempotency_key_key', ['idempotencyKey'])
@Index('ai_requests_user_id_usage_date_status_idx', ['userId', 'usageDate', 'status'])
@Entity({ name: 'ai_requests', schema: 'app' })
export class AiRequest {
  /** AI 요청 ID. 내부 API requestId */
  @PrimaryGeneratedColumn('uuid', { name: 'request_id', primaryKeyConstraintName: 'ai_requests_pkey' })
  requestId!: string;

  /** 요청 사용자 */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'ai_requests_user_id_fkey' })
  user?: User | null;

  /** 소속 대화 */
  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  conversationId!: string | null;

  /** 관계: conversation_id → ai_conversations.conversation_id */
  @ManyToOne(() => AiConversation, { nullable: true })
  @JoinColumn({ name: 'conversation_id', foreignKeyConstraintName: 'ai_requests_conversation_id_fkey' })
  conversation?: AiConversation | null;

  /** 요청 종류 (TUTOR / QUESTION_GEN / SUMMARIZE) */
  @Column({ name: 'request_type', type: 'enum', enum: AiRequestType, enumName: 'ai_request_type' })
  requestType!: AiRequestType;

  /** 처리 상태 (RESERVED / SUCCEEDED / FAILED / RELEASED) */
  @Column({ name: 'status', type: 'enum', enum: AiRequestStatus, enumName: 'ai_request_status', default: AiRequestStatus.Reserved })
  status!: AiRequestStatus;

  /** 사용 날짜. reserved_at의 KST 날짜(생성 컬럼), 일일 한도 집계 */
  @Column({ name: 'usage_date', type: 'date', generatedType: 'STORED', asExpression: `("reserved_at" AT TIME ZONE 'Asia/Seoul')::date`, insert: false, update: false })
  usageDate!: string;

  /** 모델 등급 */
  @Column({ name: 'model_tier', type: 'enum', enum: ModelTier, enumName: 'model_tier' })
  modelTier!: ModelTier;

  /** 사용 모델 */
  @Column({ name: 'model_id', type: 'varchar', length: 100, nullable: true })
  modelId!: string | null;

  /** 임베딩 모델 */
  @Column({ name: 'embedding_model_id', type: 'varchar', length: 100, nullable: true })
  embeddingModelId!: string | null;

  /** 검색 범위 (concept_code 목록 등). 내부 API knowledgeScope */
  @Column({ name: 'knowledge_scope', type: 'jsonb', nullable: true })
  knowledgeScope!: Record<string, unknown> | null;

  /** 입력 토큰 (쿼리 재작성 호출 포함 합계) */
  @Column({ name: 'input_tokens', type: 'integer', nullable: true })
  inputTokens!: number | null;

  /** 출력 토큰 */
  @Column({ name: 'output_tokens', type: 'integer', nullable: true })
  outputTokens!: number | null;

  /** 응답 시간(ms) */
  @Column({ name: 'latency_ms', type: 'integer', nullable: true })
  latencyMs!: number | null;

  /** 캐시 사용 여부 */
  @Column({ name: 'cache_hit', type: 'boolean', nullable: true })
  cacheHit!: boolean | null;

  /** 검색 방식 */
  @Column({ name: 'retrieval_strategy', type: 'varchar', length: 50, nullable: true })
  retrievalStrategy!: string | null;

  /** 예상 비용 */
  @Column({ name: 'estimated_cost', type: 'numeric', precision: 12, scale: 6, nullable: true })
  estimatedCost!: string | null;

  /** 통화 */
  @Column({ name: 'currency', type: 'varchar', length: 3, nullable: true })
  currency!: string | null;

  /** 재시도 횟수 */
  @Column({ name: 'retry_count', type: 'smallint', default: 0 })
  retryCount!: number;

  /** 오류 코드 */
  @Column({ name: 'error_code', type: 'varchar', length: 50, nullable: true })
  errorCode!: string | null;

  /** 서버 내부용 중복 방지 키 (API 필드 없음) */
  @Column({ name: 'idempotency_key', type: 'varchar', length: 100, nullable: true })
  idempotencyKey!: string | null;

  /** 한도 예약 시각 */
  @Column({ name: 'reserved_at', type: 'timestamptz', default: () => 'now()' })
  reservedAt!: Date;

  /** 완료 시각 */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
