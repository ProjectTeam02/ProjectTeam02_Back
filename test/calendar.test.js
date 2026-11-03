const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { StudyPlan, Topic, Stage, Concept, StageConcept, UserSession, LearningAttempt, QuestionSubmission, ReviewAttempt } = require('@leren/database');
const app = require('../src/app');
const env = require('../src/config/env');
const { AppDataSource } = require('../src/config/database');
const { issueAccessToken } = require('../src/common/utils/token.util');
const schedules = require('../src/modules/calendar/schedule.repository');

const ids = Object.fromEntries(['owner', 'other', 'session', 'otherSession', 'topic', 'topic2', 'stage', 'stage2', 'concept', 'concept2'].map(name => [name, crypto.randomUUID()]));
const originalSecret = env.jwtAccessSecret;
let db;
let server;
let base;
let ownerToken;
let otherToken;

// All repositories and transactions are in memory. No actual DB connection is initialized.
function database() {
  let tables = new Map([StudyPlan, Topic, Stage, Concept, StageConcept, UserSession, LearningAttempt, QuestionSubmission, ReviewAttempt].map(entity => [entity, []]));
  const writes = [];
  const queries = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (value?.type === 'isNull') return row[key] == null;
    if (value?.type === 'moreThan') return row[key] > value.value;
    return row[key] === value;
  });
  const getRepository = entity => ({
    findOne: async options => {
      queries.push({ entity, ...options });
      const row = tables.get(entity).find(item => matches(item, options.where));
      return row ? structuredClone(row) : null;
    },
    create: data => ({ ...data }),
    save: async row => {
      assert.equal(entity, StudyPlan, 'calendar must write only StudyPlan');
      writes.push(entity);
      const saved = { ...row, planId: row.planId || crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date() };
      tables.get(entity).push(structuredClone(saved));
      return saved;
    },
    update: async (where, values) => {
      assert.equal(entity, StudyPlan, 'calendar must write only StudyPlan');
      writes.push(entity);
      let affected = 0;
      for (const row of tables.get(entity)) {
        if (matches(row, where)) { Object.assign(row, values, { updatedAt: new Date() }); affected++; }
      }
      return { affected };
    },
  });
  const manager = { getRepository };
  return {
    manager, writes, queries, rows: entity => tables.get(entity),
    transaction: async callback => {
      const before = new Map([...tables].map(([entity, rows]) => [entity, structuredClone(rows)]));
      try { return await callback(manager); } catch (error) { tables = before; throw error; }
    },
  };
}

test.beforeEach(async () => {
  db = database();
  env.jwtAccessSecret = 'calendar-test-access-secret';
  db.rows(Topic).push({ topicId: ids.topic, title: '경제 기초' }, { topicId: ids.topic2, title: '금융' });
  db.rows(Stage).push({ stageId: ids.stage, topicId: ids.topic }, { stageId: ids.stage2, topicId: ids.topic2 });
  db.rows(Concept).push({ conceptId: ids.concept, topicId: ids.topic }, { conceptId: ids.concept2, topicId: ids.topic2 });
  db.rows(StageConcept).push({ stageId: ids.stage, conceptId: ids.concept });
  for (const [userId, sessionId] of [[ids.owner, ids.session], [ids.other, ids.otherSession]]) {
    db.rows(UserSession).push({ userId, sessionId, revokedAt: null, expiresAt: new Date(Date.now() + 60000) });
  }
  ownerToken = issueAccessToken({ userId: ids.owner }, ids.session);
  otherToken = issueAccessToken({ userId: ids.other }, ids.otherSession);
  test.mock.method(AppDataSource, 'transaction', db.transaction);
  test.mock.method(AppDataSource.manager, 'getRepository', db.manager.getRepository);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
  test.mock.restoreAll();
  env.jwtAccessSecret = originalSecret;
});

const input = overrides => ({ scheduledDate: '2026-11-02', topicId: ids.topic, stageId: ids.stage, planType: 'NEW_LEARNING', goal: '금리 개념 이해하기', ...overrides });
async function request(method, path = '', body, token = ownerToken) {
  const response = await fetch(`${base}/api/v1/calendar/plans${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
async function create(overrides) {
  const result = await request('POST', '', input(overrides));
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

test('create persists owner, separate goal and subject, and PLANNED defaults', async () => {
  const data = await create();
  const stored = db.rows(StudyPlan)[0];
  assert.equal(stored.userId, ids.owner);
  assert.equal(stored.title, '금리 개념 이해하기');
  assert.equal(stored.stageId, ids.stage);
  assert.equal(stored.conceptId, null);
  assert.equal(stored.status, 'PLANNED');
  assert.equal(stored.completedAt, null);
  assert.equal(stored.deletedAt, null);
  assert.deepEqual(data.topic, { topicId: ids.topic, title: '경제 기초' });
  assert.equal(data.goal, stored.title);
  assert.equal(data.scheduledDate, '2026-11-02');
  assert.equal(data.title, undefined);
  assert.equal(data.userId, undefined);
});

test('concept-only and linked Stage/Concept schedules are supported', async () => {
  const concept = await create({ stageId: null, conceptId: ids.concept, planType: 'REVIEW' });
  assert.equal(concept.stageId, null);
  assert.equal(concept.conceptId, ids.concept);
  const both = await create({ conceptId: ids.concept });
  assert.equal(both.stageId, ids.stage);
  assert.equal(both.conceptId, ids.concept);
});

test('PATCH preserves omitted fields and maps only goal to title', async () => {
  const plan = await create({ conceptId: ids.concept });
  const result = await request('PATCH', `/${plan.planId}`, { goal: '  복습 목표  ' });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.goal, '복습 목표');
  for (const key of ['scheduledDate', 'stageId', 'conceptId', 'planType', 'status', 'completedAt', 'createdAt']) {
    assert.deepEqual(result.body.data[key], plan[key]);
  }
  assert.deepEqual(result.body.data.topic, plan.topic);
  assert.equal(db.rows(StudyPlan)[0].title, '복습 목표');
});

test('PATCH changes date, target topic and type while explicit null removes only that target', async () => {
  const plan = await create({ conceptId: ids.concept });
  const result = await request('PATCH', `/${plan.planId}`, {
    scheduledDate: '2028-02-29', topicId: ids.topic2, stageId: ids.stage2, conceptId: null, planType: 'REVIEW',
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.scheduledDate, '2028-02-29');
  assert.equal(result.body.data.topic.topicId, ids.topic2);
  assert.equal(result.body.data.conceptId, null);
  assert.equal(db.rows(StudyPlan)[0].stageId, ids.stage2);
  assert.equal(db.rows(StudyPlan)[0].planType, 'REVIEW');
});

test('soft delete retains physical row, hides active lookup and rejects subsequent mutations', async () => {
  const plan = await create();
  const deleted = await request('DELETE', `/${plan.planId}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.deleted, true);
  assert.ok(deleted.body.data.deletedAt);
  assert.equal(db.rows(StudyPlan).length, 1);
  assert.ok(db.rows(StudyPlan)[0].deletedAt instanceof Date);
  assert.equal(await schedules(db.manager).findActive(ids.owner, plan.planId), null);
  assert.equal((await request('PATCH', `/${plan.planId}`, { goal: '수정' })).status, 404);
  assert.equal((await request('DELETE', `/${plan.planId}`)).status, 404);
});

test('another user and unknown IDs have the same 404 without altering the plan', async () => {
  const plan = await create();
  const before = structuredClone(db.rows(StudyPlan));
  for (const [method, body] of [['PATCH', { goal: '공격' }], ['DELETE', undefined]]) {
    const denied = await request(method, `/${plan.planId}`, body, otherToken);
    assert.equal(denied.status, 404);
    const absent = await request(method, `/${crypto.randomUUID()}`, body);
    assert.equal(absent.status, 404);
    assert.equal(denied.body.code, 'NOT_FOUND');
    assert.equal(denied.body.message, absent.body.message);
  }
  assert.deepEqual(db.rows(StudyPlan), before);
});

test('authentication is mandatory and expired/revoked sessions cannot access mutations', async () => {
  for (const token of ['', 'invalid-token']) {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      assert.equal((await request(method, method === 'POST' ? '' : `/${crypto.randomUUID()}`, input(), token)).status, 401);
    }
  }
  db.rows(UserSession)[0].revokedAt = new Date();
  assert.equal((await request('POST', '', input())).status, 401);
  assert.equal(db.rows(StudyPlan).length, 0);
});

test('invalid calendar dates, types, goals and unknown fields fail without storage', async () => {
  for (const values of [
    { scheduledDate: '2026-02-29' }, { scheduledDate: '2026-11-31' }, { scheduledDate: '0000-01-01' },
    { scheduledDate: '2026-1-01' }, { scheduledDate: '2026-11-02T00:00:00+09:00' },
    { scheduledDate: null }, { planType: 'OTHER' }, { goal: ' ' }, { goal: '가'.repeat(31) }, { goal: null },
    { userId: ids.other }, { title: '목표 혼동' }, { status: 'DONE' }, { completedAt: new Date().toISOString() },
    { topicId: 'invalid' }, { stageId: 123 },
  ]) {
    const result = await request('POST', '', input(values));
    assert.equal(result.status, 422, JSON.stringify(values));
    assert.equal(result.body.code, 'VALIDATION_ERROR');
  }
  assert.equal((await request('POST', '', {})).status, 422);
  assert.equal((await request('POST', '', [])).status, 422);
  assert.equal(db.rows(StudyPlan).length, 0);
});

test('goal length matches Unicode character count and valid leap dates remain date-only', async () => {
  const plan = await create({ scheduledDate: '2028-02-29', goal: '😀'.repeat(30) });
  assert.equal(plan.goal, '😀'.repeat(30));
  assert.equal(db.rows(StudyPlan)[0].scheduledDate, '2028-02-29');
  assert.equal((await request('POST', '', input({ goal: '😀'.repeat(31) }))).status, 422);
});

test('nonexistent subjects and mismatched topic/content links are rejected', async () => {
  for (const values of [
    { topicId: crypto.randomUUID() }, { stageId: crypto.randomUUID() },
    { stageId: null, conceptId: crypto.randomUUID() },
    { topicId: ids.topic2 }, { conceptId: ids.concept2 },
  ]) assert.equal((await request('POST', '', input(values))).status, 422);
  db.rows(StageConcept).splice(0);
  assert.equal((await request('POST', '', input({ conceptId: ids.concept }))).status, 422);
  assert.equal(db.rows(StudyPlan).length, 0);
});

test('Topic-only storage is explicitly rejected instead of losing the subject', async () => {
  const result = await request('POST', '', input({ stageId: null, conceptId: null }));
  assert.equal(result.status, 422);
  assert.equal(result.body.details.reason, 'TOPIC_ONLY_NOT_SUPPORTED');
  assert.equal(db.rows(StudyPlan).length, 0);
});

test('invalid PATCH and unsupported target clearing leave all previous fields unchanged', async () => {
  const plan = await create();
  const before = structuredClone(db.rows(StudyPlan));
  for (const body of [{}, { userId: ids.other }, { stageId: null }, { topicId: ids.topic2 }, { goal: '有効', conceptId: ids.concept2 }]) {
    assert.equal((await request('PATCH', `/${plan.planId}`, body)).status, 422);
  }
  assert.deepEqual(db.rows(StudyPlan), before);
  assert.equal((await request('PATCH', '/not-uuid', { goal: '목표' })).status, 422);
  assert.equal((await request('DELETE', '/not-uuid')).status, 422);
});

test('schedule mutation preserves completed learning, quiz answers, review records and DONE state', async () => {
  const history = [LearningAttempt, QuestionSubmission, ReviewAttempt];
  history.forEach(entity => db.rows(entity).push({ id: crypto.randomUUID(), marker: 'preserve' }));
  const before = history.map(entity => structuredClone(db.rows(entity)));
  const plan = await create();
  const completedAt = new Date('2026-11-01T00:00:00Z');
  Object.assign(db.rows(StudyPlan)[0], { status: 'DONE', completedAt });
  const changed = await request('PATCH', `/${plan.planId}`, { goal: '수정 목표' });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.status, 'DONE');
  assert.equal(changed.body.data.completedAt, completedAt.toISOString());
  assert.equal((await request('DELETE', `/${plan.planId}`)).status, 200);
  history.forEach((entity, index) => assert.deepEqual(db.rows(entity), before[index]));
  assert.ok(db.writes.every(entity => entity === StudyPlan));
});

test('multiple schedules on one date are retained and mutation queries include owner/deleted conditions', async () => {
  const first = await create();
  const second = await create({ goal: '두 번째 목표' });
  assert.notEqual(first.planId, second.planId);
  assert.equal(db.rows(StudyPlan).length, 2);
  await request('PATCH', `/${first.planId}`, { goal: '새 목표' });
  assert.ok(db.queries.some(query => query.entity === StudyPlan && query.lock?.mode === 'pessimistic_write'
    && query.where.userId === ids.owner && query.where.deletedAt.type === 'isNull'));
});

test('Swagger contains only the three new mutations and matches goal/topic response contracts', async () => {
  const spec = await (await fetch(`${base}/api-docs.json`)).json();
  const collection = spec.paths['/api/v1/calendar/plans'];
  const item = spec.paths['/api/v1/calendar/plans/{planId}'];
  assert.deepEqual(Object.keys(collection), ['post']);
  assert.deepEqual(Object.keys(item).sort(), ['delete', 'patch']);
  for (const operation of [collection.post, item.patch, item.delete]) {
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    assert.ok(operation.responses[401]);
    assert.ok(operation.responses[422]);
    assert.ok(operation.responses[503]);
  }
  assert.ok(collection.post.responses[201]);
  assert.ok(item.patch.responses[200]);
  assert.ok(item.delete.responses[200]);
  assert.equal(spec.components.schemas.ScheduleCreateRequest.additionalProperties, false);
  assert.deepEqual(spec.components.schemas.ScheduleCreateRequest.required, ['scheduledDate', 'topicId', 'planType', 'goal']);
  const plan = await create();
  for (const field of spec.components.schemas.Schedule.required) assert.ok(field in plan, field);
  assert.equal((await fetch(`${base}/api/v1/calendar/plans`, { headers: { authorization: `Bearer ${ownerToken}` } })).status, 404);
});
