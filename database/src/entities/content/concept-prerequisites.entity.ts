// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.concept_prerequisites)
import { Check, Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** 개념 선수관계. 개념이 새 버전이 되어도 유지되도록 concept_code로 연결합니다. */
@Check('chk_concept_prereq_not_self', `(concept_code)::text <> (prerequisite_concept_code)::text`)
@Entity({ name: 'concept_prerequisites', schema: 'app' })
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

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
