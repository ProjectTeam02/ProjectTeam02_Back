// 자동 생성: leren_erd_v2.dbml 기준 (app.learning_schedules)
import { Check, Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ScheduleStatus, ScheduleType } from '../common/enums';
import { Step } from '../content/steps.entity';
import { User } from '../account/users.entity';

@Index(['userId', 'targetDate'])
@Check('chk_schedules_goal_memo', `char_length("goal_memo") <= 30`)
@Entity({ name: 'learning_schedules', schema: 'app' })
export class LearningSchedule {
  @PrimaryGeneratedColumn('uuid', { name: 'schedule_id' })
  scheduleId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'target_date', type: 'date' })
  targetDate!: string;

  @Column({ name: 'step_id', type: 'uuid' })
  stepId!: string;

  @ManyToOne(() => Step, { nullable: false })
  @JoinColumn({ name: 'step_id' })
  step?: Step;

  @Column({ name: 'schedule_type', type: 'enum', enum: ScheduleType, enumName: 'schedule_type' })
  scheduleType!: ScheduleType;

  @Column({ name: 'goal_memo', type: 'varchar', length: 30, nullable: true, comment: '선택 입력, 30자 이내' })
  goalMemo!: string | null;

  @Column({ name: 'status', type: 'enum', enum: ScheduleStatus, enumName: 'schedule_status', default: ScheduleStatus.Planned })
  status!: ScheduleStatus;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true, comment: '소프트 삭제, 학습 기록과 무관' })
  deletedAt!: Date | null;
}
