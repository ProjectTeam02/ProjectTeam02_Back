<<<<<<< HEAD
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
=======
/**
 * 스테이지 비즈니스 로직 파일
 * 백엔드 작업: 유스케이스 흐름과 정책을 조합
 * 주의: DB 접근은 Repository, 외부 통신은 Client 사용
 * 현재 상태: 구현 전 스캐폴드이며 역할별 코드를 이 파일에 작성합니다.
 */
module.exports = {};
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
