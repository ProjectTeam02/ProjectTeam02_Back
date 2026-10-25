// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.user_characters)
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { CharacterClass } from './character-classes.entity';
import { User } from '../account/users.entity';

/** 사용자 캐릭터 (users와 1:1). 장착 정보는 user_equipped_costumes에 있습니다. */
@Entity({ name: 'user_characters', schema: 'app' })
export class UserCharacter {
  /** 사용자 (1:1) */
  @PrimaryColumn({ name: 'user_id', type: 'uuid', primaryKeyConstraintName: 'user_characters_pkey' })
  userId!: string;

  /** 관계: user_id → users.user_id */
  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'user_characters_user_id_fkey' })
  user?: User;

  /** 선택한 직업 */
  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  /** 관계: class_id → character_classes.class_id */
  @ManyToOne(() => CharacterClass, { nullable: false })
  @JoinColumn({ name: 'class_id', foreignKeyConstraintName: 'user_characters_class_id_fkey' })
  characterClass?: CharacterClass;

  /** 최초 직업 선택 시각 */
  @Column({ name: 'first_selected_at', type: 'timestamptz', default: () => 'now()' })
  firstSelectedAt!: Date;

  /** 직업 변경 시각 */
  @Column({ name: 'class_changed_at', type: 'timestamptz', nullable: true })
  classChangedAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
