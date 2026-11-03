// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.stage_concepts)
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Concept } from './concepts.entity';
import { Stage } from './stages.entity';

/** Stage–개념 연결. NORMAL Stage는 1개(앱 검증), BOSS는 여러 개념입니다. */
@Entity({ name: 'stage_concepts', schema: 'app' })
export class StageConcept {
  /** Stage */
  @PrimaryColumn({ name: 'stage_id', type: 'uuid', primaryKeyConstraintName: 'stage_concepts_pkey' })
  stageId!: string;

  /** 관계: stage_id → stages.stage_id */
  @ManyToOne(() => Stage, { nullable: false })
  @JoinColumn({ name: 'stage_id', foreignKeyConstraintName: 'stage_concepts_stage_id_fkey' })
  stage?: Stage;

  /** 개념 */
  @PrimaryColumn({ name: 'concept_id', type: 'uuid', primaryKeyConstraintName: 'stage_concepts_pkey' })
  conceptId!: string;

  /** 관계: concept_id → concepts.concept_id */
  @ManyToOne(() => Concept, { nullable: false })
  @JoinColumn({ name: 'concept_id', foreignKeyConstraintName: 'stage_concepts_concept_id_fkey' })
  concept?: Concept;

  /** 표시 순서 */
  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder!: number;

  /** 대표 개념 여부 */
  @Column({ name: 'is_primary', type: 'boolean', default: true })
  isPrimary!: boolean;
}
