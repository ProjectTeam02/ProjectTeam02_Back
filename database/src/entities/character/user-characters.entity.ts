// 자동 생성: leren_erd_v2.dbml 기준 (app.user_characters)
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Costume } from './costumes.entity';
import { Job } from './jobs.entity';
import { User } from '../account/users.entity';

@Entity({ name: 'user_characters', schema: 'app' })
export class UserCharacter {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'job_id', type: 'uuid' })
  jobId!: string;

  @ManyToOne(() => Job, { nullable: false })
  @JoinColumn({ name: 'job_id' })
  job?: Job;

  @Column({ name: 'equipped_costume_id', type: 'uuid', nullable: true, comment: '보유 코스튬만 허용(앱 검증)' })
  equippedCostumeId!: string | null;

  @ManyToOne(() => Costume, { nullable: true })
  @JoinColumn({ name: 'equipped_costume_id' })
  equippedCostume?: Costume | null;

  @Column({ name: 'first_selected_at', type: 'timestamptz', default: () => 'now()' })
  firstSelectedAt!: Date;

  @Column({ name: 'job_changed_at', type: 'timestamptz', nullable: true })
  jobChangedAt!: Date | null;

  @Column({ name: 'equipped_at', type: 'timestamptz', nullable: true })
  equippedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
