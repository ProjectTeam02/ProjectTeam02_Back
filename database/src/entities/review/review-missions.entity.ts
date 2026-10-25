// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.review_missions)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ReviewMissionStatus } from '../common/enums';
import { User } from '../account/users.entity';

/** 잔당 소탕 임무 (사용자·개념별 1회, 첫 등록 3일 뒤). */
@Index('review_missions_status_due_date_idx', ['status', 'dueDate'])
@Index('review_missions_user_id_concept_code_idx', ['userId', 'conceptCode'], { unique: true })
@Entity({ name: 'review_missions', schema: 'app' })
export class ReviewMission {
  /** 임무 ID. API missionId */
  @PrimaryGeneratedColumn('uuid', { name: 'mission_id', primaryKeyConstraintName: 'review_missions_pkey' })
  missionId!: string;

  /** 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'review_missions_user_id_fkey' })
  user?: User;

  /** 대상 개념 코드 (논리 참조) */
  @Column({ name: 'concept_code', type: 'varchar', length: 30 })
  conceptCode!: string;

  /** 개념 최초 오답 등록 시각 */
  @Column({ name: 'first_registered_at', type: 'timestamptz' })
  firstRegisteredAt!: Date;

  /** 예정일 (최초 등록 + 3일, Asia/Seoul) */
  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;

  /** 임무 상태 (SCHEDULED / AVAILABLE / IN_PROGRESS / COMPLETED) */
  @Column({ name: 'status', type: 'enum', enum: ReviewMissionStatus, enumName: 'review_mission_status', default: ReviewMissionStatus.Scheduled })
  status!: ReviewMissionStatus;

  /** 출제 문항 수 */
  @Column({ name: 'target_question_count', type: 'smallint', nullable: true })
  targetQuestionCount!: number | null;

  /** 알림 발송 시각 */
  @Column({ name: 'notified_at', type: 'timestamptz', nullable: true })
  notifiedAt!: Date | null;

  /** 완료 시각 */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
