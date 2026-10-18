// 자동 생성: leren_erd_v2.dbml 기준 (app.concept_auto_reviews)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AutoReviewStatus } from '../common/enums';
import { User } from '../account/users.entity';

@Index(['userId', 'conceptCode'], { unique: true })
@Index(['status', 'dueDate'])
@Entity({ name: 'concept_auto_reviews', schema: 'app' })
export class ConceptAutoReview {
  @PrimaryGeneratedColumn('uuid', { name: 'auto_review_id' })
  autoReviewId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'concept_code', type: 'varchar', length: 30, comment: '논리 참조: concepts.concept_code' })
  conceptCode!: string;

  @Column({ name: 'first_registered_at', type: 'timestamptz' })
  firstRegisteredAt!: Date;

  @Column({ name: 'due_date', type: 'date', comment: '최초 등록 + 3일(Asia/Seoul)' })
  dueDate!: string;

  @Column({ name: 'status', type: 'enum', enum: AutoReviewStatus, enumName: 'auto_review_status', default: AutoReviewStatus.Scheduled })
  status!: AutoReviewStatus;

  @Column({ name: 'target_question_count', type: 'smallint', nullable: true })
  targetQuestionCount!: number | null;

  @Column({ name: 'notified_at', type: 'timestamptz', nullable: true })
  notifiedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
