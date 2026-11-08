/**
 * 스테이지 비즈니스 로직 파일
 * 백엔드 작업: 유스케이스 흐름과 정책을 조합
 * 주의: DB 접근은 Repository, 외부 통신은 Client 사용
 */
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const repository = require('./stage.repository');
const topicDto = require('../topics/dto/topicResponse.dto');
const dto = require('./dto/stageResponse.dto');

async function unlocked(repo, userId, stage, progress) {
  if (progress?.progressStatus === 'PASSED') return true;
  if (stage.stageNo > 1) {
    const previous = await repo.previousStage(stage.topicId, stage.stageNo - 1);
    return Boolean(previous && (await repo.progress(userId, previous.stageId))?.progressStatus === 'PASSED');
  }
  for (const prerequisite of await repo.prerequisites(stage.topicId)) {
    const boss = await repo.boss(prerequisite.prerequisiteTopicId);
    if (!boss || (await repo.progress(userId, boss.stageId))?.progressStatus !== 'PASSED') return false;
  }
  return true;
}

module.exports = function service(dataSource = AppDataSource) {
  return {
    list: (userId, topicId) => dataSource.transaction('REPEATABLE READ', async manager => {
      const repo = repository(manager);
      const topic = await repo.publishedTopic(topicId);
      if (!topic) throw AppError.notFound('공개된 경제 학습 주제를 찾을 수 없습니다.');
      const items = [];
      for (const stage of await repo.publishedStages(topicId)) {
        const progress = await repo.progress(userId, stage.stageId);
        items.push(dto.summary(stage, progress, await unlocked(repo, userId, stage, progress)));
      }
      return { topic: topicDto(topic), items,
        ...(!items.length ? { emptyMessage: '이 주제에 공개된 Stage가 없습니다.' } : {}),
      };
    }),
    detail: (userId, stageId) => dataSource.transaction('REPEATABLE READ', async manager => {
      const repo = repository(manager);
      const stage = await repo.publishedStage(stageId);
      if (!stage || stage.topic?.status !== 'PUBLISHED') throw AppError.notFound('공개된 Stage를 찾을 수 없습니다.');
      const progress = await repo.progress(userId, stageId);
      const concepts = await repo.publishedConcepts(stageId);
      return dto.detail(stage, progress, await unlocked(repo, userId, stage, progress), concepts);
    }),
  };
};
