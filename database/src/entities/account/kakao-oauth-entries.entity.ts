import { Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/** 짧게 유지되는 카카오 OAuth state 및 교환 코드. 토큰 원문은 저장하지 않는다. */
@Entity({ name: 'kakao_oauth_entries', schema: 'app' })
@Check('chk_kakao_oauth_entries_kind', `"kind" IN ('state', 'exchange')`)
@Index('kakao_oauth_entries_expires_at_idx', ['expiresAt'])
export class KakaoOAuthEntry {
  @PrimaryColumn({ type: 'varchar', length: 8, primaryKeyConstraintName: 'kakao_oauth_entries_pkey' })
  kind!: 'state' | 'exchange';

  @PrimaryColumn({ name: 'token_hash', type: 'varchar', length: 64, primaryKeyConstraintName: 'kakao_oauth_entries_pkey' })
  tokenHash!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
