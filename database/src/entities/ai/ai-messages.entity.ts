// 자동 생성: leren_erd_v2.dbml 기준 (app.ai_messages)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { GroundingStatus, MessageInputType, MessageRole, MessageStatus } from '../common/enums';
import { AiConversation } from './ai-conversations.entity';
import { AiRequest } from './ai-requests.entity';

@Index(['conversationId', 'sequenceNo'], { unique: true })
@Entity({ name: 'ai_messages', schema: 'app' })
export class AiMessage {
  @PrimaryGeneratedColumn('uuid', { name: 'message_id' })
  messageId!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => AiConversation, { nullable: false })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: AiConversation;

  @Column({ name: 'parent_message_id', type: 'uuid', nullable: true, comment: '답변 → 질문' })
  parentMessageId!: string | null;

  @ManyToOne(() => AiMessage, { nullable: true })
  @JoinColumn({ name: 'parent_message_id' })
  parentMessage?: AiMessage | null;

  @Column({ name: 'sequence_no', type: 'integer' })
  sequenceNo!: number;

  @Column({ name: 'role', type: 'enum', enum: MessageRole, enumName: 'message_role' })
  role!: MessageRole;

  @Column({ name: 'input_type', type: 'enum', enum: MessageInputType, enumName: 'message_input_type', nullable: true })
  inputType!: MessageInputType | null;

  @Column({ name: 'content', type: 'text' })
  content!: string;

  @Column({ name: 'status', type: 'enum', enum: MessageStatus, enumName: 'message_status', default: MessageStatus.Pending })
  status!: MessageStatus;

  @Column({ name: 'grounding_status', type: 'enum', enum: GroundingStatus, enumName: 'grounding_status', nullable: true })
  groundingStatus!: GroundingStatus | null;

  @Column({ name: 'error_code', type: 'varchar', length: 50, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null;

  @ManyToOne(() => AiRequest, { nullable: true })
  @JoinColumn({ name: 'request_id' })
  request?: AiRequest | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
