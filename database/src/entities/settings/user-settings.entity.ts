// 자동 생성: leren_erd_v2.dbml 기준 (app.user_settings)
import { Check, Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../account/users.entity';

@Check('chk_settings_daily_goal', `"daily_goal_count" IS NULL OR "daily_goal_count" > 0`)
@Entity({ name: 'user_settings', schema: 'app' })
export class UserSetting {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'daily_goal_count', type: 'smallint', nullable: true, comment: '기본값 협의 전, null 허용' })
  dailyGoalCount!: number | null;

  @Column({ name: 'study_reminder_enabled', type: 'boolean', default: false })
  studyReminderEnabled!: boolean;

  @Column({ name: 'study_reminder_time', type: 'time', nullable: true })
  studyReminderTime!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
