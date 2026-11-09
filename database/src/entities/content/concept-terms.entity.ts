// 자동 생성: leren_erd.dbml (rev.8) 기준 (app.concept_terms)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { GlossaryTerm } from './glossary-terms.entity';

/** 개념–용어 연결 (rev.8). 개념이 새 버전이 되어도 유지되도록 concept_code로 연결합니다. 클리어 화면 "학습 키워드 N개" = 던전 개념에 연결된 용어 수 */
@Index('concept_terms_term_id_idx', ['termId'])
@Entity({ name: 'concept_terms', schema: 'app' })
export class ConceptTerm {
  /** 개념 코드 (논리 참조: concepts.concept_code) */
  @PrimaryColumn({ name: 'concept_code', type: 'varchar', length: 30, primaryKeyConstraintName: 'concept_terms_pkey' })
  conceptCode!: string;

  /** 용어 */
  @PrimaryColumn({ name: 'term_id', type: 'uuid', primaryKeyConstraintName: 'concept_terms_pkey' })
  termId!: string;

  /** 관계: term_id → glossary_terms.term_id */
  @ManyToOne(() => GlossaryTerm, { nullable: false })
  @JoinColumn({ name: 'term_id', foreignKeyConstraintName: 'concept_terms_term_id_fkey' })
  glossaryTerm?: GlossaryTerm;

  /** 개념 안 표시 순서 */
  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder!: number;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
