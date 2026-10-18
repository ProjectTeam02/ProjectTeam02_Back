// 자동 생성: leren_erd_v2.dbml 기준 (app.social_accounts)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { SocialProvider } from '../common/enums';
import { User } from './users.entity';

@Index(['provider', 'providerUserId'], { unique: true })
@Entity({ name: 'social_accounts', schema: 'app' })
export class SocialAccount {
  @PrimaryGeneratedColumn('uuid', { name: 'social_account_id' })
  socialAccountId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'provider', type: 'enum', enum: SocialProvider, enumName: 'social_provider' })
  provider!: SocialProvider;

  @Column({ name: 'provider_user_id', type: 'varchar', length: 255 })
  providerUserId!: string;

  @Column({ name: 'provider_email', type: 'varchar', length: 255, nullable: true })
  providerEmail!: string | null;

  @Column({ name: 'provider_nickname', type: 'varchar', length: 100, nullable: true })
  providerNickname!: string | null;

  @Column({ name: 'connected_at', type: 'timestamptz', default: () => 'now()' })
  connectedAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'disconnected_at', type: 'timestamptz', nullable: true })
  disconnectedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
