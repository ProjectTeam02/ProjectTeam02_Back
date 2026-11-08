/**
 * 학습 주제 비즈니스 로직 파일
 * 백엔드 작업: 유스케이스 흐름과 정책을 조합
 * 주의: DB 접근은 Repository, 외부 통신은 Client 사용
 */
const { AppDataSource } = require('../../config/database');
const repository = require('./topic.repository');
const dto = require('./dto/topicResponse.dto');

module.exports = function service(dataSource = AppDataSource) {
  return {
    list: () => dataSource.transaction('REPEATABLE READ', async manager => {
      const items = (await repository(manager).published()).map(dto);
      return { items, ...(!items.length ? { emptyMessage: '아직 등록된 경제 학습 주제가 없습니다.' } : {}) };
    }),
  };
};
