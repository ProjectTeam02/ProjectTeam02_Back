// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.level_thresholds)
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { LevelScope } from '../common/enums';

/** 레벨별 필요 누적 EXP. */
@Entity({ name: 'level_thresholds', schema: 'app' })
export class LevelThreshold {
  /** 레벨 종류 (ACCOUNT 전체 / ECONOMY 경제) */
  @PrimaryColumn({ name: 'scope', type: 'enum', enum: LevelScope, enumName: 'level_scope', primaryKeyConstraintName: 'level_thresholds_pkey' })
  scope!: LevelScope;

  /** 레벨 */
  @PrimaryColumn({ name: 'level', type: 'integer', primaryKeyConstraintName: 'level_thresholds_pkey' })
  level!: number;

  /** 해당 레벨에 필요한 누적 EXP */
  @Column({ name: 'required_exp', type: 'integer' })
  requiredExp!: number;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
