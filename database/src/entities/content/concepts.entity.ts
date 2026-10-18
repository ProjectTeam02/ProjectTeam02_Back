// 자동 생성: leren_erd_v2.dbml 기준 (app.concepts)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ConceptStatus } from '../common/enums';
import { Region } from './regions.entity';
import { User } from '../account/users.entity';

@Index(['conceptCode', 'version'], { unique: true })
@Entity({ name: 'concepts', schema: 'app' })
export class Concept {
  @PrimaryGeneratedColumn('uuid', { name: 'concept_id' })
  conceptId!: string;

  @Column({ name: 'concept_code', type: 'varchar', length: 30, comment: '버전 무관 식별자, ai.document_concepts와 공유' })
  conceptCode!: string;

  @Column({ name: 'region_id', type: 'uuid' })
  regionId!: string;

  @ManyToOne(() => Region, { nullable: false })
  @JoinColumn({ name: 'region_id' })
  region?: Region;

  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number;

  @Column({ name: 'supersedes_concept_id', type: 'uuid', nullable: true })
  supersedesConceptId!: string | null;

  @ManyToOne(() => Concept, { nullable: true })
  @JoinColumn({ name: 'supersedes_concept_id' })
  supersedesConcept?: Concept | null;

  @Column({ name: 'title', type: 'varchar', length: 100 })
  title!: string;

  @Column({ name: 'short_definition', type: 'varchar', length: 255, nullable: true })
  shortDefinition!: string | null;

  @Column({ name: 'summary', type: 'varchar', length: 255, nullable: true })
  summary!: string | null;

  @Column({ name: 'estimated_minutes', type: 'smallint', nullable: true })
  estimatedMinutes!: number | null;

  @Column({ name: 'source_document_ids', type: 'text', array: true, nullable: true, comment: '논리 참조: ai.knowledge_documents.document_id' })
  sourceDocumentIds!: string[] | null;

  @Column({ name: 'status', type: 'enum', enum: ConceptStatus, enumName: 'concept_status', default: ConceptStatus.Draft })
  status!: ConceptStatus;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer?: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
