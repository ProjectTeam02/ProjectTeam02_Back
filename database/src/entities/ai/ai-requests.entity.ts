// 자동 생성: leren_erd_v2.dbml 기준 (app.ai_requests)
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AiRequestStatus, AiRequestType, ModelTier } from '../common/enums';
import { AiConversation } from './ai-conversations.entity';
import { User } from '../account/users.entity';

@Index(['userId', 'usageDate', 'status'])
@Entity({ name: 'ai_requests', schema: 'app' })
export class AiRequest {
  @PrimaryGeneratedColumn('uuid', { name: 'request_id' })
  requestId!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  conversationId!: string | null;

  @ManyToOne(() => AiConversation, { nullable: true })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: AiConversation | null;

  @Column({ name: 'request_type', type: 'enum', enum: AiRequestType, enumName: 'ai_request_type' })
  requestType!: AiRequestType;

  @Column({ name: 'status', type: 'enum', enum: AiRequestStatus, enumName: 'ai_request_status', default: AiRequestStatus.Reserved })
  status!: AiRequestStatus;

  @Column({ name: 'usage_date', type: 'date', comment: 'reserved_at의 KST 날짜(생성 컬럼), 일일 한도 집계', generatedType: 'STORED', asExpression: `("reserved_at" AT TIME ZONE 'Asia/Seoul')::date` })
  usageDate!: string;

  @Column({ name: 'model_tier', type: 'enum', enum: ModelTier, enumName: 'model_tier' })
  modelTier!: ModelTier;

  @Column({ name: 'model_id', type: 'varchar', length: 100, nullable: true })
  modelId!: string | null;

  @Column({ name: 'embedding_model_id', type: 'varchar', length: 100, nullable: true })
  embeddingModelId!: string | null;

  @Column({ name: 'input_tokens', type: 'integer', nullable: true })
  inputTokens!: number | null;

  @Column({ name: 'output_tokens', type: 'integer', nullable: true })
  outputTokens!: number | null;

  @Column({ name: 'latency_ms', type: 'integer', nullable: true })
  latencyMs!: number | null;

  @Column({ name: 'cache_hit', type: 'boolean', nullable: true })
  cacheHit!: boolean | null;

  @Column({ name: 'retrieval_strategy', type: 'varchar', length: 50, nullable: true })
  retrievalStrategy!: string | null;

  @Column({ name: 'estimated_cost', type: 'numeric', precision: 12, scale: 6, nullable: true })
  estimatedCost!: string | null;

  @Column({ name: 'currency', type: 'varchar', length: 3, nullable: true })
  currency!: string | null;

  @Column({ name: 'retry_count', type: 'smallint', default: 0 })
  retryCount!: number;

  @Column({ name: 'error_code', type: 'varchar', length: 50, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100, unique: true, nullable: true })
  idempotencyKey!: string | null;

  @Column({ name: 'reserved_at', type: 'timestamptz', default: () => 'now()' })
  reservedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
