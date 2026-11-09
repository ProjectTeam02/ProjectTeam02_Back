// 자동 생성: leren_erd.dbml (rev.8) 기준 (app.glossary_terms)
import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/** 경제 용어 마스터 (rev.8). 약관 테이블 terms와 구분하려고 glossary_terms로 이름 붙였습니다. */
@Unique('glossary_terms_term_code_key', ['termCode'])
@Check('chk_glossary_terms_term', `char_length((term)::text) >= 1`)
@Check('chk_glossary_terms_definition', `char_length((definition)::text) >= 1`)
@Entity({ name: 'glossary_terms', schema: 'app' })
export class GlossaryTerm {
  /** 용어 ID. API termId */
  @PrimaryGeneratedColumn('uuid', { name: 'term_id', primaryKeyConstraintName: 'glossary_terms_pkey' })
  termId!: string;

  /** 용어 코드 (콘텐츠 관리용 고정 식별자, 예: TERM_PURCHASING_POWER) */
  @Column({ name: 'term_code', type: 'varchar', length: 30 })
  termCode!: string;

  /** 용어 (예: 구매력) */
  @Column({ name: 'term', type: 'varchar', length: 50 })
  term!: string;

  /** 뜻 (한 줄 설명) */
  @Column({ name: 'definition', type: 'varchar', length: 255 })
  definition!: string;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
