// 자동 생성: leren_erd_v2.dbml 기준 (app.region_prerequisites)
import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Region } from './regions.entity';

@Check('chk_region_prereq_not_self', `"region_id" <> "prerequisite_region_id"`)
@Entity({ name: 'region_prerequisites', schema: 'app', comment: 'check(region_id <> prerequisite_region_id). 1→2→3, 3→4·5, 5→6, 1→7→8→9. 선수 지역 BOSS 통과 시 해금' })
export class RegionPrerequisite {
  @PrimaryColumn({ name: 'region_id', type: 'uuid' })
  regionId!: string;

  @ManyToOne(() => Region, { nullable: false })
  @JoinColumn({ name: 'region_id' })
  region?: Region;

  @PrimaryColumn({ name: 'prerequisite_region_id', type: 'uuid' })
  prerequisiteRegionId!: string;

  @ManyToOne(() => Region, { nullable: false })
  @JoinColumn({ name: 'prerequisite_region_id' })
  prerequisiteRegion?: Region;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
