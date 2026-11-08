const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { LearningAttempt, QuestionSubmission, UserSession, Stage, Topic, Question, QuestionChoice, Concept, ReviewAttempt, UserStageProgress } = require('@leren/database');
const app = require('../src/app');
const env = require('../src/config/env');
const { AppDataSource } = require('../src/config/database');
const { issueAccessToken } = require('../src/common/utils/token.util');

const ids = Object.fromEntries(['owner', 'other', 'session', 'otherSession', 'stage', 'topic', 'concept'].map(name => [name, crypto.randomUUID()]));
const originalSecret = env.jwtAccessSecret;
let db;
let server;
let base;
let token;

function database() {
  const tables = new Map([LearningAttempt, QuestionSubmission, UserSession, Stage, Topic, Question, QuestionChoice, Concept, ReviewAttempt, UserStageProgress].map(entity => [entity, []]));
  const queries = [];
  const isolations = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (value?.type === 'isNull') return row[key] == null;
    if (value?.type === 'moreThan') return row[key] > value.value;
    if (value?.type === 'in') return value.value.includes(row[key]);
    return row[key] === value;
  });
  const ordered = (rows, order = {}) => rows.sort((a, b) => {
    for (const [key, direction] of Object.entries(order)) {
      if (a[key] < b[key]) return direction === 'DESC' ? 1 : -1;
      if (a[key] > b[key]) return direction === 'DESC' ? -1 : 1;
    }
    return 0;
  });
  const hydrate = (entity, row, relations) => {
    const result = structuredClone(row);
    if (entity === LearningAttempt && relations?.stage) {
      result.stage = structuredClone(tables.get(Stage).find(stage => stage.stageId === row.stageId) || null);
      if (result.stage) result.stage.topic = structuredClone(tables.get(Topic).find(topic => topic.topicId === result.stage.topicId) || null);
    }
    if (entity === QuestionSubmission && relations) {
      result.question = structuredClone(tables.get(Question).find(question => question.questionId === row.questionId) || null);
      if (result.question) result.question.concept = structuredClone(tables.get(Concept).find(concept => concept.conceptId === result.question.conceptId) || null);
      result.choice = structuredClone(tables.get(QuestionChoice).find(choice => choice.choiceId === row.choiceId && choice.questionId === row.questionId) || null);
    }
    return result;
  };
  const getRepository = entity => {
    assert.ok(tables.has(entity), 'unexpected entity read');
    return {
      findOne: async options => {
        queries.push({ entity, method: 'findOne', options });
        const row = tables.get(entity).find(item => matches(item, options.where));
        return row ? hydrate(entity, row, options.relations) : null;
      },
      findAndCount: async options => {
        queries.push({ entity, method: 'findAndCount', options });
        const rows = ordered(tables.get(entity).filter(row => matches(row, options.where)), options.order);
        return [rows.slice(options.skip, options.skip + options.take).map(row => hydrate(entity, row, options.relations)), rows.length];
      },
      find: async options => {
        queries.push({ entity, method: 'find', options });
        return ordered(tables.get(entity).filter(row => matches(row, options.where)), options.order).map(row => {
          if (options.select) return Object.fromEntries(Object.keys(options.select).map(key => [key, row[key]]));
          return hydrate(entity, row, options.relations);
        });
      },
      save: () => assert.fail('history must not save data'),
      update: () => assert.fail('history must not update data'),
      delete: () => assert.fail('history must not delete data'),
    };
  };
  const manager = { getRepository };
  return { rows: entity => tables.get(entity), queries, isolations, manager,
    transaction: async (isolation, callback) => {
      assert.equal(isolation, 'REPEATABLE READ');
      isolations.push(isolation);
      return callback(manager);
    },
  };
}

test.beforeEach(async () => {
  db = database();
  env.jwtAccessSecret = 'history-test-access-secret';
  db.rows(UserSession).push({ userId: ids.owner, sessionId: ids.session, revokedAt: null, expiresAt: new Date(Date.now() + 60000) });
  db.rows(Topic).push({ topicId: ids.topic, title: '경제 기초' });
  db.rows(Stage).push({ stageId: ids.stage, topicId: ids.topic, title: '금리', stageCode: '1-1', stageType: 'NORMAL', status: 'ARCHIVED' });
  db.rows(Concept).push({ conceptId: ids.concept, conceptCode: 'ECO_001', version: 1, title: '과거 개념', status: 'ARCHIVED' });
  token = issueAccessToken({ userId: ids.owner }, ids.session);
  test.mock.method(AppDataSource, 'transaction', db.transaction);
  test.mock.method(AppDataSource.manager, 'getRepository', db.manager.getRepository);
  server = await require('./helpers/listen-test-server')(app);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
  test.mock.restoreAll();
  env.jwtAccessSecret = originalSecret;
});

function attempt(overrides = {}) {
  const row = {
    attemptId: crypto.randomUUID(), userId: ids.owner, stageId: ids.stage,
    attemptNo: 1, attemptType: 'PLAY', mode: 'START', status: 'PASSED', endReason: 'MONSTER_DEFEATED',
    startedAt: new Date('2026-11-01T15:30:00Z'), endedAt: new Date('2026-11-01T15:32:00Z'),
    submittedCount: 0, correctCount: 0, maxQuestionCount: 3, ...overrides,
  };
  db.rows(LearningAttempt).push(row);
  return row;
}
function submit(parent, isCorrect, sequenceNo = 1, overrides = {}) {
  const questionId = crypto.randomUUID();
  const choiceId = crypto.randomUUID();
  db.rows(Question).push({ questionId, questionCode: `Q${sequenceNo}`, version: 1, conceptId: ids.concept,
    questionText: '과거 문제', explanation: '저장된 과거 해설', status: 'RETIRED' });
  db.rows(QuestionChoice).push({ questionId, choiceId, choiceText: '선택한 과거 답안', isCorrect: !isCorrect });
  const row = { submissionId: crypto.randomUUID(), attemptId: parent.attemptId, questionId, choiceId, isCorrect,
    sequenceNo, selectedPosition: 2, displayedChoiceOrder: [choiceId], submittedAt: new Date('2026-11-01T15:31:00Z'), responseTimeMs: 1500, ...overrides };
  db.rows(QuestionSubmission).push(row);
  return row;
}
async function get(path = '', accessToken = token) {
  const response = await fetch(`${base}/api/v1/learning/history${path}`, {
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  });
  return { status: response.status, body: await response.json() };
}
const detail = row => get(`/LEARNING/${row.attemptId}`);

test('history lists only owner LearningAttempts, without ReviewAttempt or progress synthesis', async () => {
  const own = attempt();
  submit(own, true);
  const other = attempt({ userId: ids.other });
  submit(other, false);
  db.rows(ReviewAttempt).push({ userId: ids.owner, reviewAttemptId: crypto.randomUUID(), status: 'COMPLETED' });
  db.rows(UserStageProgress).push({ userId: ids.owner, stageId: ids.stage, progressStatus: 'PASSED' });
  const result = await get();
  assert.equal(result.status, 200);
  assert.equal(result.body.data.total, 1);
  assert.equal(result.body.data.items[0].recordId, own.attemptId);
  assert.equal(result.body.data.items[0].submittedCount, 1);
  assert.equal(result.body.data.items[0].topic.title, '경제 기초');
  assert.equal(result.body.data.items[0].stage.stageCode, '1-1');
  assert.equal(result.body.data.items[0].learningDate, '2026-11-02');
  assert.equal('emptyMessage' in result.body.data, false);
  assert.ok(db.queries.every(query => ![ReviewAttempt, UserStageProgress].includes(query.entity)));
  const countQuery = db.queries.find(query => query.entity === QuestionSubmission);
  assert.deepEqual(countQuery.options.where.attemptId.value, [own.attemptId]);
});

test('no records returns a normal empty page and does not query unrelated submissions', async () => {
  attempt({ userId: ids.other });
  const result = await get();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0,
    emptyMessage: '아직 학습 기록이 없습니다.' });
  assert.equal(db.queries.filter(query => query.entity === QuestionSubmission).length, 0);
});

test('history is sorted by start time then ID descending with stable pagination', async () => {
  const old = attempt({ startedAt: new Date('2026-10-01T00:00:00Z') });
  const low = attempt({ attemptId: '11111111-1111-4111-8111-111111111111' });
  const high = attempt({ attemptId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' });
  const first = await get('?page=1&pageSize=2');
  assert.deepEqual(first.body.data.items.map(row => row.recordId), [high.attemptId, low.attemptId]);
  assert.equal(first.body.data.totalPages, 2);
  const second = await get('?page=2&pageSize=2');
  assert.deepEqual(second.body.data.items.map(row => row.recordId), [old.attemptId]);
  assert.equal(second.body.data.total, 3);
  const beyond = await get('?page=3&pageSize=2');
  assert.deepEqual(beyond.body.data.items, []);
  assert.equal(beyond.body.data.total, 3);
  assert.equal('emptyMessage' in beyond.body.data, false);
});

test('stored statuses distinguish ongoing, passed, failed and abandoned attempts', async () => {
  const ongoing = attempt({ status: 'IN_PROGRESS', endedAt: null, endReason: null });
  attempt({ status: 'FAILED', endReason: 'QUESTIONS_EXHAUSTED' });
  attempt({ status: 'ABANDONED', endReason: 'ABANDONED' });
  attempt({ status: 'PASSED' });
  assert.equal((await get()).body.data.total, 4);
  const filtered = await get('?status=IN_PROGRESS');
  assert.equal(filtered.body.data.total, 1);
  assert.equal('emptyMessage' in filtered.body.data, false);
  const data = filtered.body.data.items[0];
  assert.equal(data.recordId, ongoing.attemptId);
  assert.equal(data.isFinished, false);
  assert.equal(data.completedAt, null);
  assert.equal(data.elapsedSeconds, null);
  const failed = (await get('?status=FAILED')).body.data.items[0];
  assert.equal(failed.isFinished, true);
  assert.equal(failed.completedAt, null);
});
test('filtered empty history has a message while an out-of-range page does not', async () => {
  attempt({ status: 'PASSED' });
  const filtered = await get('?status=FAILED&page=2&pageSize=1');
  assert.equal(filtered.status, 200);
  assert.deepEqual(filtered.body.data, { items: [], page: 2, pageSize: 1, total: 0, totalPages: 0,
    emptyMessage: '아직 학습 기록이 없습니다.' });
  const beyond = await get('?page=2&pageSize=1');
  assert.equal(beyond.status, 200);
  assert.equal(beyond.body.data.total, 1);
  assert.deepEqual(beyond.body.data.items, []);
  assert.equal('emptyMessage' in beyond.body.data, false);
});
test('history database failure remains a 503 error', async () => {
  AppDataSource.transaction.mock.mockImplementation(async () => {
    const error = new Error('query failed');
    error.name = 'QueryFailedError';
    throw error;
  });
  const result = await get();
  assert.equal(result.status, 503);
  assert.equal(result.body.success, false);
  assert.equal('emptyMessage' in result.body, false);
});

test('detail uses stored submissions and exact historical question/choice/concept IDs', async () => {
  const row = attempt();
  const second = submit(row, false, 2);
  const first = submit(row, true, 1);
  db.rows(Question).push({ questionId: crypto.randomUUID(), questionCode: 'Q1', version: 2, questionText: '새 버전으로 바뀌면 안 됨', explanation: '새 해설' });
  const result = await detail(row);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.submittedCount, 2);
  assert.equal(result.body.data.correctCount, 1);
  assert.deepEqual(result.body.data.submissions.map(item => item.submissionId), [first.submissionId, second.submissionId]);
  const answer = result.body.data.submissions[0];
  assert.equal(answer.question.questionId, first.questionId);
  assert.equal(answer.question.version, 1);
  assert.equal(answer.question.concept.version, 1);
  assert.equal(answer.selectedAnswer.choiceId, first.choiceId);
  assert.equal(answer.selectedAnswer.choiceText, '선택한 과거 답안');
  assert.equal(answer.isCorrect, true); // Not regraded from the deliberately different current choice flag.
  assert.equal(answer.explanation, '저장된 과거 해설');
  assert.equal(answer.submittedAt, first.submittedAt.toISOString());
  assert.equal(answer.responseTimeMs, 1500);
});

test('accuracy uses actual submitted questions: 2/2=100, 2/3=66.7, zero=null', async () => {
  const two = attempt();
  submit(two, true, 1); submit(two, true, 2);
  const three = attempt();
  submit(three, true, 1); submit(three, false, 2); submit(three, true, 3);
  const zero = attempt({ status: 'IN_PROGRESS', endedAt: null });
  for (const [row, expected] of [[two, 100], [three, 66.7], [zero, null]]) {
    assert.equal((await detail(row)).body.data.accuracyPercentage, expected);
  }
  const rows = (await get()).body.data.items;
  assert.equal(rows.find(row => row.recordId === three.attemptId).accuracyPercentage, 66.7);
});

test('submission rows remain the source when stored attempt counters disagree; GET never repairs them', async () => {
  const row = attempt({ submittedCount: 3, correctCount: 3 });
  submit(row, false);
  const data = (await detail(row)).body.data;
  assert.equal(data.submittedCount, 1);
  assert.equal(data.correctCount, 0);
  assert.equal(data.accuracyPercentage, 0);
  assert.equal(row.submittedCount, 3);
  assert.equal(row.correctCount, 3);
});

test('unknown and other-user attempts have identical 404 and never load their answers', async () => {
  const other = attempt({ userId: ids.other });
  submit(other, true);
  const denied = await detail(other);
  const absent = await get(`/LEARNING/${crypto.randomUUID()}`);
  assert.equal(denied.status, 404);
  assert.deepEqual(denied.body, absent.body);
  assert.equal(db.queries.filter(query => query.entity === QuestionSubmission).length, 0);
});

test('JWT and active session are mandatory for both GET endpoints', async () => {
  const row = attempt();
  for (const accessToken of ['', 'invalid-token']) {
    assert.equal((await get('', accessToken)).status, 401);
    assert.equal((await get(`/LEARNING/${row.attemptId}`, accessToken)).status, 401);
  }
  db.rows(UserSession)[0].expiresAt = new Date(0);
  assert.equal((await get()).status, 401);
  assert.equal(db.queries.filter(query => query.entity === LearningAttempt).length, 0);
});

test('invalid pagination, filters, unknown fields, UUID and unsupported review type are rejected', async () => {
  for (const query of ['?page=0', '?page=-1', '?page=1.5', '?page=2junk', '?page=9007199254740992', '?page=1&page=2',
    '?pageSize=101', '?pageSize=0', '?pageSize=', '?status=COMPLETED', `?userId=${ids.other}`, '?from=2026-11-01']) {
    assert.equal((await get(query)).status, 422, query);
  }
  assert.equal((await get('/REVIEW/11111111-1111-4111-8111-111111111111')).status, 422);
  assert.equal((await get('/LEARNING/not-uuid')).status, 422);
  assert.equal(db.queries.filter(query => query.entity === LearningAttempt).length, 0);
});

test('elapsed time is stored end minus start, never invented for missing/invalid times', async () => {
  const valid = attempt({ startedAt: new Date('2026-11-01T15:00:00Z'), endedAt: new Date('2026-11-01T15:00:01.500Z') });
  assert.equal((await detail(valid)).body.data.elapsedSeconds, 1.5);
  const missing = attempt({ endedAt: null });
  const missingData = (await detail(missing)).body.data;
  assert.equal(missingData.completedAt, null);
  assert.equal(missingData.elapsedSeconds, null);
  const invalid = attempt({ endedAt: new Date('2025-01-01T00:00:00Z') });
  assert.equal((await detail(invalid)).body.data.elapsedSeconds, null);
});

test('missing explanation/choice text/timing and empty displayed order are not synthesized', async () => {
  const row = attempt();
  const answer = submit(row, false, 1, { displayedChoiceOrder: [], responseTimeMs: null });
  delete db.rows(Question)[0].explanation;
  db.rows(QuestionChoice).splice(0);
  const data = (await detail(row)).body.data.submissions[0];
  assert.equal(data.explanation, null);
  assert.equal(data.selectedAnswer.choiceId, answer.choiceId);
  assert.equal(data.selectedAnswer.choiceText, null);
  assert.equal(data.responseTimeMs, null);
  assert.deepEqual(data.displayedChoiceOrder, []);
});

test('both APIs are read-only and use repeatable-read transactions', async () => {
  const row = attempt(); submit(row, true);
  const before = JSON.stringify([db.rows(LearningAttempt), db.rows(QuestionSubmission)]);
  await get(); await detail(row);
  assert.equal(JSON.stringify([db.rows(LearningAttempt), db.rows(QuestionSubmission)]), before);
  assert.deepEqual(db.isolations, ['REPEATABLE READ', 'REPEATABLE READ']);
});

test('Swagger and actual response fields agree and existing calendar mutations remain documented', async () => {
  const spec = await (await fetch(`${base}/api-docs.json`)).json();
  const list = spec.paths['/api/v1/learning/history'].get;
  const record = spec.paths['/api/v1/learning/history/{recordType}/{recordId}'].get;
  assert.deepEqual(list.parameters.map(item => item.name), ['page', 'pageSize', 'status']);
  assert.deepEqual(record.parameters.map(item => item.name), ['recordType', 'recordId']);
  for (const operation of [list, record]) {
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    for (const status of [200, 401, 422, 503]) assert.ok(operation.responses[status]);
  }
  assert.ok(record.responses[404]);
  assert.ok(spec.paths['/api/v1/calendar/plans'].post);
  assert.ok(spec.paths['/api/v1/calendar/plans/{planId}'].patch);
  assert.ok(spec.paths['/api/v1/calendar/plans/{planId}'].delete);
  const row = attempt(); submit(row, true);
  const data = (await detail(row)).body.data;
  for (const key of spec.components.schemas.LearningHistorySummary.required) assert.ok(key in data, key);
  for (const key of spec.components.schemas.LearningHistorySubmission.required) assert.ok(key in data.submissions[0], key);
  const examples = list.responses[200].content['application/json'].examples;
  assert.ok(examples.populated.value.data.items.length);
  assert.equal('emptyMessage' in examples.populated.value.data, false);
  assert.equal(examples.empty.value.data.emptyMessage, '아직 학습 기록이 없습니다.');
});
