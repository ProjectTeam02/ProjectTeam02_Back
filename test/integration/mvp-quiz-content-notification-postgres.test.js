const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const test = require('node:test');
const listenTestServer = require('../helpers/listen-test-server');

const config = process.env.LEREN_MVP_API_PG_TEST_CONFIG;

test('MVP quiz, shop and notifications through Express and isolated PostgreSQL', { skip: !config, timeout: 120000 }, async t => {
  const { port, database, password } = JSON.parse(config);
  assert.match(database, /^leren_mvp_[a-z0-9_]+$/);
  assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
  const E = require('@leren/database');
  const db = E.AppDataSource;
  const env = require('../../src/config/env');
  const oldOptions = { ...db.options };
  const oldSecret = env.jwtAccessSecret;
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db.isInitialized) await db.destroy();
    db.setOptions(oldOptions);
    env.jwtAccessSecret = oldSecret;
  });
  db.setOptions({ host: '127.0.0.1', port, username: 'app_user', password, database,
    ssl: false, synchronize: false, migrationsRun: false, logging: false });
  await db.initialize();
  assert.equal((await db.query('SELECT current_database() AS name'))[0].name, database);
  env.jwtAccessSecret = randomBytes(32).toString('hex');
  const { issueAccessToken } = require('../../src/common/utils/token.util');
  const save = (entity, value) => db.getRepository(entity).save(value);
  const learner = async (nickname) => {
    const user = await save(E.User, { nickname });
    const session = await save(E.UserSession, { userId: user.userId,
      refreshTokenHash: randomBytes(32).toString('hex'), loginMethod: 'EMAIL', expiresAt: new Date(Date.now() + 3600000) });
    return { ...user, token: issueAccessToken(user, session.sessionId) };
  };
  const user = await learner('MVP fixture');
  server = await listenTestServer(require('../../src/app'));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  async function request(method, route, body, token = user.token) {
    const res = await fetch(base + route, { method, headers: { authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: await res.json() };
  }
  const expect = async (status, ...args) => {
    const res = await request(...args);
    assert.equal(res.status, status, JSON.stringify(res.body));
    return res.body.data;
  };

  let sequence = 0;
  async function fixture(questionSpecs, stageOptions = {}) {
    const prefix = `MVP-${++sequence}-${randomBytes(3).toString('hex')}`;
    const topic = await save(E.Topic, { topicNo: 20000 + sequence, topicCode: prefix, title: 'MVP 테스트 전용 주제', status: 'PUBLISHED' });
    const concept = await save(E.Concept, { conceptCode: prefix, topicId: topic.topicId, title: 'MVP 테스트 전용 개념', status: 'PUBLISHED' });
    const stage = await save(E.Stage, { topicId: topic.topicId, stageCode: prefix, stageNo: 1,
      stageType: 'NORMAL', title: 'MVP 테스트 전용 Stage', status: 'PUBLISHED', maxQuestionCount: 3, requiredCorrectCount: 2,
      initialMonsterHp: 2, rewardTotalExp: 0, rewardEconomyExp: 0, rewardCoin: 0, ...stageOptions });
    const questions = [];
    for (const [index, [status, count = 4, correct = 1, slot = index + 1]] of questionSpecs.entries()) {
      const question = await save(E.Question, { questionCode: `${prefix}-${index}`, conceptId: concept.conceptId,
        questionText: '테스트 전용 문항', explanation: '테스트 전용 해설', generatedBy: 'MANUAL', status });
      await save(E.QuestionChoice, Array.from({ length: count }, (_, i) => ({ questionId: question.questionId, baseOrder: i + 1,
        choiceText: `Fixture ${i + 1}`, isCorrect: i < correct })));
      if (slot !== null) await save(E.StageQuestion, { stageId: stage.stageId, questionId: question.questionId, questionOrder: slot });
      questions.push(question);
    }
    return { ...stage, conceptId: concept.conceptId, questions };
  }
  const pub = ['PUBLISHED'];
  const detail = stage => expect(200, 'GET', `/stages/${stage.stageId}`);
  const start = stage => `/stages/${stage.stageId}/attempts`;
  const generate = stage => `/quizzes/generate?conceptId=${stage.conceptId}`;

  await t.test('two assigned questions reproduce detail 200 / start 503 on both paths without creating an attempt', async () => {
    const stage = await fixture([pub, pub]);
    assert.equal((await detail(stage)).stageId, stage.stageId);
    for (const route of [start(stage), `/quizzes${start(stage)}`]) {
      const result = await request('POST', route, route.startsWith('/quizzes') ? undefined : { mode: 'START' });
      assert.equal(result.status, 503, JSON.stringify(result.body));
      assert.match(result.body.message, /문항 3개/);
    }
    assert.equal(await db.getRepository(E.LearningAttempt).countBy({ stageId: stage.stageId }), 0);
  });

  await t.test('learner-facing legacy route excludes approved-but-unpublished, generated and retired questions', async () => {
    for (const status of ['APPROVED', 'GENERATED', 'REVIEW_PENDING', 'RETIRED']) {
      const stage = await fixture([[status]]);
      await expect(404, 'GET', generate(stage));
    }
    const malformed = await fixture([['PUBLISHED', 3], ['PUBLISHED', 4, 0]]);
    await expect(404, 'GET', generate(malformed));
    const stage = await fixture([['APPROVED'], ['PUBLISHED', 3], pub]);
    const data = await expect(200, 'GET', generate(stage));
    assert.equal(data.id, stage.questions[2].questionId);
    assert.equal(data.explanation, null);
    assert.equal(data.choices.length, 4);
    assert.ok(data.choices.every(choice => !('isCorrect' in choice)));
  });

  await t.test('detail readiness follows start pool checks and keeps the public and unlock contracts', async () => {
    const ready = await fixture([pub, pub, pub]);
    for (const [spec, stageOptions, reason] of [
      [[pub, pub], {}, 'INSUFFICIENT_ELIGIBLE_QUESTIONS'],
      [[pub, pub, ['APPROVED']], {}, 'INSUFFICIENT_ELIGIBLE_QUESTIONS'],
      [[pub, pub, ['PUBLISHED', 3]], {}, 'INVALID_QUESTION_POOL'],
      [[pub, pub, ['PUBLISHED', 4, 0]], {}, 'INVALID_QUESTION_POOL'],
      [[pub, pub, ['PUBLISHED', 4, 1, 4]], {}, 'INSUFFICIENT_ELIGIBLE_QUESTIONS'],
      [[pub, pub, pub, pub], {}, 'INVALID_QUESTION_POOL'],
      [[pub, pub, pub], { maxQuestionCount: 4 }, 'INVALID_STAGE_CONFIGURATION'],
      [[pub, pub, pub], { rewardCoin: null }, 'REWARD_NOT_CONFIGURED'],
    ]) {
      const stage = await fixture(spec, stageOptions);
      const data = await detail(stage);
      assert.equal(data.quizReady, false);
      assert.equal(data.quizUnavailableReason, reason);
      assert.equal(data.isUnlocked, true);
      await expect(503, 'POST', start(stage), { mode: 'START' });
      assert.equal(await db.getRepository(E.LearningAttempt).countBy({ stageId: stage.stageId }), 0);
    }
    const locked = await fixture([pub, pub, pub], { stageNo: 2 });
    assert.equal((await detail(locked)).quizReady, true);
    assert.equal((await detail(locked)).isUnlocked, false);
    await expect(403, 'POST', start(locked), { mode: 'START' });
    const data = await detail(ready);
    assert.equal(data.quizReady, true);
    assert.equal(data.quizUnavailableReason, null);
    const boss = await save(E.Stage, { topicId: ready.topicId, stageCode: `B-${randomUUID().slice(0, 8)}`, stageNo: 2,
      stageType: 'BOSS', title: '보스 Fixture', status: 'PUBLISHED', initialMonsterHp: 4, maxQuestionCount: 5, requiredCorrectCount: 4 });
    assert.equal(Object.hasOwn(await detail(boss), 'quizReady'), false);
    const list = await expect(200, 'GET', `/topics/${ready.topicId}/stages`);
    assert.ok(list.items.every(stage => !Object.hasOwn(stage, 'quizReady')));
    await expect(201, 'POST', start(ready), { mode: 'START' });
    assert.equal(await db.getRepository(E.LearningAttempt).countBy({ stageId: ready.stageId }), 1);
    await db.getRepository(E.Question).update(ready.questions[2].questionId, { status: 'RETIRED' });
    assert.equal((await detail(ready)).quizReady, false);
    const other = await learner('MVP second fixture');
    await expect(503, 'POST', start(ready), { mode: 'START' }, other.token);
    const resumed = await expect(200, 'POST', start(ready), { mode: 'START' });
    assert.equal(resumed.resumed, true);
    await db.getRepository(E.Question).update(ready.questions[0].questionId, { status: 'RETIRED' });
    await expect(503, 'POST', start(ready), { mode: 'START' });
  });

  await t.test('notification GET is read-only, PATCH persists, scheduler only sends configured reminders', async () => {
    const path = '/users/me/notification-settings';
    const settings = db.getRepository(E.UserSetting);
    const existing = await learner('MVP saved fixture');
    await save(E.UserSetting, { userId: existing.userId, reminderEnabled: false, timezone: 'UTC' });
    const original = (await settings.findOneByOrFail({ userId: existing.userId })).updatedAt;
    const at = new Date('2026-11-20T11:30:00Z');
    const push = require('../../src/modules/notifications/reminder.service')({ dataSource: db, pushClient: {
      send: async messages => messages.map(() => ({ status: 'ok' })),
    } });
    for (const row of [user, existing]) {
      await save(E.UserDevice, { userId: row.userId, deviceUuid: randomUUID(), platform: 'ANDROID',
        pushToken: `ExponentPushToken[${randomUUID()}]`, notificationPermission: true, isActive: true });
    }
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(await expect(200, 'GET', path),
        { reminderEnabled: false, reminderTime: null, timezone: 'Asia/Seoul', updatedAt: null });
    }
    assert.equal(await settings.countBy({ userId: user.userId }), 0);
    assert.equal((await expect(200, 'GET', path, undefined, existing.token)).updatedAt, original.toISOString());
    assert.equal((await settings.findOneByOrFail({ userId: existing.userId })).updatedAt.getTime(), original.getTime());
    assert.equal((await push.runOnce(at)).reserved, 0);
    const saved = await expect(200, 'PATCH', path, { reminderEnabled: true, reminderTime: '20:30' });
    assert.equal(saved.reminderTime, '20:30:00');
    assert.ok(saved.updatedAt);
    assert.equal(await settings.countBy({ userId: user.userId }), 1);
    assert.deepEqual(await expect(200, 'GET', path), saved);
    assert.equal((await push.runOnce(at)).sent, 1);
    assert.equal((await push.runOnce(at)).reserved, 0);
  });

  await t.test('unseeded OUTFIT store is empty; actual sale flag controls discovery', async () => {
    const shop = '/shop/costumes';
    // 마이그레이션이 만드는 직업별 기본 한벌옷만 있고, 모두 판매하지 않음
    assert.deepEqual((await db.getRepository(E.Costume).find({ order: { costumeCode: 'ASC' } }))
      .map(costume => [costume.costumeCode, costume.isOnSale]),
    [['ARCHER_DEFAULT_OUTFIT', false], ['MAGE_DEFAULT_OUTFIT', false], ['WARRIOR_DEFAULT_OUTFIT', false]]);
    assert.deepEqual((await expect(200, 'GET', shop)).items, []);
    const base = { name: '테스트 전용 의상', category: 'OUTFIT', priceCoin: 3, imageKey: 'fixture-only' };
    const available = await save(E.Costume, { ...base, costumeCode: 'MVP-SALE', isOnSale: true });
    const hidden = await save(E.Costume, { ...base, costumeCode: 'MVP-NOT-FOR-SALE', isOnSale: false });
    const list = await expect(200, 'GET', shop);
    assert.equal(list.total, 1);
    assert.deepEqual(list.items.map(item => item.itemId), [available.itemId]);
    assert.equal((await expect(200, 'GET', `${shop}/${available.itemId}`)).category, 'OUTFIT');
    await expect(404, 'GET', `${shop}/${hidden.itemId}`);
  });
});
