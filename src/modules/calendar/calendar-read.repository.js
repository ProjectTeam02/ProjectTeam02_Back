const { LearningAttempt, StudyPlan } = require('@leren/database');
const { IsNull } = require('typeorm');

module.exports = function repository(manager) {
  const completed = (userId, start, end) => manager.getRepository(LearningAttempt).createQueryBuilder('attempt')
    .where('attempt.userId = :userId', { userId })
    .andWhere('attempt.status = :status', { status: 'PASSED' })
    .andWhere('attempt.endedAt >= :start AND attempt.endedAt < :end', { start, end });
  return {
    dayRecords: (userId, range) => completed(userId, range.start, range.end)
      .leftJoinAndSelect('attempt.stage', 'stage').leftJoinAndSelect('stage.topic', 'topic')
      .orderBy('attempt.endedAt', 'DESC').addOrderBy('attempt.attemptId', 'DESC').getMany(),
    dayPlans: (userId, date) => manager.getRepository(StudyPlan).find({
      where: { userId, scheduledDate: date, status: 'PLANNED', deletedAt: IsNull() },
      relations: { stage: { topic: true }, concept: { topic: true } },
      order: { createdAt: 'ASC', planId: 'ASC' },
    }),
    completedCounts: (userId, range) => completed(userId, range.start, range.end)
      .select("TO_CHAR(attempt.endedAt AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count').groupBy("TO_CHAR(attempt.endedAt AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')").getRawMany(),
    scheduledCounts: (userId, range) => manager.getRepository(StudyPlan).createQueryBuilder('plan')
      .where('plan.userId = :userId', { userId }).andWhere('plan.status = :status', { status: 'PLANNED' })
      .andWhere('plan.deletedAt IS NULL')
      .andWhere('plan.scheduledDate >= :first AND plan.scheduledDate < :next', { first: range.first, next: range.next })
      .select('CAST(plan.scheduledDate AS text)', 'date').addSelect('COUNT(*)', 'count').groupBy('plan.scheduledDate').getRawMany(),
    // Only one aggregate row crosses the DB boundary; no full attempt history is loaded into Node.
    streak: async (userId, today, tomorrow) => {
      const [row] = await manager.query(`
        WITH dates AS MATERIALIZED (
          SELECT DISTINCT (ended_at AT TIME ZONE 'Asia/Seoul')::date AS day
          FROM app.learning_attempts
          WHERE user_id = $1 AND status = 'PASSED' AND ended_at < $2
        ), anchor AS (
          SELECT MAX(day) AS day FROM dates WHERE day IN ($3::date, $3::date - 1)
        ), ranked AS (
          SELECT dates.day, anchor.day - (ROW_NUMBER() OVER (ORDER BY dates.day DESC) - 1)::int AS expected
          FROM dates CROSS JOIN anchor WHERE dates.day <= anchor.day
        ) SELECT COUNT(*)::int AS "streakDays" FROM ranked WHERE day = expected
      `, [userId, tomorrow, today]);
      return Number(row.streakDays);
    },
  };
};
