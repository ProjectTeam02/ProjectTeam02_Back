// 자동 생성: leren_erd_v2.dbml 기준 (app.jobs)
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { JobCode } from '../common/enums';
import { Costume } from './costumes.entity';

@Entity({ name: 'jobs', schema: 'app' })
export class Job {
  @PrimaryGeneratedColumn('uuid', { name: 'job_id' })
  jobId!: string;

  @Column({ name: 'job_code', type: 'enum', enum: JobCode, enumName: 'job_code', unique: true })
  jobCode!: JobCode;

  @Column({ name: 'name', type: 'varchar', length: 30, comment: '검사 / 마법사 / 궁수' })
  name!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ name: 'image_key', type: 'varchar', length: 255, nullable: true })
  imageKey!: string | null;

  @Column({ name: 'preview_image_key', type: 'varchar', length: 255, nullable: true })
  previewImageKey!: string | null;

  @Column({ name: 'battle_effect_key', type: 'varchar', length: 255, nullable: true })
  battleEffectKey!: string | null;

  @Column({ name: 'default_costume_id', type: 'uuid', nullable: true })
  defaultCostumeId!: string | null;

  @ManyToOne(() => Costume, { nullable: true })
  @JoinColumn({ name: 'default_costume_id' })
  defaultCostume?: Costume | null;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
