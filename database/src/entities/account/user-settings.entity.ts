// 자동 생성: leren_erd.dbml (rev.8) 기준 (app.user_settings)
import { Check, Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { GoalPeriod } from '../common/enums';
import { User } from './users.entity';

/** 사용자 설정 (users와 1:1). */
@Check('chk_settings_goal_count', `(goal_count IS NULL) OR (goal_count > 0)`)
@Entity({ name: 'user_settings', schema: 'app' })
export class UserSetting {
  /** 사용자 (1:1) */
  @PrimaryColumn({ name: 'user_id', type: 'uuid', primaryKeyConstraintName: 'user_settings_pkey' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'user_settings_user_id_fkey' })
  user?: User;

  /** 목표 학습 수 (rev.8 daily_goal_count → goal_count). 사용자가 직접 설정, null = 미설정 → 목표 달성률 표시 안 함 */
  @Column({ name: 'goal_count', type: 'smallint', nullable: true })
  goalCount!: number | null;

  /** 목표 기간 (rev.8, 현재 WEEKLY만). 주 시작은 월요일 00:00 (timezone 기준) */
  @Column({ name: 'goal_period', type: 'enum', enum: GoalPeriod, enumName: 'goal_period', default: GoalPeriod.Weekly })
  goalPeriod!: GoalPeriod;

  /** 학습 알림 사용 여부. API reminderEnabled */
  @Column({ name: 'reminder_enabled', type: 'boolean', default: false })
  reminderEnabled!: boolean;

  /** 알림 시각. API reminderTime */
  @Column({ name: 'reminder_time', type: 'time', nullable: true })
  reminderTime!: string | null;

  /** 시간대 (IANA 이름). API timezone */
  @Column({ name: 'timezone', type: 'varchar', length: 50, default: 'Asia/Seoul' })
  timezone!: string;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
