// 자동 생성: leren_erd_v2.dbml 기준 (app.user_wallets)
import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../account/users.entity';

@Check('chk_wallets_balance', `"coin_balance" >= 0`)
@Entity({ name: 'user_wallets', schema: 'app', comment: 'coin_ledger와 같은 트랜잭션에서만 갱신' })
export class UserWallet {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'coin_balance', type: 'integer', default: 0, comment: 'check(coin_balance >= 0)' })
  coinBalance!: number;

  @Column({ name: 'version', type: 'integer', default: 0, comment: '동시 구매 방지(낙관적 잠금)' })
  version!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
