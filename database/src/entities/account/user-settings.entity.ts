// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.user_settings)
import { Check, Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from './users.entity';

/** 사용자 설정 (users와 1:1). */
@Check('chk_settings_daily_goal', `(daily_goal_count IS NULL) OR (daily_goal_count > 0)`)
@Entity({ name: 'user_settings', schema: 'app' })
export class UserSetting {
  /** 사용자 (1:1) */
  @PrimaryColumn({ name: 'user_id', type: 'uuid', primaryKeyConstraintName: 'user_settings_pkey' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'user_settings_user_id_fkey' })
  user?: User;

  /** 하루 목표 학습 수 (기본값 미정, null 허용) */
  @Column({ name: 'daily_goal_count', type: 'smallint', nullable: true })
  dailyGoalCount!: number | null;

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
