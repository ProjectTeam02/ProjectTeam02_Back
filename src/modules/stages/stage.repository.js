<<<<<<< HEAD
const { Stage, Step, UserStageProgress } = require('@leren/database');

function repository(dataSource) {
  return {
    async findAllStages() {
      const repo = dataSource.getRepository(Stage);
      return await repo.find({ order: { orderNum: 'ASC' } });
    },
    async findUserStageProgress(userId) {
      const repo = dataSource.getRepository(UserStageProgress);
      const list = await repo.findBy({ userId });
      return list.reduce((acc, curr) => { acc[curr.stageId] = curr; return acc; }, {});
    },
    async findStageWithSteps(stageId) {
      const stageRepo = dataSource.getRepository(Stage);
      const stepRepo = dataSource.getRepository(Step);
      const stage = await stageRepo.findOneBy({ id: stageId });
      const steps = await stepRepo.find({ where: { stageId }, order: { orderNum: 'ASC' } });
      return { stage, steps };
    },
  };
}

module.exports = repository;
=======
/**
 * 스테이지 PostgreSQL 접근 계층 파일
 * 백엔드 작업: 조회·저장 로직과 쿼리를 관리
 * 주의: 기존 DB 스키마와 환경변수 유지
 * 현재 상태: 구현 전 스캐폴드이며 역할별 코드를 이 파일에 작성합니다.
 */
module.exports = {};
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
