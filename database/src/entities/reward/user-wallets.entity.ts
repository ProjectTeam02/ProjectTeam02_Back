// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.user_wallets)
import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../account/users.entity';

/** 현재 코인 잔액 (users와 1:1). coin_ledger와 같은 트랜잭션에서만 갱신합니다. */
@Check('chk_wallets_balance', `coin_balance >= 0`)
@Entity({ name: 'user_wallets', schema: 'app' })
export class UserWallet {
  /** 사용자 (1:1) */
  @PrimaryColumn({ name: 'user_id', type: 'uuid', primaryKeyConstraintName: 'user_wallets_pkey' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'user_wallets_user_id_fkey' })
  user?: User;

  /** 코인 잔액 */
  @Column({ name: 'coin_balance', type: 'integer', default: 0 })
  coinBalance!: number;

  /** 동시 구매 방지용 버전 (낙관적 잠금) */
  @Column({ name: 'version', type: 'integer', default: 0 })
  version!: number;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
