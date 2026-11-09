// 자동 생성: leren_erd.dbml (rev.8) 기준 (app.user_badges)
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Badge } from './badges.entity';
import { User } from '../account/users.entity';

/** 사용자 배지 획득 기록 (rev.8). (user_id, badge_id) PK로 같은 배지는 한 번만 지급됩니다. */
@Index('user_badges_user_id_earned_at_idx', ['userId', 'earnedAt'])
@Entity({ name: 'user_badges', schema: 'app' })
export class UserBadge {
  /** 사용자 */
  @PrimaryColumn({ name: 'user_id', type: 'uuid', primaryKeyConstraintName: 'user_badges_pkey' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'user_badges_user_id_fkey' })
  user?: User;

  /** 배지 */
  @PrimaryColumn({ name: 'badge_id', type: 'uuid', primaryKeyConstraintName: 'user_badges_pkey' })
  badgeId!: string;

  /** 관계: badge_id → badges.badge_id */
  @ManyToOne(() => Badge, { nullable: false })
  @JoinColumn({ name: 'badge_id', foreignKeyConstraintName: 'user_badges_badge_id_fkey' })
  badge?: Badge;

  /** 획득 시각 */
  @Column({ name: 'earned_at', type: 'timestamptz', default: () => 'now()' })
  earnedAt!: Date;
}
