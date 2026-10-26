const { AiRequest } = require('@leren/database');
const { Not, MoreThanOrEqual } = require('typeorm');
const env = require('../../config/env');
const AppError = require('../../common/errors/AppError');
const { startOfSeoulDay } = require('../../common/utils/date.util');

function quotaService(dataSource) {
  const repoFor = (manager = dataSource.manager) => manager.getRepository(AiRequest);
  const whereFor = (userId) => ({ userId, requestType: 'TUTOR', reservedAt: MoreThanOrEqual(startOfSeoulDay()), status: Not('FAILED') });
  return {
    async reserve(userId, reservation) {
      // 레거시 단위 테스트용 최소 어댑터. 운영 경로는 TypeORM DataSource를 사용한다.
      if (typeof dataSource.transaction !== 'function' && typeof dataSource.$transaction === 'function') {
        return dataSource.$transaction(async (tx) => {
          const used = await tx.aiRequest.count({ where: { userId } });
          if (used >= env.aiDailyLimit) throw AppError.rateLimited();
          if (reservation) await tx.aiRequest.create({ data: reservation });
          return { used, remaining: Math.max(0, env.aiDailyLimit - used - 1) };
        });
      }
      return dataSource.transaction(async (manager) => {
        const used = await repoFor(manager).count({ where: whereFor(userId) });
        if (used >= env.aiDailyLimit) throw AppError.rateLimited();
        if (reservation) {
          const repo = repoFor(manager);
          await repo.save(repo.create(reservation));
        }
        return { used, remaining: Math.max(0, env.aiDailyLimit - used - 1) };
      });
    },
    async usage(userId) {
      const used = await repoFor().count({ where: whereFor(userId) });
      return { dailyLimit: env.aiDailyLimit, used, remaining: Math.max(0, env.aiDailyLimit - used) };
    },
  };
}

module.exports = quotaService;
