// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.costumes)
import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CostumeCategory } from '../common/enums';

/** 코스튬 상품. 직업과 무관하게 부위(TOP 상의 / BOTTOM 하의)로 나눕니다. */
@Unique('costumes_costume_code_key', ['costumeCode'])
@Index('costumes_category_sort_order_idx', ['category', 'sortOrder'])
@Index('costumes_item_id_category_idx', ['itemId', 'category'], { unique: true })
@Check('chk_costumes_on_sale_price', `(NOT is_on_sale) OR (price_coin IS NOT NULL)`)
@Check('chk_costumes_price', `(price_coin IS NULL) OR (price_coin >= 0)`)
@Entity({ name: 'costumes', schema: 'app' })
export class Costume {
  /** 코스튬 ID. API itemId */
  @PrimaryGeneratedColumn('uuid', { name: 'item_id', primaryKeyConstraintName: 'costumes_pkey' })
  itemId!: string;

  /** 코스튬 코드 */
  @Column({ name: 'costume_code', type: 'varchar', length: 50 })
  costumeCode!: string;

  /** 이름 */
  @Column({ name: 'name', type: 'varchar', length: 100 })
  name!: string;

  /** 설명 */
  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  /** 소개 문구 */
  @Column({ name: 'flavor_text', type: 'varchar', length: 255, nullable: true })
  flavorText!: string | null;

  /** 부위 (TOP 상의 / BOTTOM 하의). API category */
  @Column({ name: 'category', type: 'enum', enum: CostumeCategory, enumName: 'costume_category' })
  category!: CostumeCategory;

  /** 가격(코인). 판매 중이면 필수, 0 이상 */
  @Column({ name: 'price_coin', type: 'integer', nullable: true })
  priceCoin!: number | null;

  /** 이미지 파일 키 */
  @Column({ name: 'image_key', type: 'varchar', length: 255, nullable: true })
  imageKey!: string | null;

  /** 썸네일 키 */
  @Column({ name: 'thumbnail_key', type: 'varchar', length: 255, nullable: true })
  thumbnailKey!: string | null;

  /** 가입 시 기본 지급 여부 (부위별 1개씩) */
  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  /** 판매 여부 */
  @Column({ name: 'is_on_sale', type: 'boolean', default: false })
  isOnSale!: boolean;

  /** 정렬 순서 */
  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
