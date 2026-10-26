// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.character_classes)
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { ClassCode } from '../common/enums';

/** 직업 마스터 (검사·마법사·궁수). "class"는 예약어라 테이블명은 character_classes입니다. */
@Unique('character_classes_class_code_key', ['classCode'])
@Entity({ name: 'character_classes', schema: 'app' })
export class CharacterClass {
  /** 직업 ID. API classId */
  @PrimaryGeneratedColumn('uuid', { name: 'class_id', primaryKeyConstraintName: 'character_classes_pkey' })
  classId!: string;

  /** 직업 코드 (WARRIOR / MAGE / ARCHER) */
  @Column({ name: 'class_code', type: 'enum', enum: ClassCode, enumName: 'class_code' })
  classCode!: ClassCode;

  /** 이름 (검사 / 마법사 / 궁수) */
  @Column({ name: 'name', type: 'varchar', length: 30 })
  name!: string;

  /** 설명 */
  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  /** 이미지 파일 키 */
  @Column({ name: 'image_key', type: 'varchar', length: 255, nullable: true })
  imageKey!: string | null;

  /** 미리보기 이미지 키 */
  @Column({ name: 'preview_image_key', type: 'varchar', length: 255, nullable: true })
  previewImageKey!: string | null;

  /** 전투 효과 키 */
  @Column({ name: 'battle_effect_key', type: 'varchar', length: 255, nullable: true })
  battleEffectKey!: string | null;

  /** 정렬 순서 */
  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;

  /** 사용 여부 */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
