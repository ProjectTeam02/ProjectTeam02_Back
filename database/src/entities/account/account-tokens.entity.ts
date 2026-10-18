// 자동 생성: leren_erd_v2.dbml 기준 (app.account_tokens)
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TokenType } from '../common/enums';
import { User } from './users.entity';

@Entity({ name: 'account_tokens', schema: 'app' })
export class AccountToken {
  @PrimaryGeneratedColumn('uuid', { name: 'token_id' })
  tokenId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'token_type', type: 'enum', enum: TokenType, enumName: 'token_type' })
  tokenType!: TokenType;

  @Column({ name: 'token_hash', type: 'varchar', length: 255, unique: true })
  tokenHash!: string;

  @Column({ name: 'target_email', type: 'varchar', length: 255 })
  targetEmail!: string;

  @Column({ name: 'send_count', type: 'integer', default: 1, comment: '재발송 제한(추후 협의)' })
  sendCount!: number;

  @Column({ name: 'last_sent_at', type: 'timestamptz', default: () => 'now()' })
  lastSentAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
