// 자동 생성: leren_erd_v2.dbml 기준 (app.user_growth)
import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../account/users.entity';

@Entity({ name: 'user_growth', schema: 'app', comment: 'exp_ledger와 같은 트랜잭션에서만 갱신' })
export class UserGrowth {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'total_exp', type: 'integer', default: 0 })
  totalExp!: number;

  @Column({ name: 'total_level', type: 'integer', default: 1 })
  totalLevel!: number;

  @Column({ name: 'economy_exp', type: 'integer', default: 0 })
  economyExp!: number;

  @Column({ name: 'economy_level', type: 'integer', default: 1 })
  economyLevel!: number;

  @Column({ name: 'last_level_up_at', type: 'timestamptz', nullable: true })
  lastLevelUpAt!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
