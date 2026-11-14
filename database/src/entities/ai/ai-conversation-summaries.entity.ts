// rev.7: 멀티턴 대화 요약 이력 (tutor.ai_conversation_summaries)
import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AiConversation } from './ai-conversations.entity';
import { AiRequest } from './ai-requests.entity';

/**
 * 대화 요약 이력. 요약을 새로 만들 때마다 1행 추가 (기존 행은 수정하지 않음).
 * 1 ~ summary_until_seq 메시지를 누적(rolling) 요약한 결과이고,
 * 현재 요약은 ai_conversations.summary·summary_until_seq에 같은 트랜잭션에서 복사한다.
 */
@Unique('ai_conversation_summaries_conversation_id_summary_until_seq_key', ['conversationId', 'summaryUntilSeq'])
@Check('chk_ai_summaries_until_seq', `summary_until_seq >= 1`)
@Check('chk_ai_summaries_content', `(char_length(content) >= 1) AND (char_length(content) <= 12000)`)
@Entity({ name: 'ai_conversation_summaries', schema: 'tutor' })
export class AiConversationSummary {
  /** 요약 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'summary_id', primaryKeyConstraintName: 'ai_conversation_summaries_pkey' })
  summaryId!: string;

  /** 소속 대화 */
  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  /** 관계: conversation_id → ai_conversations.conversation_id */
  @ManyToOne(() => AiConversation, { nullable: false })
  @JoinColumn({ name: 'conversation_id', foreignKeyConstraintName: 'ai_conversation_summaries_conversation_id_fkey' })
  conversation?: AiConversation;

  /** 이 요약이 반영한 마지막 메시지 sequence_no (1부터 여기까지 요약) */
  @Column({ name: 'summary_until_seq', type: 'integer' })
  summaryUntilSeq!: number;

  /** 요약 본문 (내부 API summary, 12,000자 이하) */
  @Column({ name: 'content', type: 'text' })
  content!: string;

  /** 요약 토큰 수 (프롬프트 예산 계산용) */
  @Column({ name: 'token_count', type: 'integer', nullable: true })
  tokenCount!: number | null;

  /** 요약을 만든 AI 호출 (SUMMARIZE 요청, 또는 요약을 함께 돌려준 TUTOR 요청) */
  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null;

  /** 관계: request_id → ai_requests.request_id */
  @ManyToOne(() => AiRequest, { nullable: true })
  @JoinColumn({ name: 'request_id', foreignKeyConstraintName: 'ai_conversation_summaries_request_id_fkey' })
  request?: AiRequest | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
