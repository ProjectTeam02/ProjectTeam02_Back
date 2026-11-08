/**
 * 스테이지 PostgreSQL 접근 계층 파일
 * 백엔드 작업: 조회·저장 로직과 쿼리를 관리
 * 주의: 기존 DB 스키마와 환경변수 유지
 */
const { Topic, TopicPrerequisite, Stage, StageConcept, UserStageProgress } = require('@leren/database');

module.exports = manager => ({
  publishedTopic: topicId => manager.getRepository(Topic).findOneBy({ topicId, status: 'PUBLISHED' }),
  publishedStages: topicId => manager.getRepository(Stage).find({
    where: { topicId, status: 'PUBLISHED' }, order: { stageNo: 'ASC', stageId: 'ASC' },
  }),
  publishedStage: stageId => manager.getRepository(Stage).findOne({
    where: { stageId, status: 'PUBLISHED' }, relations: { topic: true },
  }),
  publishedConcepts: stageId => manager.getRepository(StageConcept).find({
    where: { stageId, concept: { status: 'PUBLISHED', topic: { status: 'PUBLISHED' } } },
    relations: { concept: true }, order: { displayOrder: 'ASC', conceptId: 'ASC' },
  }),
  progress: (userId, stageId) => manager.getRepository(UserStageProgress).findOneBy({ userId, stageId }),
  previousStage: (topicId, stageNo) => manager.getRepository(Stage).findOneBy({ topicId, stageNo }),
  prerequisites: topicId => manager.getRepository(TopicPrerequisite).findBy({ topicId }),
  boss: topicId => manager.getRepository(Stage).findOneBy({ topicId, stageType: 'BOSS' }),
});
