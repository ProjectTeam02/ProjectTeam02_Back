const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { LearningAttempt, StudyPlan, QuestionSubmission, UserSession } = require('@leren/database');
const app = require('../src/app');
const env = require('../src/config/env');
const { AppDataSource } = require('../src/config/database');
const { issueAccessToken } = require('../src/common/utils/token.util');
const dates = require('../src/modules/calendar/calendar-date');
const readService = require('../src/modules/calendar/calendar-read.service');
const originalSecret = env.jwtAccessSecret;
test('real TypeORM metadata maps scheduledDate inside CAST without a DB connection', async () => {
  const { DataSource } = require('typeorm');
  const source = new DataSource({ ...AppDataSource.options, synchronize: false });
  await source.buildMetadatas();
  let sql;
  const manager = { getRepository: entity => ({ createQueryBuilder: alias => {
    const builder = source.getRepository(entity).createQueryBuilder(alias);
    builder.getRawMany = async () => { sql = builder.getSql(); return []; };
    return builder;
  } }) };
  await require('../src/modules/calendar/calendar-read.repository')(manager).scheduledCounts(crypto.randomUUID(), dates.monthRange('2026-11'));
  assert.ok(sql.includes('CAST("plan"."scheduled_date" AS text)'));
  assert.equal(sql.includes('plan.scheduledDate::text'), false);
});
const owner = crypto.randomUUID();
const other = crypto.randomUUID();
const sessionId = crypto.randomUUID();
let db, server, base, token;

function database() {
  const attempts = [], plans = [], submissions = [], queries = [];
  const completed = params => attempts.filter(row => row.userId === params.userId && row.status === params.status
    && row.endedAt != null && row.endedAt >= params.start && row.endedAt < params.end);
  const scheduled = params => plans.filter(row => row.userId === params.userId && row.status === params.status
    && row.deletedAt == null && row.scheduledDate >= params.first && row.scheduledDate < params.next);
  const getRepository = entity => ({
    createQueryBuilder: () => {
      const params = {}, joins = [], selections = [];
      const builder = {};
      for (const method of ['where', 'andWhere']) builder[method] = (sql, values) => { Object.assign(params, values); queries.push({ entity, method, sql }); return builder; };
      for (const method of ['select', 'addSelect']) builder[method] = (...args) => { selections.push(args); return builder; };
      for (const method of ['orderBy', 'addOrderBy', 'groupBy']) builder[method] = () => builder;
      builder.leftJoinAndSelect = (...args) => { joins.push(args); return builder; };
      builder.getMany = async () => {
        queries.push({ entity, params: { ...params }, joins });
        return completed(params).sort((a, b) => b.endedAt - a.endedAt || b.attemptId.localeCompare(a.attemptId));
      };
      builder.getRawMany = async () => {
        queries.push({ entity, params: { ...params }, joins, selections });
        const rows = entity === LearningAttempt ? completed(params) : scheduled(params);
        const grouped = new Map();
        for (const row of rows) {
          const date = entity === LearningAttempt ? dates.seoulDate(row.endedAt) : row.scheduledDate;
          grouped.set(date, (grouped.get(date) || 0) + 1);
        }
        return [...grouped].map(([date, count]) => ({ date, count: String(count) }));
      };
      return builder;
    },
    find: async options => {
      queries.push({ entity, options });
      if (entity === QuestionSubmission) return submissions.filter(row => options.where.attemptId.value.includes(row.attemptId));
      assert.equal(entity, StudyPlan);
      assert.equal(options.where.deletedAt.type, 'isNull');
      return plans.filter(row => row.userId === options.where.userId && row.scheduledDate === options.where.scheduledDate
        && row.status === options.where.status && row.deletedAt == null);
    },
    findOne: async options => {
      assert.equal(entity, UserSession);
      return options.where.userId === owner ? { sessionId, userId: owner } : null;
    },
    save: () => assert.fail('calendar reads must not save'), update: () => assert.fail('calendar reads must not update'), delete: () => assert.fail('calendar reads must not delete'),
  });
  const manager = { getRepository, query: async (sql, [userId, end, today]) => {
    queries.push({ sql, userId, end, today });
    assert.ok(sql.includes('SELECT DISTINCT'));
    assert.ok(sql.includes('ROW_NUMBER()'));
    assert.ok(sql.includes("status = 'PASSED'"));
    const unique = new Set(attempts.filter(row => row.userId === userId && row.status === 'PASSED' && row.endedAt && row.endedAt < end).map(row => dates.seoulDate(row.endedAt)));
    let cursor = unique.has(today) ? today : dates.seoulDate(new Date(dates.dayRange(today).start.getTime() - 86400000));
    let count = 0;
    while (unique.has(cursor)) {
      count++;
      cursor = dates.seoulDate(new Date(dates.dayRange(cursor).start.getTime() - 86400000));
    }
    return [{ streakDays: count }];
  } };
  return { attempts, plans, submissions, queries, manager, transaction: async (level, callback) => {
    assert.equal(level, 'REPEATABLE READ'); return callback(manager);
  } };
}
test.beforeEach(async () => {
  db = database();
  env.jwtAccessSecret = 'calendar-read-test-key';
  token = issueAccessToken({ userId: owner }, sessionId);
  test.mock.method(AppDataSource, 'transaction', db.transaction);
  test.mock.method(AppDataSource.manager, 'getRepository', db.manager.getRepository);
  server = await require('./helpers/listen-test-server')(app);
  base = `http://127.0.0.1:${server.address().port}/api/v1/calendar`;
});
test.afterEach(async () => {
  await new Promise(resolve => server.close(resolve)); test.mock.restoreAll(); env.jwtAccessSecret = originalSecret;
});
const topic = { topicId: crypto.randomUUID(), title: '경제' };
const stage = { stageId: crypto.randomUUID(), stageCode: '1-1', stageType: 'NORMAL', title: '금리', topic };
function addAttempt(endedAt, values = {}) {
  const row = { attemptId: crypto.randomUUID(), userId: owner, stageId: stage.stageId, stage, attemptNo: 1,
    attemptType: 'PLAY', mode: 'START', status: 'PASSED', endReason: 'MONSTER_DEFEATED',
    startedAt: new Date('2026-11-01T00:00:00Z'), endedAt: endedAt ? new Date(endedAt) : null, ...values };
  db.attempts.push(row); return row;
}
function addPlan(values = {}) {
  const row = { planId: crypto.randomUUID(), userId: owner, scheduledDate: '2026-11-02', stageId: stage.stageId,
    stage, conceptId: null, title: '목표', planType: 'NEW_LEARNING', status: 'PLANNED', deletedAt: null,
    completedAt: null, createdAt: new Date(), updatedAt: new Date(), ...values };
  db.plans.push(row); return row;
}
async function get(path, accessToken = token) {
  const result = await fetch(base + path, { headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} });
  return { status: result.status, body: await result.json() };
}
const monthly = month => readService(db, { now: () => new Date('2026-11-02T03:00:00Z') }).month(owner, month);

test('daily returns multiple completed records, planned schedules and existing history calculations', async () => {
  const a = addAttempt('2026-11-02T00:00:00Z');
  addAttempt('2026-11-02T01:00:00Z', { attemptType: 'RELEARN', stage: { ...stage, stageType: 'BOSS' } });
  db.submissions.push({ attemptId: a.attemptId, isCorrect: true }, { attemptId: a.attemptId, isCorrect: false }, { attemptId: a.attemptId, isCorrect: true });
  addPlan(); addPlan({ title: '다른 목표' });
  const result = await get('/days/2026-11-02');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.learningRecords.length, 2);
  assert.equal(result.body.data.schedules.length, 2);
  const record = result.body.data.learningRecords.find(row => row.recordId === a.attemptId);
  assert.equal(record.accuracyPercentage, 66.7);
  assert.equal(record.correctCount, 2);
  assert.equal(record.submittedCount, 3);
  assert.equal(record.completedAt, a.endedAt.toISOString());
  assert.equal(record.elapsedSeconds, (a.endedAt - a.startedAt) / 1000);
  assert.equal(result.body.data.schedules[0].goal, '목표');
  assert.equal('emptyMessage' in result.body.data, false);
});
test('empty day and empty month return arrays and zero counters without generating records', async () => {
  const result = await get('/days/2026-11-02');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, { date: '2026-11-02', timeZone: 'Asia/Seoul', learningRecords: [], schedules: [],
    emptyMessage: '해당 날짜에 등록된 학습 일정이나 완료한 학습이 없습니다.' });
  const monthlyResponse = await get('?month=2026-11');
  assert.equal(monthlyResponse.status, 200);
  const month = monthlyResponse.body.data;
  assert.equal(month.days.length, 30); assert.equal(month.completedDayCount, 0); assert.equal(month.streakDays, 0);
  assert.ok(month.days.every(row => row.completedCount === 0 && row.scheduledCount === 0));
  assert.equal(month.emptyMessage, '아직 등록된 학습 일정이나 완료한 학습이 없습니다.');
});
test('deleted and DONE plans are excluded while learning completion remains independent', async () => {
  addAttempt('2026-11-02T00:00:00Z');
  addPlan({ deletedAt: new Date() }); addPlan({ status: 'DONE', completedAt: new Date() }); addPlan();
  const day = (await get('/days/2026-11-02')).body.data;
  assert.equal(day.learningRecords.length, 1); assert.equal(day.schedules.length, 1);
  assert.equal('emptyMessage' in day, false);
  const month = await monthly('2026-11');
  assert.equal(month.days[1].completedCount, 1); assert.equal(month.days[1].scheduledCount, 1);
  assert.equal('emptyMessage' in month, false);
});
test('PASSED without endedAt, failed and in-progress attempts do not count as completion', async () => {
  addAttempt(null); addAttempt('2026-11-02T00:00:00Z', { status: 'FAILED' });
  addAttempt('2026-11-02T00:00:00Z', { status: 'IN_PROGRESS' }); addPlan({ status: 'DONE' });
  assert.equal((await get('/days/2026-11-02')).body.data.learningRecords.length, 0);
  assert.equal((await get('/days/2026-11-02')).body.data.emptyMessage, '해당 날짜에 등록된 학습 일정이나 완료한 학습이 없습니다.');
  const month = await monthly('2026-11');
  assert.equal(month.completedDayCount, 0);
  assert.equal(month.emptyMessage, '아직 등록된 학습 일정이나 완료한 학습이 없습니다.');
});
test('either planned schedules or completed learning suppresses empty messages', async () => {
  addPlan();
  let day = (await get('/days/2026-11-02')).body.data;
  let month = (await get('?month=2026-11')).body.data;
  assert.equal('emptyMessage' in day, false);
  assert.equal('emptyMessage' in month, false);
  db.plans.length = 0;
  addAttempt('2026-11-02T00:00:00Z');
  day = (await get('/days/2026-11-02')).body.data;
  month = (await get('?month=2026-11')).body.data;
  assert.equal('emptyMessage' in day, false);
  assert.equal('emptyMessage' in month, false);
});
test('month counts unique days and keeps schedule and completion indicators separate', async () => {
  addAttempt('2026-11-02T00:00:00Z'); addAttempt('2026-11-02T01:00:00Z'); addAttempt('2026-11-03T00:00:00Z');
  addPlan(); addPlan({ scheduledDate: '2026-11-04' });
  const month = await monthly('2026-11');
  assert.equal(month.completedDayCount, 2);
  assert.equal(month.days[1].completedCount, 2); assert.equal(month.days[1].scheduledCount, 1);
  assert.equal(month.days[2].hasCompletedLearning, true); assert.equal(month.days[2].hasScheduledLearning, false);
  assert.equal(month.days[3].hasCompletedLearning, false); assert.equal(month.days[3].hasScheduledLearning, true);
});
test('streak accepts today or yesterday, deduplicates and crosses month boundary', async () => {
  addAttempt('2026-10-30T15:00:00Z'); addAttempt('2026-10-31T15:00:00Z');
  let data = await monthly('2025-01');
  assert.equal(data.streakDays, 2); assert.equal(data.streakAsOfDate, '2026-11-02');
  assert.equal(data.streakPolicy, 'TODAY_OR_YESTERDAY');
  assert.equal(data.emptyMessage, '아직 등록된 학습 일정이나 완료한 학습이 없습니다.');
  addAttempt('2026-11-01T15:00:00Z'); addAttempt('2026-11-01T16:00:00Z');
  data = await monthly('2026-11'); assert.equal(data.streakDays, 3);
});
test('streak is zero after a missed yesterday and ignores future completion', async () => {
  addAttempt('2026-10-30T15:00:00Z'); addAttempt('2026-11-03T00:00:00Z');
  assert.equal((await monthly('2026-11')).streakDays, 0);
});
test('Seoul midnight boundaries are start-inclusive/end-exclusive and use completion date', async () => {
  addAttempt('2026-11-01T14:59:59.999Z');
  const included = addAttempt('2026-11-01T15:00:00Z');
  addAttempt('2026-11-02T15:00:00Z');
  const records = (await get('/days/2026-11-02')).body.data.learningRecords;
  assert.deepEqual(records.map(row => row.recordId), [included.attemptId]);
  assert.equal(records[0].learningDate, '2026-11-01');
  const query = db.queries.find(row => row.params?.start);
  assert.equal(query.params.start.toISOString(), '2026-11-01T15:00:00.000Z');
  assert.equal(query.params.end.toISOString(), '2026-11-02T15:00:00.000Z');
});
test('month ranges handle last days, leap years and December/January independently of host timezone', () => {
  assert.equal(dates.monthRange('2028-02').dates.length, 29);
  assert.equal(dates.monthRange('2026-02').dates.length, 28);
  assert.equal(dates.monthRange('2026-11').end.toISOString(), '2026-11-30T15:00:00.000Z');
  const december = dates.monthRange('2026-12');
  assert.equal(december.dates.length, 31); assert.equal(december.end.toISOString(), '2026-12-31T15:00:00.000Z');
  assert.equal(december.next, '2027-01-01');
});
test('invalid dates/months and owner override queries are rejected', async () => {
  for (const path of ['/days/2026-02-29', '/days/2026-11-31', '/days/2026-1-01', '', '?month=2026-13', '?month=0000-01', '?month=2026-1', '?month=2026-11&month=2026-12', `?month=2026-11&userId=${other}`, `/days/2026-11-02?userId=${other}`]) {
    assert.equal((await get(path)).status, 422, path);
  }
});
test('owner filtering and JWT authentication protect both endpoints', async () => {
  addAttempt('2026-11-02T00:00:00Z', { userId: other }); addPlan({ userId: other });
  assert.equal((await get('/days/2026-11-02')).body.data.emptyMessage, '해당 날짜에 등록된 학습 일정이나 완료한 학습이 없습니다.');
  assert.equal((await get('?month=2026-11')).body.data.emptyMessage, '아직 등록된 학습 일정이나 완료한 학습이 없습니다.');
  for (const path of ['/days/2026-11-02', '?month=2026-11']) {
    assert.equal((await get(path, '')).status, 401); assert.equal((await get(path, 'invalid')).status, 401);
  }
});
test('database failures remain 503 errors instead of empty results', async () => {
  AppDataSource.transaction.mock.mockImplementation(async () => {
    const error = new Error('query failed');
    error.name = 'QueryFailedError';
    throw error;
  });
  for (const path of ['/days/2026-11-02', '?month=2026-11']) {
    const result = await get(path);
    assert.equal(result.status, 503);
    assert.equal(result.body.success, false);
    assert.equal('emptyMessage' in result.body, false);
  }
});
test('month uses aggregate queries without joins or loading full history; GET does not change data', async () => {
  addAttempt('2026-11-02T00:00:00Z'); addPlan();
  const before = JSON.stringify([db.attempts, db.plans]);
  await monthly('2026-11');
  const aggregates = db.queries.filter(row => row.selections);
  assert.equal(aggregates.length, 2); assert.ok(aggregates.every(row => row.joins.length === 0));
  assert.equal(db.queries.filter(row => row.sql?.includes('WITH dates')).length, 1);
  assert.equal(JSON.stringify([db.attempts, db.plans]), before);
});
test('Swagger exposes both authenticated GETs without changing existing mutations/history', async () => {
  const spec = await (await fetch(base.replace('/api/v1/calendar', '/api-docs.json'))).json();
  for (const path of ['/api/v1/calendar', '/api/v1/calendar/days/{date}']) {
    const op = spec.paths[path].get;
    assert.deepEqual(op.security, [{ bearerAuth: [] }]);
    for (const status of [200, 401, 422, 503]) assert.ok(op.responses[status]);
  }
  assert.ok(spec.paths['/api/v1/calendar/plans'].post);
  assert.ok(spec.paths['/api/v1/learning/history'].get);
  const month = (await get('?month=2026-11')).body.data;
  for (const key of spec.components.schemas.CalendarMonthResponse.properties.data.required) assert.ok(key in month);
  for (const path of ['/api/v1/calendar', '/api/v1/calendar/days/{date}']) {
    const examples = spec.paths[path].get.responses[200].content['application/json'].examples;
    assert.ok(examples.populated.value.data);
    assert.ok(examples.empty.value.data.emptyMessage);
    assert.equal('emptyMessage' in examples.populated.value.data, false);
  }
});
