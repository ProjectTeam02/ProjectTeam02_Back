const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const test = require('node:test');
const listenTestServer = require('../helpers/listen-test-server');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('learning history and concept accuracy against isolated PostgreSQL', { skip: !config, timeout: 120000 }, async t => {
  const options = JSON.parse(config);
  const E = require('@leren/database');
  const db = E.AppDataSource;
  const env = require('../../src/config/env');
  const { issueAccessToken } = require('../../src/common/utils/token.util');
  const previous = { ...db.options };
  const secret = env.jwtAccessSecret;
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db.isInitialized) await db.destroy();
    db.setOptions(previous);
    env.jwtAccessSecret = secret;
  });
  db.setOptions({ host: '127.0.0.1', port: options.port, database: options.database || 'leren_it',
    username: options.username || 'app_user', password: options.password || 'app_local',
    ssl: false, synchronize: false, migrationsRun: false, logging: false });
  await db.initialize();
  env.jwtAccessSecret = randomBytes(32).toString('hex');
  const suffix = randomBytes(4).toString('hex');
  const save = (classType, row) => db.getRepository(classType).save(row);
  async function learner(name) {
    const user = await save(E.User, { nickname: `${name}-${suffix}` });
    const session = await save(E.UserSession, { userId: user.userId, loginMethod: 'EMAIL',
      refreshTokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) });
    return { id: user.userId, token: issueAccessToken(user, session.sessionId) };
  }
  const owner = await learner('이력');
  const other = await learner('비교');
  const topicNo = 11000 + parseInt(suffix.slice(0, 3), 16);
  async function stage(key, offset) {
    const topic = await save(E.Topic, { topicCode: `HIST-${key}-${suffix}`, topicNo: topicNo + offset,
      status: 'PUBLISHED', title: key });
    const row = await save(E.Stage, { topicId: topic.topicId, stageCode: `H-${key}-${suffix}`, stageNo: 1,
      stageType: 'NORMAL', status: 'PUBLISHED', title: key, maxQuestionCount: 3, requiredCorrectCount: 2,
      initialMonsterHp: 2, rewardTotalExp: 0, rewardEconomyExp: 0, rewardCoin: 0 });
    return { ...row, topic };
  }
  const historyStage = await stage('history', 0);
  const statsStage = await stage('stats', 4200);
  function attempt(learner, row, number, overrides = {}) {
    return save(E.LearningAttempt, { userId: learner.id, stageId: row.stageId, attemptNo: number,
      attemptType: 'PLAY', mode: number === 1 ? 'START' : 'RETRY', status: 'PASSED', endReason: 'MONSTER_DEFEATED',
      initialHp: 2, finalHp: 0, requiredCorrectCount: 2, maxQuestionCount: 3,
      submittedCount: 2, correctCount: 2, endedAt: new Date('2026-11-04T15:00:00Z'), ...overrides });
  }
  async function datedAttempt(learner, number, startedAt, overrides) {
    const row = await attempt(learner, historyStage, number, overrides);
    // Retain PostgreSQL's sub-millisecond precision at the upper boundary.
    await db.query('UPDATE learning.learning_attempts SET started_at = $1::timestamptz WHERE attempt_id = $2', [startedAt, row.attemptId]);
    return row.attemptId;
  }
  server = await listenTestServer(require('../../src/app'));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(route, { learner = owner, body, method = 'GET' } = {}) {
    const headers = learner ? { authorization: `Bearer ${learner.token}` } : {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${origin}/api/v1${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  async function success(route, options, status = 200) {
    const response = await request(route, options);
    assert.equal(response.status, status, JSON.stringify(response.body));
    assert.equal(response.body.success, true);
    return response.body.data;
  }

  await t.test('KST start dates constrain records and totals before pagination', async () => {
    const before = await datedAttempt(owner, 1, '2026-11-01T14:59:59.999999Z');
    const start = await datedAttempt(owner, 2, '2026-11-01T15:00:00.000000Z');
    const end = await datedAttempt(owner, 3, '2026-11-02T14:59:59.999999Z', {
      status: 'FAILED', endReason: 'QUESTIONS_EXHAUSTED', submittedCount: 3, correctCount: 0, finalHp: 2,
    });
    const after = await datedAttempt(owner, 4, '2026-11-02T15:00:00.000000Z');
    const foreign = await datedAttempt(other, 1, '2026-11-02T00:00:00Z');
    const route = '/learning/history';
    const get = (query = '', learner = owner) => success(route + query, { learner });
    const ids = data => data.items.map(row => row.recordId);
    const date = '2026-11-02';
    const sameDay = `?dateFrom=${date}&dateTo=${date}`;
    assert.deepEqual(ids(await get()), [after, end, start, before]);
    assert.deepEqual(ids(await get(`?dateFrom=${date}`)), [after, end, start]);
    assert.deepEqual(ids(await get(`?dateTo=${date}`)), [end, start, before]);
    assert.deepEqual(ids(await get('?dateFrom=2026-11-01&dateTo=2026-11-02')), [end, start, before]);
    const bounded = await get(sameDay);
    assert.deepEqual(ids(bounded), [end, start]);
    assert.ok(bounded.items.every(row => row.learningDate === date && row.timeZone === 'Asia/Seoul'));
    assert.deepEqual(ids(await get(`${sameDay}&status=PASSED`)), [start]);
    const second = await get(`${sameDay}&page=2&size=1`);
    assert.deepEqual([ids(second), second.total, second.totalPages, second.page, second.pageSize], [[start], 2, 2, 2, 1]);
    const empty = await get('?dateFrom=2026-11-05');
    assert.deepEqual([ids(empty), empty.total, empty.totalPages, typeof empty.emptyMessage], [[], 0, 0, 'string']);
    assert.deepEqual(ids(await get(sameDay, other)), [foreign]);
    for (const query of ['?dateFrom=2026-11-2', '?dateTo=2026-02-29', '?dateFrom=', '?dateTo=2026-11-02&dateTo=2026-11-03',
      '?dateFrom=2026-11-03&dateTo=2026-11-02', '?dateTo=2026-11-02T00:00:00Z']) {
      assert.equal((await request(route + query)).status, 422, query);
    }
    assert.equal((await request(route + sameDay, { learner: null })).status, 401);
    assert.deepEqual(await success(`${route}/LEARNING/${start}`), await success(`${route}/${start}`));
  });

  await t.test('unattempted concepts sort after a true zero with unchanged submission counts and numeric accuracy', async () => {
    async function concept(title, n) {
      return save(E.Concept, { topicId: statsStage.topicId, conceptCode: `HA-C-${n}-${suffix}`,
        title, status: 'PUBLISHED' });
    }
    const unseen = await concept('A 미응시', 0);
    const mixed = await concept('B 혼합', 1);
    const perfect = await concept('C 모두 정답', 2);
    const wrong = await concept('Z 모두 오답', 3);
    async function question(row, n) {
      const q = await save(E.Question, { conceptId: row.conceptId, questionCode: `HA-Q-${n}-${suffix}`,
        status: 'PUBLISHED', generatedBy: 'MANUAL', questionText: row.title, explanation: '예시 해설' });
      const choices = await save(E.QuestionChoice, [1, 2, 3, 4].map(baseOrder => ({
        questionId: q.questionId, baseOrder, choiceText: `선택지 ${baseOrder}`, isCorrect: baseOrder === 1,
      })));
      if (n > 0) await save(E.StageQuestion, { stageId: statsStage.stageId, questionId: q.questionId, questionOrder: n });
      return { ...q, choices };
    }
    const [unseenQ, mixedQ, perfectQ, wrongQ] = await Promise.all([unseen, mixed, perfect, wrong].map(question));
    function submitted(parent, row, correct, sequenceNo) {
      const choice = row.choices[correct ? 0 : 1];
      return save(E.QuestionSubmission, { submissionId: randomUUID(), attemptId: parent.attemptId,
        questionId: row.questionId, sequenceNo, choiceId: choice.choiceId, selectedPosition: choice.baseOrder,
        displayedChoiceOrder: row.choices.map(c => c.choiceId), isCorrect: correct, hpBefore: 2, hpAfter: correct ? 1 : 2 });
    }
    const failed = await attempt(owner, statsStage, 1, { status: 'FAILED', endReason: 'QUESTIONS_EXHAUSTED', finalHp: 2 });
    const retry = await attempt(owner, statsStage, 2);
    const relearn = await attempt(owner, statsStage, 3, { attemptType: 'RELEARN' });
    const foreign = await attempt(other, statsStage, 1);
    await Promise.all([submitted(failed, mixedQ, false, 1), submitted(failed, wrongQ, false, 2),
      submitted(retry, mixedQ, true, 1), submitted(retry, perfectQ, true, 2), submitted(relearn, perfectQ, true, 1),
      submitted(foreign, unseenQ, true, 1), submitted(foreign, mixedQ, true, 2)]);
    const current = await success(`/stages/${statsStage.stageId}/attempts`, { method: 'POST', body: { mode: 'RETRY' } }, 201);
    assert.equal(current.currentQuestion.id, mixedQ.questionId);
    const endpoint = `/attempts/${current.attemptId}/answers`;
    const answer = { questionId: mixedQ.questionId, choiceId: mixedQ.choices[1].choiceId, submissionId: randomUUID() };
    assert.equal((await success(endpoint, { method: 'POST', body: answer }, 201)).isCorrect, false);
    const replay = await request(endpoint, { method: 'POST', body: answer });
    // A replay may be rejected or acknowledged as a duplicate; neither may add a submission row.
    if (replay.status === 201) assert.equal(replay.body.data.duplicate, true);
    else assert.equal(replay.status, 409);
    assert.equal(await db.getRepository(E.QuestionSubmission).countBy({ attemptId: current.attemptId }), 1);
    const route = `/statistics/concepts?topicId=${statsStage.topicId}`;
    const unpack = row => [row.attempts, row.correct, row.accuracy];
    const data = await success(route);
    const byConcept = new Map(data.items.map(row => [row.conceptId, row]));
    const spec = await (await fetch(`${origin}/api-docs.json`)).json();
    const statistics = spec.paths['/api/v1/statistics/concepts'].get;
    assert.equal(statistics.responses[200].content['application/json'].schema.$ref, '#/components/schemas/ConceptStatisticsResponse');
    const shape = spec.components.schemas.ConceptStatisticsResponse.properties.data.properties.items.items;
    assert.deepEqual(Object.keys(byConcept.get(unseen.conceptId)).sort(), [...shape.required].sort());
    assert.equal(shape.properties.accuracy.type, 'number');
    assert.equal(shape.properties.attempts.type, 'integer');
    assert.deepEqual(unpack(byConcept.get(unseen.conceptId)), [0, 0, 0]);
    assert.deepEqual(unpack(byConcept.get(wrong.conceptId)), [1, 0, 0]);
    assert.deepEqual(unpack(byConcept.get(perfect.conceptId)), [2, 2, 1]);
    assert.deepEqual(unpack(byConcept.get(mixed.conceptId)), [3, 1, 1 / 3]);
    assert.deepEqual((await success(`${route}&sort=accuracy&limit=3`)).items.map(row => row.conceptId),
      [perfect.conceptId, mixed.conceptId, wrong.conceptId]);
    const otherData = new Map((await success(route, { learner: other })).items.map(row => [row.conceptId, row]));
    assert.deepEqual(unpack(otherData.get(unseen.conceptId)), [1, 1, 1]);
    assert.deepEqual(unpack(otherData.get(wrong.conceptId)), [0, 0, 0]);
    assert.equal((await request(route, { learner: null })).status, 401);
  });
});
