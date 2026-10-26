// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.user_growth)
import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../account/users.entity';

/** 현재 EXP·레벨 (users와 1:1). exp_ledger와 같은 트랜잭션에서만 갱신합니다. */
@Entity({ name: 'user_growth', schema: 'app' })
export class UserGrowth {
  /** 사용자 (1:1) */
  @PrimaryColumn({ name: 'user_id', type: 'uuid', primaryKeyConstraintName: 'user_growth_pkey' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'user_growth_user_id_fkey' })
  user?: User;

  /** 전체 누적 EXP */
  @Column({ name: 'total_exp', type: 'integer', default: 0 })
  totalExp!: number;

  /** 전체 레벨 */
  @Column({ name: 'total_level', type: 'integer', default: 1 })
  totalLevel!: number;

  /** 경제 누적 EXP */
  @Column({ name: 'economy_exp', type: 'integer', default: 0 })
  economyExp!: number;

  /** 경제 레벨 */
  @Column({ name: 'economy_level', type: 'integer', default: 1 })
  economyLevel!: number;

  /** 마지막 레벨업 시각 */
  @Column({ name: 'last_level_up_at', type: 'timestamptz', nullable: true })
  lastLevelUpAt!: Date | null;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
