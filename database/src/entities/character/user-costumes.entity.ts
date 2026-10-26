// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.user_costumes)
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { CostumeAcquireType } from '../common/enums';
import { CoinLedger } from '../reward/coin-ledger.entity';
import { Costume } from './costumes.entity';
import { User } from '../account/users.entity';

/** 보유 코스튬 (인벤토리). */
@Unique('user_costumes_coin_ledger_id_key', ['coinLedgerId'])
@Entity({ name: 'user_costumes', schema: 'app' })
export class UserCostume {
  /** 사용자 */
  @PrimaryColumn({ name: 'user_id', type: 'uuid', primaryKeyConstraintName: 'user_costumes_pkey' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'user_costumes_user_id_fkey' })
  user?: User;

  /** 보유 코스튬. API itemId */
  @PrimaryColumn({ name: 'item_id', type: 'uuid', primaryKeyConstraintName: 'user_costumes_pkey' })
  itemId!: string;

  /** 관계: item_id → costumes.item_id */
  @ManyToOne(() => Costume, { nullable: false })
  @JoinColumn({ name: 'item_id', foreignKeyConstraintName: 'user_costumes_item_id_fkey' })
  costume?: Costume;

  /** 획득 방식 (DEFAULT 기본 지급 / PURCHASE 구매) */
  @Column({ name: 'acquire_type', type: 'enum', enum: CostumeAcquireType, enumName: 'costume_acquire_type' })
  acquireType!: CostumeAcquireType;

  /** 구매 시 차감 원장 (= API 구매 ID) */
  @Column({ name: 'coin_ledger_id', type: 'uuid', nullable: true })
  coinLedgerId!: string | null;

  /** 관계: coin_ledger_id → coin_ledger.coin_ledger_id */
  @ManyToOne(() => CoinLedger, { nullable: true })
  @JoinColumn({ name: 'coin_ledger_id', foreignKeyConstraintName: 'user_costumes_coin_ledger_id_fkey' })
  coinLedger?: CoinLedger | null;

  /** 획득 시각 */
  @Column({ name: 'acquired_at', type: 'timestamptz', default: () => 'now()' })
  acquiredAt!: Date;
}
