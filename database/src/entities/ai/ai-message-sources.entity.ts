// 자동 생성: leren_erd_v2.dbml 기준 (app.ai_message_sources)
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AiMessage } from './ai-messages.entity';

@Entity({ name: 'ai_message_sources', schema: 'app' })
export class AiMessageSource {
  @PrimaryGeneratedColumn('uuid', { name: 'message_source_id' })
  messageSourceId!: string;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId!: string;

  @ManyToOne(() => AiMessage, { nullable: false })
  @JoinColumn({ name: 'message_id' })
  message?: AiMessage;

  @Column({ name: 'document_id', type: 'varchar', length: 100, comment: '논리 참조: ai.knowledge_documents.document_id' })
  documentId!: string;

  @Column({ name: 'document_version', type: 'integer' })
  documentVersion!: number;

  @Column({ name: 'title_snapshot', type: 'varchar', length: 255, nullable: true })
  titleSnapshot!: string | null;

  @Column({ name: 'concept_code', type: 'varchar', length: 30, nullable: true, comment: '논리 참조: concepts.concept_code' })
  conceptCode!: string | null;

  @Column({ name: 'rank', type: 'smallint' })
  rank!: number;

  @Column({ name: 'relevance_score', type: 'numeric', precision: 5, scale: 4, nullable: true })
  relevanceScore!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
