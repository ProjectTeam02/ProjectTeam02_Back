// 자동 생성: leren_erd_v3.dbml (rev.5) 기준 (app.topic_prerequisites)
import { Check, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Topic } from './topics.entity';

/** 주제 선수관계 (1→2→3, 3→4·5, 5→6, 1→7→8→9). 선수 주제의 BOSS를 통과하면 해금됩니다. */
@Check('chk_topic_prereq_not_self', `topic_id <> prerequisite_topic_id`)
@Entity({ name: 'topic_prerequisites', schema: 'app' })
export class TopicPrerequisite {
  /** 주제 */
  @PrimaryColumn({ name: 'topic_id', type: 'uuid', primaryKeyConstraintName: 'topic_prerequisites_pkey' })
  topicId!: string;

  /** 관계: topic_id → topics.topic_id */
  @ManyToOne(() => Topic, { nullable: false })
  @JoinColumn({ name: 'topic_id', foreignKeyConstraintName: 'topic_prerequisites_topic_id_fkey' })
  topic?: Topic;

  /** 선수 주제 */
  @PrimaryColumn({ name: 'prerequisite_topic_id', type: 'uuid', primaryKeyConstraintName: 'topic_prerequisites_pkey' })
  prerequisiteTopicId!: string;

  /** 관계: prerequisite_topic_id → topics.topic_id */
  @ManyToOne(() => Topic, { nullable: false })
  @JoinColumn({ name: 'prerequisite_topic_id', foreignKeyConstraintName: 'topic_prerequisites_prerequisite_topic_id_fkey' })
  prerequisiteTopic?: Topic;

  /** 생성 시각 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
