// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.study_plans)
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PlanStatus, PlanType } from '../common/enums';
import { Concept } from '../content/concepts.entity';
import { Stage } from '../content/stages.entity';
import { User } from '../account/users.entity';

/** 학습 일정 (소프트 삭제). */
@Index('study_plans_user_id_scheduled_date_idx', ['userId', 'scheduledDate'])
@Check('chk_study_plans_title', `(char_length((title)::text) >= 1) AND (char_length((title)::text) <= 30)`)
@Entity({ name: 'study_plans', schema: 'app' })
export class StudyPlan {
  /** 일정 ID. API planId */
  @PrimaryGeneratedColumn('uuid', { name: 'plan_id', primaryKeyConstraintName: 'study_plans_pkey' })
  planId!: string;

  /** 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'study_plans_user_id_fkey' })
  user?: User;

  /** 예정 날짜. API scheduledDate */
  @Column({ name: 'scheduled_date', type: 'date' })
  scheduledDate!: string;

  /** 학습할 Stage (선택). API stageId */
  @Column({ name: 'stage_id', type: 'uuid', nullable: true })
  stageId!: string | null;

  /** 관계: stage_id → stages.stage_id */
  @ManyToOne(() => Stage, { nullable: true })
  @JoinColumn({ name: 'stage_id', foreignKeyConstraintName: 'study_plans_stage_id_fkey' })
  stage?: Stage | null;

  /** 학습할 개념 (선택). API conceptId */
  @Column({ name: 'concept_id', type: 'uuid', nullable: true })
  conceptId!: string | null;

  /** 관계: concept_id → concepts.concept_id */
  @ManyToOne(() => Concept, { nullable: true })
  @JoinColumn({ name: 'concept_id', foreignKeyConstraintName: 'study_plans_concept_id_fkey' })
  concept?: Concept | null;

  /** 일정 종류 (NEW_LEARNING / REVIEW) */
  @Column({ name: 'plan_type', type: 'enum', enum: PlanType, enumName: 'plan_type', default: PlanType.NewLearning })
  planType!: PlanType;

  /** 일정 제목. API title (1~30자) */
  @Column({ name: 'title', type: 'varchar', length: 30 })
  title!: string;

  /** 일정 상태 (PLANNED / DONE) */
  @Column({ name: 'status', type: 'enum', enum: PlanStatus, enumName: 'plan_status', default: PlanStatus.Planned })
  status!: PlanStatus;

  /** 완료 시각 */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** 삭제 시각 (소프트 삭제, 실제 학습 기록은 보존) */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
