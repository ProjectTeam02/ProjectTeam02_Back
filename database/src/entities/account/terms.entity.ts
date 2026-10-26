// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.terms)
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TermsType } from '../common/enums';

/** 약관·개인정보 동의 항목 마스터. 내용이 바뀌면 version을 올려 새 행을 추가합니다(기존 행 수정 금지). */
@Index('terms_terms_type_version_idx', ['termsType', 'version'], { unique: true })
@Entity({ name: 'terms', schema: 'app' })
export class Terms {
  /** 약관 ID. API termsId */
  @PrimaryGeneratedColumn('uuid', { name: 'terms_id', primaryKeyConstraintName: 'terms_pkey' })
  termsId!: string;

  /** 약관 종류 (SERVICE / PRIVACY / AGE_OVER_14 / MARKETING) */
  @Column({ name: 'terms_type', type: 'enum', enum: TermsType, enumName: 'terms_type' })
  termsType!: TermsType;

  /** 버전 */
  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number;

  /** 제목 */
  @Column({ name: 'title', type: 'varchar', length: 100 })
  title!: string;

  /** 본문. 동의 당시 문구를 그대로 보존 (기존 행 수정 금지) */
  @Column({ name: 'content', type: 'text' })
  content!: string;

  /** 필수 동의 여부 */
  @Column({ name: 'is_required', type: 'boolean' })
  isRequired!: boolean;

  /** 시행 시각. 같은 종류 중 시행된 최신 version이 현재 약관 */
  @Column({ name: 'effective_at', type: 'timestamptz' })
  effectiveAt!: Date;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
