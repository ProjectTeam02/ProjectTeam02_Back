// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.concept_sections)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CardTone, SectionType } from '../common/enums';
import { Concept } from './concepts.entity';

/** 개념 학습 카드. */
@Index('concept_sections_concept_id_page_no_sort_order_idx', ['conceptId', 'pageNo', 'sortOrder'], { unique: true })
@Entity({ name: 'concept_sections', schema: 'app' })
export class ConceptSection {
  /** 학습 카드 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'section_id', primaryKeyConstraintName: 'concept_sections_pkey' })
  sectionId!: string;

  /** 소속 개념 */
  @Column({ name: 'concept_id', type: 'uuid' })
  conceptId!: string;

  /** 관계: concept_id → concepts.concept_id */
  @ManyToOne(() => Concept, { nullable: false })
  @JoinColumn({ name: 'concept_id', foreignKeyConstraintName: 'concept_sections_concept_id_fkey' })
  concept?: Concept;

  /** 페이지 번호 (학습 위치 content_position과 같은 번호) */
  @Column({ name: 'page_no', type: 'smallint' })
  pageNo!: number;

  /** 페이지 안 정렬 순서 */
  @Column({ name: 'sort_order', type: 'smallint' })
  sortOrder!: number;

  /** 카드 종류 (INTRO / DEFINITION / EXAMPLE / SUMMARY / REMEMBER / QUIZ_GUIDE) */
  @Column({ name: 'section_type', type: 'enum', enum: SectionType, enumName: 'section_type' })
  sectionType!: SectionType;

  /** 제목 */
  @Column({ name: 'title', type: 'varchar', length: 100, nullable: true })
  title!: string | null;

  /** 본문 */
  @Column({ name: 'body', type: 'text' })
  body!: string;

  /** 카드 색조 (DEFAULT / INFO / EXAMPLE / SUCCESS) */
  @Column({ name: 'card_tone', type: 'enum', enum: CardTone, enumName: 'card_tone', default: CardTone.Default })
  cardTone!: CardTone;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
