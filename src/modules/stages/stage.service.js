const AppDataSource = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const stageRepository = require('./stage.repository');
const { formatStageList, formatStepList } = require('./dto/stageResponse.dto');

function service(dataSource = AppDataSource) {
  const repository = stageRepository(dataSource);
  return {
    async getStageMap(userId) {
      const stages = await repository.findAllStages();
      const userProgress = await repository.findUserStageProgress(userId);
      return formatStageList(stages, userProgress);
    },
    async getStageSteps(stageId, userId) {
      const { stage, steps } = await repository.findStageWithSteps(stageId);
      if (!stage) throw AppError.notFound('존재하지 않는 스테이지입니다.');
      return formatStepList(stage, steps, {});
    },
  };
}

module.exports = service;
