const AppDataSource = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const conceptRepository = require('./concept.repository');

function service(dataSource = AppDataSource) {
  const repository = conceptRepository(dataSource);
  return {
    async getCardByPage(stepId, page) {
      const card = await repository.findCardByStepAndPage(stepId, page);
      if (!card) {
        // 기본 더미 마이크로러닝 템플릿 반환 (피그마 15번)
        return {
          stepId,
          page,
          totalPages: 3,
          title: page === 1 ? '선택과 기회비용' : page === 2 ? '핵심 정리' : '돈의 역할',
          contents: [
            { type: 'BOX', text: '시간과 자원은 한정되어 있어요. 원하는 일을 모두 할 수 없으므로 선택이 필요해요.' },
            { type: 'HIGHLIGHT', text: '선택에는 기회비용이 있어요.' },
            { type: 'EXAMPLE', text: '같은 1시간에 운동과 독서를 할 수 있다면, 운동을 선택할 때 포기한 독서의 가치가 기회비용이 됩니다.' }
          ],
          hasQuizButton: page === 2,
        };
      }
      return card;
    },
  };
}

module.exports = service;
