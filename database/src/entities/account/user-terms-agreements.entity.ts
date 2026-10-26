// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.user_terms_agreements)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Terms } from './terms.entity';
import { User } from './users.entity';

/** 사용자가 어느 약관 버전에 언제 동의(또는 거부)했는지 기록합니다. 탈퇴 후에도 이력은 보존합니다. */
@Index('user_terms_agreements_user_id_terms_id_idx', ['userId', 'termsId'], { unique: true })
@Entity({ name: 'user_terms_agreements', schema: 'app' })
export class UserTermsAgreement {
  /** 동의 기록 ID */
  @PrimaryGeneratedColumn('uuid', { name: 'agreement_id', primaryKeyConstraintName: 'user_terms_agreements_pkey' })
  agreementId!: string;

  /** 사용자 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'user_terms_agreements_user_id_fkey' })
  user?: User;

  /** 약관 (버전별) */
  @Column({ name: 'terms_id', type: 'uuid' })
  termsId!: string;

  /** 관계: terms_id → terms.terms_id */
  @ManyToOne(() => Terms, { nullable: false })
  @JoinColumn({ name: 'terms_id', foreignKeyConstraintName: 'user_terms_agreements_terms_id_fkey' })
  terms?: Terms;

  /** 동의 여부. 선택 항목은 거부(false)도 기록 */
  @Column({ name: 'agreed', type: 'boolean' })
  agreed!: boolean;

  /** 응답 시각 (동의 또는 거부) */
  @Column({ name: 'agreed_at', type: 'timestamptz', default: () => 'now()' })
  agreedAt!: Date;

  /** 선택 동의 철회 시각 (다시 동의하면 null, agreed_at 갱신) */
  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
