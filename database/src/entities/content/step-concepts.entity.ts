// 자동 생성: leren_erd_v2.dbml 기준 (app.step_concepts)
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Concept } from './concepts.entity';
import { Step } from './steps.entity';

@Entity({ name: 'step_concepts', schema: 'app', comment: 'normal 단계는 1행만 허용(앱 검증), BOSS는 여러 개념' })
export class StepConcept {
  @PrimaryColumn({ name: 'step_id', type: 'uuid' })
  stepId!: string;

  @ManyToOne(() => Step, { nullable: false })
  @JoinColumn({ name: 'step_id' })
  step?: Step;

  @PrimaryColumn({ name: 'concept_id', type: 'uuid' })
  conceptId!: string;

  @ManyToOne(() => Concept, { nullable: false })
  @JoinColumn({ name: 'concept_id' })
  concept?: Concept;

  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder!: number;

  @Column({ name: 'is_primary', type: 'boolean', default: true })
  isPrimary!: boolean;
}
