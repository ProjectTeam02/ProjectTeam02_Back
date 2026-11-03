// rev.7: 사용자 장기 메모리 (app.ai_user_memories)
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { AiMemoryStatus, AiMemoryType } from '../common/enums';
import { User } from '../account/users.entity';
import { AiMessage } from './ai-messages.entity';

/**
 * 대화방을 넘어 유지되는 사용자 메모리 (선호 설명 방식, 오개념, 목표, 관심 분야).
 * AI 서버가 추출해 응답으로 돌려주고 Node가 저장, 다음 질문 때 ACTIVE 메모리를 요청에 담아 보낸다.
 * 회원 탈퇴 시 해당 사용자의 행을 모두 삭제 (개인정보).
 */
@Unique('ai_user_memories_user_id_memory_type_memory_key_key', ['userId', 'memoryType', 'memoryKey'])
@Index('ai_user_memories_user_id_status_updated_at_idx', ['userId', 'status', 'updatedAt'])
@Check('chk_ai_memories_content', `(char_length((content)::text) >= 1) AND (char_length((content)::text) <= 500)`)
@Check('chk_ai_memories_confidence', `confidence IS NULL OR (confidence >= 0 AND confidence <= 1)`)
@Check('chk_ai_memories_archived', `(status = 'ARCHIVED'::ai_memory_status) = (archived_at IS NOT NULL)`)
@Entity({ name: 'ai_user_memories', schema: 'app' })
export class AiUserMemory {
  /** 메모리 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'memory_id', primaryKeyConstraintName: 'ai_user_memories_pkey' })
  memoryId!: string;

  /** 메모리 주인 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'ai_user_memories_user_id_fkey' })
  user?: User;

  /** 종류 (PREFERENCE 설명 방식 선호 / MISCONCEPTION 오개념 / GOAL 학습 목표 / INTEREST 관심 분야) */
  @Column({ name: 'memory_type', type: 'enum', enum: AiMemoryType, enumName: 'ai_memory_type' })
  memoryType!: AiMemoryType;

  /** 같은 내용을 덮어쓰기(upsert) 위한 키 (예: 'answer_style', 개념 코드). null이면 중복 검사 안 함 */
  @Column({ name: 'memory_key', type: 'varchar', length: 100, nullable: true })
  memoryKey!: string | null;

  /** 메모리 내용 (한 문장, 500자 이하. 예: "예시를 들어 설명하면 잘 이해함") */
  @Column({ name: 'content', type: 'varchar', length: 500 })
  content!: string;

  /** 관련 개념 코드 (논리 참조: concepts.concept_code) */
  @Column({ name: 'concept_code', type: 'varchar', length: 30, nullable: true })
  conceptCode!: string | null;

  /** AI가 판단한 신뢰도 (0~1) */
  @Column({ name: 'confidence', type: 'numeric', precision: 3, scale: 2, nullable: true })
  confidence!: string | null;

  /** 메모리를 만든 근거 메시지 (사용자 질문) */
  @Column({ name: 'source_message_id', type: 'uuid', nullable: true })
  sourceMessageId!: string | null;

  /** 관계: source_message_id → ai_messages.message_id */
  @ManyToOne(() => AiMessage, { nullable: true })
  @JoinColumn({ name: 'source_message_id', foreignKeyConstraintName: 'ai_user_memories_source_message_id_fkey' })
  sourceMessage?: AiMessage | null;

  /** 상태 (ACTIVE 사용 중 / ARCHIVED 더 이상 안 씀) */
  @Column({ name: 'status', type: 'enum', enum: AiMemoryStatus, enumName: 'ai_memory_status', default: AiMemoryStatus.Active })
  status!: AiMemoryStatus;

  /** 보관(비활성) 처리 시각. status = ARCHIVED와 항상 같이 움직임 */
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  /** 마지막으로 요청에 담아 보낸 시각 (오래 안 쓴 메모리 정리용) */
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
