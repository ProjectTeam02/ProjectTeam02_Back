/**
 * 학습 비즈니스 로직 파일
 * 백엔드 작업: 유스케이스 흐름과 정책을 조합
 * 주의: DB 접근은 Repository, 외부 통신은 Client 사용
 */
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const schema = require('./history.schema');
const repository = require('./history.repository');
const dto = require('./dto/historyResponse.dto');

module.exports = function service(dataSource = AppDataSource) {
  return {
    async history(userId, query) {
      const options = schema.listOptions(query);
      // Pagination, counts, and content are read from a consistent snapshot; no records are written.
      return dataSource.transaction('REPEATABLE READ', async manager => {
        const repo = repository(manager);
        const [attempts, total] = await repo.list(userId, options);
        const rows = await repo.countsFor(attempts.map(attempt => attempt.attemptId));
        const grouped = new Map(attempts.map(attempt => [attempt.attemptId, []]));
        for (const row of rows) grouped.get(row.attemptId)?.push(row);
        return { items: attempts.map(attempt => dto.summary(attempt, grouped.get(attempt.attemptId))),
          page: options.page, pageSize: options.pageSize, total, totalPages: Math.ceil(total / options.pageSize),
          ...(total === 0 ? { emptyMessage: '아직 학습 기록이 없습니다.' } : {}) };
      });
    },
    async historyDetail(userId, recordType, recordId) {
      const params = schema.detail({ params: { recordType, recordId } }).params;
      return dataSource.transaction('REPEATABLE READ', async manager => {
        const repo = repository(manager);
        const attempt = await repo.ownAttempt(userId, params.recordId);
        // Check ownership before querying submissions or answer/explanation relations.
        if (!attempt) throw AppError.notFound('학습 이력을 찾을 수 없습니다.');
        const rows = await repo.detailsFor(attempt.attemptId);
        return { ...dto.summary(attempt, rows), submissions: rows.map(dto.submission) };
      });
    },
  };
};
