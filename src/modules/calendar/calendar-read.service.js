const { AppDataSource } = require('../../config/database');
const dates = require('./calendar-date');
const readRepository = require('./calendar-read.repository');
const historyRepository = require('../learning/history.repository');
const historyDto = require('../learning/dto/historyResponse.dto');
const scheduleDto = require('./dto/scheduleResponse.dto');

module.exports = function service(dataSource = AppDataSource, { now = () => new Date() } = {}) {
  return {
    async day(userId, date) {
      const range = dates.dayRange(date);
      return dataSource.transaction('REPEATABLE READ', async manager => {
        const repo = readRepository(manager);
        const attempts = await repo.dayRecords(userId, range);
        const submissions = await historyRepository(manager).countsFor(attempts.map(row => row.attemptId));
        const grouped = new Map(attempts.map(row => [row.attemptId, []]));
        for (const row of submissions) grouped.get(row.attemptId)?.push(row);
        const plans = await repo.dayPlans(userId, date);
        return { date, timeZone: 'Asia/Seoul',
          learningRecords: attempts.map(row => historyDto.summary(row, grouped.get(row.attemptId))),
          schedules: plans.map(plan => ({ ...scheduleDto(plan, plan.stage?.topic || plan.concept?.topic),
            stage: plan.stage ? { stageId: plan.stage.stageId, stageCode: plan.stage.stageCode, title: plan.stage.title, stageType: plan.stage.stageType } : null,
            concept: plan.concept ? { conceptId: plan.concept.conceptId, title: plan.concept.title, version: plan.concept.version } : null,
          })),
        };
      });
    },
    async month(userId, month) {
      const range = dates.monthRange(month);
      const today = dates.seoulDate(now());
      const tomorrow = dates.dayRange(today).end;
      return dataSource.transaction('REPEATABLE READ', async manager => {
        const repo = readRepository(manager);
        const complete = new Map((await repo.completedCounts(userId, range)).map(row => [row.date, Number(row.count)]));
        const planned = new Map((await repo.scheduledCounts(userId, range)).map(row => [row.date, Number(row.count)]));
        const streakDays = await repo.streak(userId, today, tomorrow);
        return { year: range.year, month: range.month, timeZone: 'Asia/Seoul', completedDayCount: complete.size,
          streakDays, streakAsOfDate: today, streakPolicy: 'TODAY_OR_YESTERDAY',
          days: range.dates.map(date => ({ date, completedCount: complete.get(date) || 0, scheduledCount: planned.get(date) || 0,
            hasCompletedLearning: complete.has(date), hasScheduledLearning: planned.has(date) })),
        };
      });
    },
  };
};
