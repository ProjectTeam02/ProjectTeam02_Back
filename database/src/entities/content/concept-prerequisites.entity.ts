// 자동 생성: leren_erd.dbml (rev.5) 기준 (content.concept_prerequisites), #164 검수 상태 추가
import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { RelationReviewStatus } from '../common/enums';
import { User } from '../account/users.entity';

/** 개념 선수관계. 개념이 새 버전이 되어도 유지되도록 concept_code로 연결합니다. APPROVED인 관계만 확정된 학습 근거로 사용 (#164) */
@Check('chk_concept_prereq_not_self', `(concept_code)::text <> (prerequisite_concept_code)::text`)
@Check('chk_concept_prereq_reviewed_at', `(review_status = 'PENDING') OR (reviewed_at IS NOT NULL)`)
@Entity({ name: 'concept_prerequisites', schema: 'content' })
export class ConceptPrerequisite {
  /** 개념 코드 (논리 참조) */
  @PrimaryColumn({ name: 'concept_code', type: 'varchar', length: 30, primaryKeyConstraintName: 'concept_prerequisites_pkey' })
  conceptCode!: string;

  /** 선수 개념 코드 (논리 참조) */
  @PrimaryColumn({ name: 'prerequisite_concept_code', type: 'varchar', length: 30, primaryKeyConstraintName: 'concept_prerequisites_pkey' })
  prerequisiteConceptCode!: string;

  /** 표시 순서 */
  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder!: number;

  /** 검수 상태 (PENDING / APPROVED / REJECTED). AI 계약 relationReviewStatus와 같은 값 */
  @Column({ name: 'review_status', type: 'enum', enum: RelationReviewStatus, enumName: 'relation_review_status', default: RelationReviewStatus.Pending })
  reviewStatus!: RelationReviewStatus;

  /** 검수자 */
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  /** 관계: reviewed_by → users.user_id */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by', foreignKeyConstraintName: 'concept_prerequisites_reviewed_by_fkey' })
  reviewer?: User | null;

  /** 검수 시각 (APPROVED·REJECTED이면 필수) */
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
