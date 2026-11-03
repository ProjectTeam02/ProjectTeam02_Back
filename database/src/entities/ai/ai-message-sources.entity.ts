// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.ai_message_sources)
// rev.6: AI 내부 API 계약 반영 — document_version 문자열·null 허용, chunk_id 필수, 같은 근거 중복 저장 방지
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AiMessage } from './ai-messages.entity';

/** 답변별 검색 근거 (API 검색 출처). AI 내부 API 응답 sources[]를 그대로 저장. */
@Unique('uq_ai_message_sources_message_document_chunk', ['messageId', 'documentId', 'chunkId'])
@Entity({ name: 'ai_message_sources', schema: 'app' })
export class AiMessageSource {
  /** 근거 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'message_source_id', primaryKeyConstraintName: 'ai_message_sources_pkey' })
  messageSourceId!: string;

  /** 근거를 쓴 답변 메시지 */
  @Column({ name: 'message_id', type: 'uuid' })
  messageId!: string;

  /** 관계: message_id → ai_messages.message_id */
  @ManyToOne(() => AiMessage, { nullable: false })
  @JoinColumn({ name: 'message_id', foreignKeyConstraintName: 'ai_message_sources_message_id_fkey' })
  message?: AiMessage;

  /** 문서 ID (논리 참조: ai 스키마 문서) */
  @Column({ name: 'document_id', type: 'varchar', length: 100 })
  documentId!: string;

  /** 문서 버전 (AI 응답 documentVersion, 예: '2026'. 없으면 null) */
  @Column({ name: 'document_version', type: 'varchar', length: 50, nullable: true })
  documentVersion!: string | null;

  /** 청크 ID (논리 참조: ai 스키마 청크, AI 응답 chunkId — 항상 있음) */
  @Column({ name: 'chunk_id', type: 'varchar', length: 100 })
  chunkId!: string;

  /** 당시 문서 제목 */
  @Column({ name: 'title_snapshot', type: 'varchar', length: 255, nullable: true })
  titleSnapshot!: string | null;

  /** 관련 개념 코드 (논리 참조) */
  @Column({ name: 'concept_code', type: 'varchar', length: 30, nullable: true })
  conceptCode!: string | null;

  /** 검색 순위 */
  @Column({ name: 'rank', type: 'smallint' })
  rank!: number;

  /** 유사도 점수 (0~1) */
  @Column({ name: 'relevance_score', type: 'numeric', precision: 5, scale: 4, nullable: true })
  relevanceScore!: string | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
