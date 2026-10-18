// 자동 생성: leren_erd_v2.dbml 기준 (app.user_costumes)
import { Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryColumn } from 'typeorm';
import { CostumeAcquireType } from '../common/enums';
import { CoinLedger } from '../reward/coin-ledger.entity';
import { Costume } from './costumes.entity';
import { User } from '../account/users.entity';

@Entity({ name: 'user_costumes', schema: 'app' })
export class UserCostume {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @PrimaryColumn({ name: 'costume_id', type: 'uuid' })
  costumeId!: string;

  @ManyToOne(() => Costume, { nullable: false })
  @JoinColumn({ name: 'costume_id' })
  costume?: Costume;

  @Column({ name: 'acquire_type', type: 'enum', enum: CostumeAcquireType, enumName: 'costume_acquire_type' })
  acquireType!: CostumeAcquireType;

  @Column({ name: 'coin_ledger_id', type: 'uuid', unique: true, nullable: true, comment: '구매 시 차감 원장' })
  coinLedgerId!: string | null;

  @OneToOne(() => CoinLedger, { nullable: true })
  @JoinColumn({ name: 'coin_ledger_id' })
  coinLedger?: CoinLedger | null;

  @Column({ name: 'acquired_at', type: 'timestamptz', default: () => 'now()' })
  acquiredAt!: Date;
}
