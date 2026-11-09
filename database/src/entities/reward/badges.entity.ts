// 자동 생성: leren_erd.dbml (rev.8) 기준 (app.badges)
import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/** 배지 마스터 (rev.8). 획득 조건은 미정이라 condition_type은 문자열로 두고, 확정되면 Enum으로 바꿉니다. */
@Unique('badges_badge_code_key', ['badgeCode'])
@Check('chk_badges_condition_value', `(condition_value IS NULL) OR (condition_value > 0)`)
@Entity({ name: 'badges', schema: 'app' })
export class Badge {
  /** 배지 ID. API badgeId */
  @PrimaryGeneratedColumn('uuid', { name: 'badge_id', primaryKeyConstraintName: 'badges_pkey' })
  badgeId!: string;

  /** 배지 코드 (고정 식별자, 예: FIRST_CLEAR) */
  @Column({ name: 'badge_code', type: 'varchar', length: 50 })
  badgeCode!: string;

  /** 이름 */
  @Column({ name: 'name', type: 'varchar', length: 50 })
  name!: string;

  /** 설명 (획득 방법 안내) */
  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  /** 아이콘 이미지 키 */
  @Column({ name: 'icon_key', type: 'varchar', length: 255, nullable: true })
  iconKey!: string | null;

  /** 획득 조건 종류 (미정. 예: STAGE_CLEAR_COUNT, BOSS_CLEAR, TOPIC_CLEAR) */
  @Column({ name: 'condition_type', type: 'varchar', length: 50, nullable: true })
  conditionType!: string | null;

  /** 획득 조건 값 (예: 10 = 10회) */
  @Column({ name: 'condition_value', type: 'integer', nullable: true })
  conditionValue!: number | null;

  /** 표시 순서 */
  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;

  /** 사용 여부 (false면 새로 지급하지 않음, 이미 받은 배지는 유지) */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
