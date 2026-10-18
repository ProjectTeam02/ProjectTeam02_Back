// 자동 생성: leren_erd_v2.dbml 기준 (app.concept_sections)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CardTone, SectionType } from '../common/enums';
import { Concept } from './concepts.entity';

@Index(['conceptId', 'pageNo', 'sortOrder'], { unique: true })
@Entity({ name: 'concept_sections', schema: 'app' })
export class ConceptSection {
  @PrimaryGeneratedColumn('uuid', { name: 'section_id' })
  sectionId!: string;

  @Column({ name: 'concept_id', type: 'uuid' })
  conceptId!: string;

  @ManyToOne(() => Concept, { nullable: false })
  @JoinColumn({ name: 'concept_id' })
  concept?: Concept;

  @Column({ name: 'page_no', type: 'smallint' })
  pageNo!: number;

  @Column({ name: 'sort_order', type: 'smallint' })
  sortOrder!: number;

  @Column({ name: 'section_type', type: 'enum', enum: SectionType, enumName: 'section_type' })
  sectionType!: SectionType;

  @Column({ name: 'title', type: 'varchar', length: 100, nullable: true })
  title!: string | null;

  @Column({ name: 'body', type: 'text' })
  body!: string;

  @Column({ name: 'card_tone', type: 'enum', enum: CardTone, enumName: 'card_tone', default: CardTone.Default })
  cardTone!: CardTone;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
