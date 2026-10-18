// 자동 생성: leren_erd_v2.dbml 기준 (app.ai_conversations)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AiEntryPoint, ConversationStatus } from '../common/enums';
import { Concept } from '../content/concepts.entity';
import { LearningAttempt } from '../quiz/learning-attempts.entity';
import { Question } from '../content/questions.entity';
import { Region } from '../content/regions.entity';
import { Step } from '../content/steps.entity';
import { User } from '../account/users.entity';

@Index(['userId', 'updatedAt'])
@Entity({ name: 'ai_conversations', schema: 'app' })
export class AiConversation {
  @PrimaryGeneratedColumn('uuid', { name: 'conversation_id' })
  conversationId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'entry_point', type: 'enum', enum: AiEntryPoint, enumName: 'ai_entry_point' })
  entryPoint!: AiEntryPoint;

  @Column({ name: 'context_region_id', type: 'uuid', nullable: true })
  contextRegionId!: string | null;

  @ManyToOne(() => Region, { nullable: true })
  @JoinColumn({ name: 'context_region_id' })
  contextRegion?: Region | null;

  @Column({ name: 'context_step_id', type: 'uuid', nullable: true })
  contextStepId!: string | null;

  @ManyToOne(() => Step, { nullable: true })
  @JoinColumn({ name: 'context_step_id' })
  contextStep?: Step | null;

  @Column({ name: 'context_concept_id', type: 'uuid', nullable: true })
  contextConceptId!: string | null;

  @ManyToOne(() => Concept, { nullable: true })
  @JoinColumn({ name: 'context_concept_id' })
  contextConcept?: Concept | null;

  @Column({ name: 'context_question_id', type: 'uuid', nullable: true })
  contextQuestionId!: string | null;

  @ManyToOne(() => Question, { nullable: true })
  @JoinColumn({ name: 'context_question_id' })
  contextQuestion?: Question | null;

  @Column({ name: 'context_attempt_id', type: 'uuid', nullable: true })
  contextAttemptId!: string | null;

  @ManyToOne(() => LearningAttempt, { nullable: true })
  @JoinColumn({ name: 'context_attempt_id' })
  contextAttempt?: LearningAttempt | null;

  @Column({ name: 'title', type: 'varchar', length: 100, nullable: true })
  title!: string | null;

  @Column({ name: 'status', type: 'enum', enum: ConversationStatus, enumName: 'conversation_status', default: ConversationStatus.Active })
  status!: ConversationStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', comment: '목록 정렬 기준' })
  updatedAt!: Date;
}
