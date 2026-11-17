const { LearningAttempt, AttemptStatus, AttemptEndReason } = require('@leren/database');
const AppError = require('../../common/errors/AppError');

module.exports = function attemptAbandonService(dataSource) {
  return async function abandon(userId, attemptId) {
    return dataSource.transaction(async manager => {
      const attempts = manager.getRepository(LearningAttempt);
      // Answers lock this same row before grading or granting rewards.
      const attempt = await attempts.findOne({ where: { attemptId, userId }, lock: { mode: 'pessimistic_write' } });
      if (!attempt) throw AppError.notFound('응시를 찾을 수 없습니다.');
      if (attempt.status === AttemptStatus.Abandoned) return attempt;
      if (attempt.status !== AttemptStatus.InProgress) throw AppError.conflict('이미 종료된 응시는 포기할 수 없습니다.');

      attempt.status = AttemptStatus.Abandoned;
      attempt.endReason = AttemptEndReason.Abandoned;
      attempt.endedAt = new Date();
      return attempts.save(attempt);
    });
  };
};
