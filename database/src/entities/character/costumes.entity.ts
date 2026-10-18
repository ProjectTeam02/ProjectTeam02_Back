// 자동 생성: leren_erd_v2.dbml 기준 (app.costumes)
import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Job } from './jobs.entity';

@Check('chk_costumes_price', `"price_coin" IS NULL OR "price_coin" >= 0`)
@Check('chk_costumes_on_sale_price', `NOT "is_on_sale" OR "price_coin" IS NOT NULL`)
@Entity({ name: 'costumes', schema: 'app' })
export class Costume {
  @PrimaryGeneratedColumn('uuid', { name: 'costume_id' })
  costumeId!: string;

  @Column({ name: 'costume_code', type: 'varchar', length: 50, unique: true })
  costumeCode!: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ name: 'flavor_text', type: 'varchar', length: 255, nullable: true })
  flavorText!: string | null;

  @Column({ name: 'job_id', type: 'uuid', nullable: true, comment: 'null = 공용' })
  jobId!: string | null;

  @ManyToOne(() => Job, { nullable: true })
  @JoinColumn({ name: 'job_id' })
  job?: Job | null;

  @Column({ name: 'price_coin', type: 'integer', nullable: true, comment: 'is_on_sale = true 이면 필수, >= 0' })
  priceCoin!: number | null;

  @Column({ name: 'image_key', type: 'varchar', length: 255, nullable: true })
  imageKey!: string | null;

  @Column({ name: 'thumbnail_key', type: 'varchar', length: 255, nullable: true })
  thumbnailKey!: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ name: 'is_on_sale', type: 'boolean', default: false })
  isOnSale!: boolean;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
