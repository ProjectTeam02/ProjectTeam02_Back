const env = require('../../config/env');
const AppError = require('../../common/errors/AppError');
const { startOfSeoulDay } = require('../../common/utils/date.util');

function quotaService(db) {
  return {
    async reserve(userId, reservation) {
      const reserveInTransaction = async (tx) => {
        const used = await tx.aiRequest.count({ where: { userId, createdAt: { gte: startOfSeoulDay() }, requestType: 'TUTOR', status: { not: 'FAILED' } } });
        if (used >= env.aiDailyLimit) throw AppError.rateLimited();
        if (reservation) await tx.aiRequest.create({ data: reservation });
        return { used, remaining: Math.max(0, env.aiDailyLimit - used - 1) };
      };
      return db.$transaction ? db.$transaction(reserveInTransaction) : reserveInTransaction(db);
    },
    async usage(userId) {
      const used = await db.aiRequest.count({ where: { userId, createdAt: { gte: startOfSeoulDay() }, requestType: 'TUTOR', status: { not: 'FAILED' } } });
      return { dailyLimit: env.aiDailyLimit, used, remaining: Math.max(0, env.aiDailyLimit - used) };
    },
  };
}

module.exports = quotaService;
