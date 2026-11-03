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
