// 자동 생성: leren_erd.dbml (rev.5) 기준 (content.concept_prerequisites)
import { Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/** 개념 선수관계. 개념이 새 버전이 되어도 유지되도록 concept_code로 연결합니다. */
@Check('chk_concept_prereq_not_self', `(concept_code)::text <> (prerequisite_concept_code)::text`)
@Check('chk_concept_prereq_review_status', `review_status IN ('REVIEW_PENDING', 'APPROVED', 'REJECTED')`)
@Index('concept_prerequisites_review_status_idx', ['reviewStatus'])
@Entity({ name: 'concept_prerequisites', schema: 'content' })
export class ConceptPrerequisite {
  /** 개념 코드 (논리 참조) */
  @PrimaryColumn({ name: 'concept_code', type: 'varchar', length: 30, primaryKeyConstraintName: 'concept_prerequisites_pkey' })
  conceptCode!: string;

  /** 선수 개념 코드 (논리 참조) */
  @PrimaryColumn({ name: 'prerequisite_concept_code', type: 'varchar', length: 30, primaryKeyConstraintName: 'concept_prerequisites_pkey' })
  prerequisiteConceptCode!: string;

  /** 표시 순서 */
  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder!: number;

  /** 검수 상태. 기존 행은 자동 승인하지 않고 REVIEW_PENDING으로 시작합니다. */
  @Column({ name: 'review_status', type: 'varchar', length: 30, default: 'REVIEW_PENDING' })
  reviewStatus!: string;

  /** 검수자 */
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  /** 검수 시각 */
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
