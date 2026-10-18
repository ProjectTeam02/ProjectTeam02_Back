// 자동 생성: leren_erd_v2.dbml 기준 (app.level_thresholds)
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { LevelScope } from '../common/enums';

@Entity({ name: 'level_thresholds', schema: 'app' })
export class LevelThreshold {
  @PrimaryColumn({ name: 'scope', type: 'enum', enum: LevelScope, enumName: 'level_scope' })
  scope!: LevelScope;

  @PrimaryColumn({ name: 'level', type: 'integer' })
  level!: number;

  @Column({ name: 'required_exp', type: 'integer', comment: '누적 EXP 기준' })
  requiredExp!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
