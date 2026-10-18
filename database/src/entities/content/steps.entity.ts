// 자동 생성: leren_erd_v2.dbml 기준 (app.steps)
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PublishStatus, StepType } from '../common/enums';
import { Region } from './regions.entity';

@Index(['regionId', 'stepNo'], { unique: true })
@Check('chk_steps_counts', `"required_correct_count" <= "max_question_count" AND "initial_monster_hp" = "required_correct_count"`)
@Check('chk_steps_minutes', `"estimated_min_minutes" IS NULL OR "estimated_max_minutes" IS NULL OR "estimated_min_minutes" <= "estimated_max_minutes"`)
@Entity({ name: 'steps', schema: 'app' })
export class Step {
  @PrimaryGeneratedColumn('uuid', { name: 'step_id' })
  stepId!: string;

  @Column({ name: 'region_id', type: 'uuid' })
  regionId!: string;

  @ManyToOne(() => Region, { nullable: false })
  @JoinColumn({ name: 'region_id' })
  region?: Region;

  @Column({ name: 'step_code', type: 'varchar', length: 20, unique: true, comment: '1-1 / 1-2 / 1-BOSS' })
  stepCode!: string;

  @Column({ name: 'step_no', type: 'smallint', comment: '지역 내 순차 해금 순서, BOSS는 마지막' })
  stepNo!: number;

  @Column({ name: 'step_type', type: 'enum', enum: StepType, enumName: 'step_type' })
  stepType!: StepType;

  @Column({ name: 'title', type: 'varchar', length: 100 })
  title!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ name: 'estimated_min_minutes', type: 'smallint', nullable: true })
  estimatedMinMinutes!: number | null;

  @Column({ name: 'estimated_max_minutes', type: 'smallint', nullable: true })
  estimatedMaxMinutes!: number | null;

  @Column({ name: 'max_question_count', type: 'smallint', comment: 'normal 3 / boss 5' })
  maxQuestionCount!: number;

  @Column({ name: 'required_correct_count', type: 'smallint', comment: 'normal 2 / boss 4' })
  requiredCorrectCount!: number;

  @Column({ name: 'initial_monster_hp', type: 'smallint', comment: 'normal 2 / boss 4' })
  initialMonsterHp!: number;

  @Column({ name: 'monster_name', type: 'varchar', length: 50, nullable: true })
  monsterName!: string | null;

  @Column({ name: 'monster_image_key', type: 'varchar', length: 255, nullable: true })
  monsterImageKey!: string | null;

  @Column({ name: 'reward_total_exp', type: 'integer', nullable: true, comment: '미확정, null 허용' })
  rewardTotalExp!: number | null;

  @Column({ name: 'reward_economy_exp', type: 'integer', nullable: true, comment: '미확정, null 허용' })
  rewardEconomyExp!: number | null;

  @Column({ name: 'reward_coin', type: 'integer', nullable: true, comment: '미확정, null 허용' })
  rewardCoin!: number | null;

  @Column({ name: 'status', type: 'enum', enum: PublishStatus, enumName: 'steps_status', default: PublishStatus.Draft })
  status!: PublishStatus;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
