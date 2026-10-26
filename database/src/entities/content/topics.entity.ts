// 자동 생성: leren_erd.dbml (rev.5) 기준 (app.topics)
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { PublishStatus } from '../common/enums';

/** 경제 지식 트리의 주제 (1~9). */
@Unique('topics_topic_code_key', ['topicCode'])
@Unique('topics_topic_no_key', ['topicNo'])
@Entity({ name: 'topics', schema: 'app' })
export class Topic {
  /** 주제 ID. API topicId */
  @PrimaryGeneratedColumn('uuid', { name: 'topic_id', primaryKeyConstraintName: 'topics_pkey' })
  topicId!: string;

  /** 주제 코드 */
  @Column({ name: 'topic_code', type: 'varchar', length: 30 })
  topicCode!: string;

  /** 주제 번호 (1~9, 화면의 STAGE n) */
  @Column({ name: 'topic_no', type: 'smallint' })
  topicNo!: number;

  /** 주제 이름 */
  @Column({ name: 'title', type: 'varchar', length: 100 })
  title!: string;

  /** 설명 */
  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  /** 지도 행 위치 */
  @Column({ name: 'map_row', type: 'smallint', nullable: true })
  mapRow!: number | null;

  /** 지도 열 위치 */
  @Column({ name: 'map_column', type: 'smallint', nullable: true })
  mapColumn!: number | null;

  /** 아이콘 키 */
  @Column({ name: 'icon_key', type: 'varchar', length: 255, nullable: true })
  iconKey!: string | null;

  /** 공개 상태 (DRAFT / PUBLISHED / ARCHIVED) */
  @Column({ name: 'status', type: 'enum', enum: PublishStatus, enumName: 'topics_status', default: PublishStatus.Draft })
  status!: PublishStatus;

  /** 공개 시각 */
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** 수정 시각 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
