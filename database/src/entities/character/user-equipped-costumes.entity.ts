// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.user_equipped_costumes)
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { CostumeCategory } from '../common/enums';
import { Costume } from './costumes.entity';
import { UserCostume } from './user-costumes.entity';

/** 부위별 장착 상태. 부위당 1행이고, 행이 없으면 미장착입니다. 다시 장착하면 같은 행을 교체합니다. */
@Entity({ name: 'user_equipped_costumes', schema: 'app' })
export class UserEquippedCostume {
  /** 사용자 */
  @PrimaryColumn({ name: 'user_id', type: 'uuid', primaryKeyConstraintName: 'user_equipped_costumes_pkey' })
  userId!: string;

  /** 장착 부위 (TOP / BOTTOM) */
  @PrimaryColumn({ name: 'category', type: 'enum', enum: CostumeCategory, enumName: 'costume_category', primaryKeyConstraintName: 'user_equipped_costumes_pkey' })
  category!: CostumeCategory;

  /** 장착한 코스튬. API itemId */
  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  /** 장착 시각 */
  @Column({ name: 'equipped_at', type: 'timestamptz', default: () => 'now()' })
  equippedAt!: Date;

  /** 관계(복합 FK fk_equipped_category): (item_id, category) → costumes(item_id, category) */
  @ManyToOne(() => Costume, { nullable: false })
  @JoinColumn([{ name: 'item_id', referencedColumnName: 'itemId', foreignKeyConstraintName: 'fk_equipped_category' }, { name: 'category', referencedColumnName: 'category' }])
  costume?: Costume;

  /** 관계(복합 FK fk_equipped_owned): (user_id, item_id) → user_costumes(user_id, item_id) */
  @ManyToOne(() => UserCostume, { nullable: false })
  @JoinColumn([{ name: 'user_id', referencedColumnName: 'userId', foreignKeyConstraintName: 'fk_equipped_owned' }, { name: 'item_id', referencedColumnName: 'itemId' }])
  ownedCostume?: UserCostume;
}
