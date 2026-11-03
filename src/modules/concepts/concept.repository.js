const { ConceptCard } = require('@leren/database');

function repository(dataSource) {
  return {
    async findCardByStepAndPage(stepId, page) {
      const repo = dataSource.getRepository(ConceptCard);
      return await repo.findOne({ where: { stepId, pageNumber: page } });
    },
  };
}

module.exports = repository;
