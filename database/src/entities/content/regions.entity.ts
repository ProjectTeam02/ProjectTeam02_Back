// 자동 생성: leren_erd_v2.dbml 기준 (app.regions)
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PublishStatus } from '../common/enums';

@Entity({ name: 'regions', schema: 'app' })
export class Region {
  @PrimaryGeneratedColumn('uuid', { name: 'region_id' })
  regionId!: string;

  @Column({ name: 'region_code', type: 'varchar', length: 30, unique: true })
  regionCode!: string;

  @Column({ name: 'region_no', type: 'smallint', unique: true, comment: '1~9, 화면의 STAGE n' })
  regionNo!: number;

  @Column({ name: 'title', type: 'varchar', length: 100 })
  title!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ name: 'map_row', type: 'smallint', nullable: true })
  mapRow!: number | null;

  @Column({ name: 'map_column', type: 'smallint', nullable: true })
  mapColumn!: number | null;

  @Column({ name: 'icon_key', type: 'varchar', length: 255, nullable: true })
  iconKey!: string | null;

  @Column({ name: 'status', type: 'enum', enum: PublishStatus, enumName: 'regions_status', default: PublishStatus.Draft })
  status!: PublishStatus;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
