// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.concepts)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ConceptStatus } from '../common/enums';
import { Topic } from './topics.entity';
import { User } from '../account/users.entity';

/** 경제 개념 (버전 관리). */
@Index('concepts_concept_code_version_idx', ['conceptCode', 'version'], { unique: true })
@Entity({ name: 'concepts', schema: 'app' })
export class Concept {
  /** 개념 ID (버전별). API conceptId */
  @PrimaryGeneratedColumn('uuid', { name: 'concept_id', primaryKeyConstraintName: 'concepts_pkey' })
  conceptId!: string;

  /** 개념 코드 (버전 무관 식별자, ai 스키마와 공유) */
  @Column({ name: 'concept_code', type: 'varchar', length: 30 })
  conceptCode!: string;

  /** 소속 주제 */
  @Column({ name: 'topic_id', type: 'uuid' })
  topicId!: string;

  /** 관계: topic_id → topics.topic_id */
  @ManyToOne(() => Topic, { nullable: false })
  @JoinColumn({ name: 'topic_id', foreignKeyConstraintName: 'concepts_topic_id_fkey' })
  topic?: Topic;

  /** 버전 */
  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number;

  /** 이전 버전 개념 */
  @Column({ name: 'supersedes_concept_id', type: 'uuid', nullable: true })
  supersedesConceptId!: string | null;

  /** 관계: supersedes_concept_id → concepts.concept_id */
  @ManyToOne(() => Concept, { nullable: true })
  @JoinColumn({ name: 'supersedes_concept_id', foreignKeyConstraintName: 'concepts_supersedes_concept_id_fkey' })
  supersedesConcept?: Concept | null;

  /** 개념 이름 */
  @Column({ name: 'title', type: 'varchar', length: 100 })
  title!: string;

  /** 한 줄 정의 */
  @Column({ name: 'short_definition', type: 'varchar', length: 255, nullable: true })
  shortDefinition!: string | null;

  /** 요약 */
  @Column({ name: 'summary', type: 'varchar', length: 255, nullable: true })
  summary!: string | null;

  /** 예상 학습 시간(분) */
  @Column({ name: 'estimated_minutes', type: 'smallint', nullable: true })
  estimatedMinutes!: number | null;

  /** 근거 문서 ID 목록 (논리 참조: ai 스키마) */
  @Column({ name: 'source_document_ids', type: 'text', array: true, nullable: true })
  sourceDocumentIds!: string[] | null;

  /** 검수·공개 상태 (DRAFT / REVIEW_PENDING / PUBLISHED / ARCHIVED) */
  @Column({ name: 'status', type: 'enum', enum: ConceptStatus, enumName: 'concept_status', default: ConceptStatus.Draft })
  status!: ConceptStatus;

  /** 검수자 */
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  /** 관계: reviewed_by → users.user_id */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by', foreignKeyConstraintName: 'concepts_reviewed_by_fkey' })
  reviewer?: User | null;

  /** 검수 시각 */
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  /** 공개 시각 */
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
