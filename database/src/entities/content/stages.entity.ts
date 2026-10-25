// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.stages)
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { PublishStatus, StageType } from '../common/enums';
import { Topic } from './topics.entity';

/** 일반 Stage와 BOSS를 한 테이블로 관리합니다 (BOSS = stage_type BOSS). */
@Unique('stages_stage_code_key', ['stageCode'])
@Index('stages_topic_id_stage_no_idx', ['topicId', 'stageNo'], { unique: true })
@Check('chk_stages_counts', `(required_correct_count <= max_question_count) AND (initial_monster_hp = required_correct_count)`)
@Check('chk_stages_minutes', `(estimated_min_minutes IS NULL) OR (estimated_max_minutes IS NULL) OR (estimated_min_minutes <= estimated_max_minutes)`)
@Entity({ name: 'stages', schema: 'app' })
export class Stage {
  /** Stage ID. API stageId (stage_type = BOSS이면 API bossId) */
  @PrimaryGeneratedColumn('uuid', { name: 'stage_id', primaryKeyConstraintName: 'stages_pkey' })
  stageId!: string;

  /** 소속 주제 */
  @Column({ name: 'topic_id', type: 'uuid' })
  topicId!: string;

  /** 관계: topic_id → topics.topic_id */
  @ManyToOne(() => Topic, { nullable: false })
  @JoinColumn({ name: 'topic_id', foreignKeyConstraintName: 'stages_topic_id_fkey' })
  topic?: Topic;

  /** Stage 코드 (1-1 / 1-2 / 1-BOSS) */
  @Column({ name: 'stage_code', type: 'varchar', length: 20 })
  stageCode!: string;

  /** 주제 내 순차 해금 순서 (BOSS는 마지막) */
  @Column({ name: 'stage_no', type: 'smallint' })
  stageNo!: number;

  /** Stage 종류 (NORMAL / BOSS) */
  @Column({ name: 'stage_type', type: 'enum', enum: StageType, enumName: 'stage_type' })
  stageType!: StageType;

  /** 제목 */
  @Column({ name: 'title', type: 'varchar', length: 100 })
  title!: string;

  /** 설명 */
  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  /** 예상 최소 학습 시간(분) */
  @Column({ name: 'estimated_min_minutes', type: 'smallint', nullable: true })
  estimatedMinMinutes!: number | null;

  /** 예상 최대 학습 시간(분) */
  @Column({ name: 'estimated_max_minutes', type: 'smallint', nullable: true })
  estimatedMaxMinutes!: number | null;

  /** 최대 문항 수. NORMAL 3 / BOSS 5 */
  @Column({ name: 'max_question_count', type: 'smallint' })
  maxQuestionCount!: number;

  /** 통과 필요 정답 수. NORMAL 2 / BOSS 4 */
  @Column({ name: 'required_correct_count', type: 'smallint' })
  requiredCorrectCount!: number;

  /** 몬스터 초기 HP. NORMAL 2 / BOSS 4 */
  @Column({ name: 'initial_monster_hp', type: 'smallint' })
  initialMonsterHp!: number;

  /** 몬스터 이름 */
  @Column({ name: 'monster_name', type: 'varchar', length: 50, nullable: true })
  monsterName!: string | null;

  /** 몬스터 이미지 키 */
  @Column({ name: 'monster_image_key', type: 'varchar', length: 255, nullable: true })
  monsterImageKey!: string | null;

  /** 최초 통과 전체 EXP (미확정, null 허용) */
  @Column({ name: 'reward_total_exp', type: 'integer', nullable: true })
  rewardTotalExp!: number | null;

  /** 최초 통과 경제 EXP (미확정, null 허용) */
  @Column({ name: 'reward_economy_exp', type: 'integer', nullable: true })
  rewardEconomyExp!: number | null;

  /** 최초 통과 코인 (미확정, null 허용) */
  @Column({ name: 'reward_coin', type: 'integer', nullable: true })
  rewardCoin!: number | null;

  /** 공개 상태 (DRAFT / PUBLISHED / ARCHIVED) */
  @Column({ name: 'status', type: 'enum', enum: PublishStatus, enumName: 'stages_status', default: PublishStatus.Draft })
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
