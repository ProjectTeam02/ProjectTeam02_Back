// 오개념 진단 가설 (learning.misconception_hypotheses) — #164, Backend 계획서 BE-05
// - 확정된 학습 상태와 AI 진단 가설을 구분해 보관한다. 기본은 UNCONFIRMED(가설)
// - 단일 오답으로 확정하지 않도록 CONFIRMED는 근거(문제 제출 기록) 2개 이상일 때만 허용
// - 근거·유형 길이 제한은 AI 계약(ProjectTeam02_AI MisconceptionHypothesisContext: hypothesisType 40자, evidenceIds 최대 20개)과 같다
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { MisconceptionSource, MisconceptionStatus } from '../common/enums';
import { User } from '../account/users.entity';

/** 사용자별 오개념 가설. AI 요청에는 status와 근거를 함께 보내고, 불확실한 가설을 확정 정보로 쓰지 않는다 */
@Index('misconception_hypotheses_user_id_concept_code_idx', ['userId', 'conceptCode'])
@Index('uq_misconception_hypotheses_one_unconfirmed', ['userId', 'conceptCode', 'hypothesisType'], { unique: true, where: `"status" = 'UNCONFIRMED'` })
@Check('chk_misconception_type_not_blank', `btrim((hypothesis_type)::text) <> ''`)
@Check('chk_misconception_evidence_max', `cardinality(evidence_submission_ids) <= 20`)
@Check('chk_misconception_confirmed_evidence', `(status <> 'CONFIRMED') OR (cardinality(evidence_submission_ids) >= 2)`)
@Check('chk_misconception_resolved_at', `((status = 'UNCONFIRMED') AND (resolved_at IS NULL)) OR ((status <> 'UNCONFIRMED') AND (resolved_at IS NOT NULL))`)
@Entity({ name: 'misconception_hypotheses', schema: 'learning' })
export class MisconceptionHypothesis {
  /** 가설 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'hypothesis_id', primaryKeyConstraintName: 'misconception_hypotheses_pkey' })
  hypothesisId!: string;

  /** 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'misconception_hypotheses_user_id_fkey' })
  user?: User;

  /** 개념 코드 (논리 참조: concepts.concept_code, 버전 무관) */
  @Column({ name: 'concept_code', type: 'varchar', length: 30 })
  conceptCode!: string;

  /** 오개념 유형 (예: 인과관계 반대로 이해). AI 계약 hypothesisType */
  @Column({ name: 'hypothesis_type', type: 'varchar', length: 40 })
  hypothesisType!: string;

  /** 상태 (UNCONFIRMED → CONFIRMED / REJECTED) */
  @Column({ name: 'status', type: 'enum', enum: MisconceptionStatus, enumName: 'misconception_status', default: MisconceptionStatus.Unconfirmed })
  status!: MisconceptionStatus;

  /** 만든 주체 (RULE = 백엔드 규칙, AI = AI 진단) */
  @Column({ name: 'source', type: 'enum', enum: MisconceptionSource, enumName: 'misconception_source' })
  source!: MisconceptionSource;

  /** 근거 문제 제출 기록 ID 목록 (논리 참조: question_submissions.submission_id, 최대 20개) */
  @Column({ name: 'evidence_submission_ids', type: 'uuid', array: true, default: () => "'{}'" })
  evidenceSubmissionIds!: string[];

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** 확정·기각 시각 (UNCONFIRMED이면 null) */
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;
}
