const assert = require('node:assert/strict');
const test = require('node:test');
const { randomBytes, randomInt, randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const listenTestServer = require('../helpers/listen-test-server');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('explicit learning-attempt abandonment over HTTP and isolated PostgreSQL', { skip: !config, timeout: 120000 }, async t => {
  const E = require('@leren/database');
  const { AppDataSource: db } = E;
  const env = require('../../src/config/env');
  const { issueAccessToken } = require('../../src/common/utils/token.util');
  const options = JSON.parse(config);
  const originalOptions = { ...db.options };
  const originalSecret = env.jwtAccessSecret;
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db.isInitialized) await db.destroy();
    db.setOptions(originalOptions);
    env.jwtAccessSecret = originalSecret;
  });

  db.setOptions({ host: '127.0.0.1', port: options.port, database: options.database, username: options.username,
    password: options.password, ssl: false, synchronize: false, migrationsRun: false });
  await db.initialize();
  env.jwtAccessSecret = randomBytes(32).toString('hex');
  server = await listenTestServer(require('../../src/app'));
  const base = `http://127.0.0.1:${server.address().port}`;
  const suffix = randomBytes(4).toString('hex');
  const save = (entity, fields) => db.getRepository(entity).save(fields);
  const attempts = db.getRepository(E.LearningAttempt);
  const submissions = db.getRepository(E.QuestionSubmission);
  const progress = db.getRepository(E.UserStageProgress);
  const combatRules = db.getMetadata(E.LearningAttempt).columns.some(column => column.propertyName === 'bossCombatState');

  const topic = await save(E.Topic, { topicCode: `ABA-${suffix}`, topicNo: 32000 + randomInt(767), title: '포기 테스트', status: 'PUBLISHED' });
  const concept = await save(E.Concept, { conceptCode: `ABA-${suffix}`, topicId: topic.topicId, title: '테스트 개념', status: 'PUBLISHED' });
  const stage = { topicId: topic.topicId, status: 'PUBLISHED', rewardTotalExp: 10, rewardEconomyExp: 5, rewardCoin: 3 };
  const normalStage = await save(E.Stage, { ...stage, stageCode: `ABA-N-${suffix}`, stageNo: 1, stageType: 'NORMAL',
    title: '일반 Stage', maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2 });
  const bossStage = await save(E.Stage, { ...stage, stageCode: `ABA-B-${suffix}`, stageNo: 2, stageType: 'BOSS',
    title: 'Boss', maxQuestionCount: 5, requiredCorrectCount: 4, initialMonsterHp: 4 });
  const normal = { stageId: normalStage.stageId, start: `/stages/${normalStage.stageId}/attempts`,
    view: id => `/attempts/${id}/current-question`, answer: id => `/attempts/${id}/answers`, max: 3, hp: 2, winAt: 2 };
  const boss = { stageId: bossStage.stageId, start: `/bosses/${bossStage.stageId}/attempts`,
    view: id => `/boss-attempts/${id}`, answer: id => `/boss-attempts/${id}/answers`,
    max: combatRules ? 7 : 5, hp: combatRules ? 6 : 4, winAt: combatRules ? 7 : 4 };
  const questions = await save(E.Question, Array.from({ length: 10 }, (_, index) => ({
    questionCode: `ABA-${suffix}-${index}`, conceptId: concept.conceptId, questionText: '문항', explanation: '해설', generatedBy: 'MANUAL', status: 'PUBLISHED',
  })));
  await save(E.QuestionChoice, questions.flatMap(question => [1, 2, 3, 4].map(baseOrder => ({
    questionId: question.questionId, baseOrder, choiceText: `보기 ${baseOrder}`, isCorrect: baseOrder === 1,
  }))));
  await save(E.StageQuestion, [
    ...questions.slice(0, 3).map((question, index) => ({ stageId: normal.stageId, questionId: question.questionId, questionOrder: index + 1 })),
    ...questions.slice(3, 8).map((question, index) => ({ stageId: boss.stageId, questionId: question.questionId, questionOrder: index + 1 })),
  ]);
  await db.createQueryBuilder().insert().into(E.LevelThreshold).values([
    { scope: 'ACCOUNT', level: 1, requiredExp: 0 }, { scope: 'ECONOMY', level: 1, requiredExp: 0 },
  ]).orIgnore().execute();

  async function newSession(user) {
    const session = await save(E.UserSession, { userId: user.userId, loginMethod: 'EMAIL',
      refreshTokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 600000) });
    return { user, token: issueAccessToken(user, session.sessionId) };
  }

  async function player(label, type = normal) {
    const user = await save(E.User, { nickname: `${label}${suffix}` });
    if (type === boss) await progress.save({ userId: user.userId, stageId: normal.stageId, progressStatus: 'PASSED', firstPassedAt: new Date() });
    await save(E.UserGrowth, { userId: user.userId, totalExp: 2, economyExp: 1 });
    await save(E.UserWallet, { userId: user.userId, coinBalance: 7 });
    return newSession(user);
  }

  async function request(method, path, actor, body) {
    const headers = actor ? { authorization: `Bearer ${actor.token}` } : {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${base}/api/v1${path}`, { method, headers, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }

  function data(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    assert.equal(response.body.success, true);
    return response.body.data;
  }

  const abandon = (id, actor) => request('POST', `/attempts/${id}/abandon`, actor);
  const start = async (type, actor, mode = 'START', status = 201) => data(await request('POST', type.start, actor, { mode }), status);
  async function answerFor(question, correct) {
    const choice = await db.getRepository(E.QuestionChoice).findOneByOrFail({ questionId: question.id, baseOrder: correct ? 1 : 2 });
    return { questionId: question.id, choiceId: choice.choiceId, submissionId: randomUUID() };
  }
  async function play(type, actor, state, answers) {
    let question = state.currentQuestion;
    for (const correct of answers) {
      state = data(await request('POST', type.answer(state.attemptId), actor, await answerFor(question, correct)), 201);
      question = state.nextQuestion;
    }
    return state;
  }

  const saved = id => attempts.findOneByOrFail({ attemptId: id });
  const savedAnswers = id => submissions.find({ where: { attemptId: id }, order: { sequenceNo: 'ASC' } });
  const effects = actor => {
    const where = { userId: actor.user.userId };
    return Promise.all([
      progress.find({ where, order: { stageId: 'ASC' } }), db.getRepository(E.UserGrowth).findOneBy(where),
      db.getRepository(E.UserWallet).findOneBy(where), db.getRepository(E.ExpLedger).findBy(where), db.getRepository(E.CoinLedger).findBy(where),
    ]);
  };
  function preservedAttempt({ status, endReason, endedAt, updatedAt, ...rest }) { return rest; }

  async function checkAbandoned(type, actor, before, response) {
    const stopped = data(response, 200);
    const row = await saved(before.attemptId);
    assert.equal(row.status, 'ABANDONED');
    assert.equal(row.endReason, 'ABANDONED');
    assert.deepEqual(stopped, { attemptId: row.attemptId, status: row.status, endReason: row.endReason, endedAt: row.endedAt.toISOString() });
    assert.deepEqual(preservedAttempt(row), preservedAttempt(before));
    const view = data(await request('GET', type.view(row.attemptId), actor), 200);
    assert.equal(view.status, 'ABANDONED');
    assert.equal(view.currentQuestion, null);
    return stopped;
  }

  // Queue two real HTTP transactions behind the same held PostgreSQL row, in a known order.
  async function compete(attemptId, first, second) {
    const gate = db.createQueryRunner();
    const pending = [];
    await gate.connect();
    await gate.startTransaction();
    try {
      const [{ pid }] = await gate.query('SELECT pg_backend_pid() AS pid');
      await gate.query('SELECT attempt_id FROM learning.learning_attempts WHERE attempt_id=$1 FOR UPDATE', [attemptId]);
      async function waitForBlocked(expected) {
        const deadline = Date.now() + 6000;
        while (Date.now() < deadline) {
          const [{ n }] = await db.query(`WITH RECURSIVE waiting(pid) AS (
            SELECT $1::int UNION SELECT a.pid FROM pg_stat_activity a
            JOIN waiting w ON w.pid = ANY(pg_blocking_pids(a.pid)) WHERE a.datname = current_database()
          ) SELECT count(*)::int - 1 AS n FROM waiting`, [pid]);
          if (n === expected) return;
          await delay(20);
        }
        assert.fail(`Expected ${expected} transactions waiting for the attempt row`);
      }
      pending.push(first());
      await waitForBlocked(1);
      pending.push(second());
      await waitForBlocked(2);
      await gate.commitTransaction();
      return await Promise.all(pending);
    } finally {
      if (gate.isTransactionActive) await gate.rollbackTransaction();
      await gate.release();
      await Promise.allSettled(pending);
    }
  }

  await t.test('Bearer, UUID validation and owner-only response match the OpenAPI contract', async () => {
    const owner = await player('포기인증');
    const outsider = await player('포기타인');
    const opened = await start(normal, owner);
    const id = opened.attemptId;
    assert.equal((await abandon(id)).status, 401);
    assert.deepEqual(await abandon(id, outsider), await abandon(randomUUID(), outsider));
    assert.equal((await abandon(id, outsider)).status, 404);
    assert.equal((await abandon('bad-id', owner)).status, 422);
    assert.equal((await request('POST', `/attempts/${id}/abandon?mode=RETRY`, owner)).status, 422);
    assert.equal((await request('POST', `/attempts/${id}/abandon`, owner, { status: 'FAILED' })).status, 422);
    assert.equal((await saved(id)).status, 'IN_PROGRESS');
    const spec = await (await fetch(`${base}/api-docs.json`)).json();
    const operation = spec.paths['/api/v1/attempts/{attemptId}/abandon'].post;
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    assert.equal(operation.parameters[0].schema.format, 'uuid');
    assert.equal(operation.requestBody, undefined);
    assert.deepEqual(Object.keys(operation.responses).sort(), ['200','401','404','409','422','503']);
    assert.ok(spec.components.schemas.NormalStageAttempt.properties.status.enum.includes('ABANDONED'));
    assert.ok(spec.components.schemas.NormalStageAttemptDetails.properties.endReason.enum.includes('ABANDONED'));
  });

  await t.test('Normal can abandon immediately, repeat safely across devices, and start a new RETRY', async () => {
    const owner = await player('포기즉시');
    const device = await newSession(owner.user);
    const opened = await start(normal, owner);
    const before = await saved(opened.attemptId);
    const beforeEffects = await effects(owner);
    const pair = await compete(opened.attemptId, () => abandon(opened.attemptId, owner), () => abandon(opened.attemptId, device));
    const stopped = await checkAbandoned(normal, owner, before, pair[0]);
    assert.deepEqual(data(pair[1], 200), stopped);
    assert.deepEqual(data(await abandon(opened.attemptId, device), 200), stopped);
    assert.deepEqual(await savedAnswers(opened.attemptId), []);
    assert.deepEqual(await effects(owner), beforeEffects);
    assert.equal((await request('POST', normal.start, owner, { mode: 'START' })).status, 409);
    const retry = await start(normal, owner, 'RETRY');
    assert.notEqual(retry.attemptId, opened.attemptId);
    assert.equal(retry.hp, 2);
    assert.equal(retry.submittedCount, 0);
    assert.equal(retry.attemptNo, opened.attemptNo + 1);
  });

  for (const [label, type, answers] of [
    ['Normal after one answer', normal, [true]], ['Boss after one answer', boss, [true]],
    ['Boss after four answers', boss, [true, false, true, false]],
    ...(combatRules ? [['Boss HP zero after early defeat', boss, [true, true, true, true, true]]] : []),
  ]) {
    await t.test(`${label} can reconnect before abandon and preserve its answers and progress after it`, async () => {
      const owner = await player(`포기풀이${answers.length}`, type);
      const opened = await start(type, owner);
      assert.equal(opened.hp, type.hp);
      assert.equal(opened.maxQuestionCount, type.max);
      const graded = await play(type, owner, opened, answers);
      const device = await newSession(owner.user);
      const reconnected = await start(type, device, 'START', 200);
      assert.equal(reconnected.attemptId, opened.attemptId);
      assert.equal(reconnected.submittedCount, answers.length);
      assert.equal(reconnected.currentQuestion.id, graded.nextQuestion.id);
      assert.equal(reconnected.status, 'IN_PROGRESS');
      if (answers.length === 5) {
        assert.equal(reconnected.hp, 0);
        assert.equal(reconnected.bossCombat.defeatedAtQuestion, 5);
        assert.equal(reconnected.bossCombat.bonusQuestionCount, 2);
      }
      const before = await saved(opened.attemptId);
      const history = await savedAnswers(opened.attemptId);
      const beforeEffects = await effects(owner);
      await checkAbandoned(type, owner, before, await abandon(opened.attemptId, device));
      assert.deepEqual(await savedAnswers(opened.attemptId), history);
      assert.equal((await request('POST', type.answer(opened.attemptId), owner, await answerFor(graded.nextQuestion, true))).status, 409);
      assert.deepEqual(await effects(owner), beforeEffects);
      if (type === normal) {
        const detail = data(await request('GET', `/attempts/${opened.attemptId}`, owner), 200);
        assert.equal(detail.status, 'ABANDONED');
        assert.equal(detail.answers.length, 1);
        assert.equal((await request('GET', `/quizzes/attempts/${opened.attemptId}/result`, owner)).status, 409);
      } else {
        const retry = await start(boss, owner, 'RETRY');
        assert.notEqual(retry.attemptId, opened.attemptId);
        assert.equal(retry.hp, boss.hp);
        assert.equal(retry.submittedCount, 0);
      }
    });
  }

  for (const [label, type] of [['Normal', normal], ['Boss', boss]]) {
    await t.test(`${label} PASSED and FAILED attempts cannot be abandoned`, async () => {
      for (const passed of [true, false]) {
        const owner = await player(`완료${label}${Number(passed)}`, type);
        const state = await start(type, owner);
        const terminal = await play(type, owner, state, Array(passed ? type.winAt : type.max).fill(passed));
        assert.equal(terminal.status, passed ? 'PASSED' : 'FAILED');
        assert.equal(terminal.rewardGranted, passed);
        const before = await saved(state.attemptId);
        const beforeEffects = await effects(owner);
        assert.equal((await abandon(state.attemptId, owner)).status, 409);
        assert.deepEqual(await saved(state.attemptId), before);
        assert.deepEqual(await effects(owner), beforeEffects);
        if (passed && type === normal) {
          const relearn = data(await request('POST', `/stages/${type.stageId}/relearn`, owner), 201);
          const beforeRelearn = await saved(relearn.attemptId);
          await checkAbandoned(type, owner, beforeRelearn, await abandon(relearn.attemptId, owner));
          assert.deepEqual(await effects(owner), beforeEffects);
        }
      }
    });

    for (const abandonFirst of [false, true]) {
      await t.test(`${label} terminal answer versus abandon: ${abandonFirst ? 'abandon' : 'answer'} locks first`, async () => {
        const owner = await player(`최종경쟁${label}${Number(abandonFirst)}`, type);
        const device = await newSession(owner.user);
        const opened = await start(type, owner);
        const graded = await play(type, owner, opened, Array(type.winAt - 1).fill(true));
        const before = await saved(opened.attemptId);
        const beforeAnswers = await savedAnswers(opened.attemptId);
        const beforeEffects = await effects(owner);
        const finalAnswer = await answerFor(graded.nextQuestion, true);
        const submit = () => request('POST', type.answer(opened.attemptId), owner, finalAnswer);
        const stop = () => abandon(opened.attemptId, device);
        const [first, second] = await compete(opened.attemptId, abandonFirst ? stop : submit, abandonFirst ? submit : stop);
        if (abandonFirst) {
          await checkAbandoned(type, owner, before, first);
          assert.equal(second.status, 409);
          assert.deepEqual(await savedAnswers(opened.attemptId), beforeAnswers);
          assert.deepEqual(await effects(owner), beforeEffects);
        } else {
          assert.equal(data(first, 201).status, 'PASSED');
          assert.equal(second.status, 409);
          const row = await saved(opened.attemptId);
          assert.equal(row.status, 'PASSED');
          assert.equal(row.rewardGranted, true);
          assert.equal((await savedAnswers(opened.attemptId)).length, beforeAnswers.length + 1);
          const [, growth, wallet, exp, coins] = await effects(owner);
          assert.equal(growth.totalExp, 12);
          assert.equal(wallet.coinBalance, 10);
          assert.equal(exp.length, 1);
          assert.equal(coins.length, 1);
        }
      });
    }
  }

  await t.test('an ordinary answer can commit before abandon without being lost or graded twice', async () => {
    const owner = await player('중간경쟁');
    const opened = await start(normal, owner);
    const answer = await answerFor(opened.currentQuestion, false);
    const beforeEffects = await effects(owner);
    const [first, second] = await compete(opened.attemptId,
      () => request('POST', normal.answer(opened.attemptId), owner, answer), () => abandon(opened.attemptId, owner));
    assert.equal(data(first, 201).status, 'IN_PROGRESS');
    assert.equal(data(second, 200).status, 'ABANDONED');
    const after = await saved(opened.attemptId);
    assert.equal(after.submittedCount, 1);
    assert.equal(after.correctCount, 0);
    assert.equal(after.status, 'ABANDONED');
    assert.equal((await savedAnswers(opened.attemptId)).length, 1);
    assert.deepEqual(await effects(owner), beforeEffects);
  });

  await t.test('a legacy Boss row without a combat snapshot can be abandoned', async () => {
    const owner = await player('레거시포기', boss);
    const existing = await save(E.LearningAttempt, { userId: owner.user.userId, stageId: boss.stageId, attemptNo: 1,
      maxQuestionCount: 5, requiredCorrectCount: 4, initialHp: 4, status: 'IN_PROGRESS' });
    const resumed = await start(boss, owner, 'START', 200);
    assert.equal(resumed.attemptId, existing.attemptId);
    assert.equal(resumed.hp, 4);
    const before = await saved(existing.attemptId);
    const beforeEffects = await effects(owner);
    await checkAbandoned(boss, owner, before, await abandon(existing.attemptId, owner));
    assert.deepEqual(await effects(owner), beforeEffects);
  });
});
