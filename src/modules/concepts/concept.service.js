/**
 * 경제 개념 비즈니스 로직 파일
 * 백엔드 작업: 유스케이스 흐름과 정책을 조합
 * 주의: DB 접근은 Repository, 외부 통신은 Client 사용
 */
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const repository = require('./concept.repository');
const dto = require('./dto/conceptDetailResponse.dto');

module.exports = function service(dataSource = AppDataSource) {
  return {
    detail: conceptId => dataSource.transaction('REPEATABLE READ', async manager => {
      const repo = repository(manager);
      const concept = await repo.publishedConcept(conceptId);
      if (!concept) throw AppError.notFound('공개된 학습 개념을 찾을 수 없습니다.');
      return dto(concept, await repo.cards(conceptId));
    }),
  };
};
