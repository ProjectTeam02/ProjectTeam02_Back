const assert = require('node:assert/strict');
const test = require('node:test');
const { randomBytes, randomUUID } = require('node:crypto');
const listenTestServer = require('../helpers/listen-test-server');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('Boss question bank and combat against isolated Express and PostgreSQL', { skip: !config, timeout: 120000 }, async t => {
  const E = require('@leren/database');
  const { AppDataSource: db } = E;
  const env = require('../../src/config/env');
  const { issueAccessToken } = require('../../src/common/utils/token.util');
  const AppError = require('../../src/common/errors/AppError');
  const bossQuestions = require('../../src/modules/quizzes/boss-question.repository');
  const options = JSON.parse(config);
  const previous = { ...db.options };
  const oldJwtSecret = env.jwtAccessSecret;
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db.isInitialized) await db.destroy();
    db.setOptions(previous);
    env.jwtAccessSecret = oldJwtSecret;
  });
  db.setOptions({ host: '127.0.0.1', port: options.port, username: options.username,
    password: options.password, database: options.database, ssl: false, synchronize: false, migrationsRun: false });
  await db.initialize();
  env.jwtAccessSecret = randomBytes(32).toString('hex');
  server = await listenTestServer(require('../../src/app'));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  const suffix = randomBytes(4).toString('hex');
  const save = (entity, fields) => db.getRepository(entity).save(fields);
  async function account(label) {
    const user = await save(E.User, { nickname: `${label}${suffix}` });
    const session = await save(E.UserSession, { userId: user.userId, loginMethod: 'EMAIL',
      refreshTokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 600000) });
    return { id: user.userId, token: issueAccessToken(user, session.sessionId) };
  }

  let questionNo = 0;
  async function question(concept, status = 'PUBLISHED', choiceCount = 4) {
    questionNo += 1;
    const row = await save(E.Question, { conceptId: concept.conceptId, questionCode: `BANK-${suffix}-${questionNo}`,
      questionText: '문항', explanation: '문항 해설', generatedBy: 'MANUAL', status });
    await save(E.QuestionChoice, Array.from({ length: choiceCount }, (_, index) => ({
      questionId: row.questionId, baseOrder: index + 1, choiceText: `보기 ${index + 1}`, isCorrect: index === 0,
    })));
    return row.questionId;
  }

  async function dungeon(key, topicNo, bankSize) {
    const topic = await save(E.Topic, { topicNo, topicCode: `BANK-${key}-${suffix}`, title: 'Boss 테스트 던전', status: 'PUBLISHED' });
    const concept = await save(E.Concept, { topicId: topic.topicId, conceptCode: `BANK-${key}-${suffix}`, title: '개념', status: 'PUBLISHED' });
    const stage = { topicId: topic.topicId, status: 'PUBLISHED', rewardTotalExp: 0, rewardEconomyExp: 0, rewardCoin: 0 };
    const normal = await save(E.Stage, { ...stage, stageNo: 1, stageCode: `BK-N-${key}-${suffix}`, stageType: 'NORMAL',
      title: '일반 Stage', maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2 });
    const boss = await save(E.Stage, { ...stage, stageNo: 2, stageCode: `BK-B-${key}-${suffix}`, stageType: 'BOSS',
      title: 'Boss Stage', maxQuestionCount: 5, requiredCorrectCount: 4, initialMonsterHp: 4 });
    const normalIds = [];
    for (let order = 1; order <= 3; order += 1) {
      const questionId = await question(concept);
      normalIds.push(questionId);
      await save(E.StageQuestion, { stageId: normal.stageId, questionId, questionOrder: order });
    }
    const eligibleIds = [];
    for (let index = 0; index < bankSize; index += 1) eligibleIds.push(await question(concept));
    const approvedId = await question(concept, 'APPROVED');
    const retiredId = await question(concept, 'RETIRED');
    const invalidId = await question(concept, 'PUBLISHED', 3);
    return { concept, normal, boss, normalIds, eligibleIds, approvedId, retiredId, invalidId };
  }

  const owner = await account('은행소유자');
  const outsider = await account('은행다른사용자');
  const legacy = await account('은행기존사용자');
  // Use an unused range of the smallint column so other fixture suites can run in parallel.
  const topicNo = 30000 + (randomBytes(2).readUInt16BE() % 1000) * 2;
  const main = await dungeon('A', topicNo, 8);
  const scarce = await dungeon('B', topicNo + 1, 6);
  const crossTopicNormalId = await question(scarce.concept);
  await save(E.StageQuestion, { stageId: main.normal.stageId, questionId: crossTopicNormalId, questionOrder: 4 });
  await db.createQueryBuilder().insert().into(E.LevelThreshold).values([
    { scope: 'ACCOUNT', level: 1, requiredExp: 0 }, { scope: 'ECONOMY', level: 1, requiredExp: 0 },
  ]).orIgnore().execute();
  const snapshots = db.getRepository(E.BossAttemptQuestion);
  const attempts = db.getRepository(E.LearningAttempt);
  const submissions = db.getRepository(E.QuestionSubmission);
  const progress = db.getRepository(E.UserStageProgress);

  async function request(path, user, body) {
    const headers = user ? { authorization: `Bearer ${user.token}` } : {};
    if (body) headers['content-type'] = 'application/json';
    const response = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  function data(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    assert.equal(response.body.success, true);
    return response.body.data;
  }
  async function answerFor(questionId, isCorrect = false) {
    const choice = await db.getRepository(E.QuestionChoice).findOneByOrFail({ questionId, baseOrder: isCorrect ? 1 : 2 });
    return { questionId, choiceId: choice.choiceId, submissionId: randomUUID() };
  }
  const bossStart = dungeon => `/bosses/${dungeon.boss.stageId}/attempts`;
  const bossAttempt = id => `/boss-attempts/${id}`;
  const resumeOrStart = { mode: 'START' };

  await t.test('exactly six eligible questions rejects and leaves no new attempt, progress, or snapshots', async () => {
    await save(E.UserStageProgress, { userId: owner.id, stageId: scarce.normal.stageId,
      progressStatus: 'PASSED', firstPassedAt: new Date() });
    let response;
    try {
      response = await request(bossStart(scarce), owner, resumeOrStart);
    } finally {
      // The synthetic cross-topic assignment must affect only this test's pool eligibility.
      await db.getRepository(E.StageQuestion).delete({ stageId: main.normal.stageId, questionOrder: 4 });
    }
    assert.equal(response.status, 503, JSON.stringify(response.body));
    assert.equal(response.body.code, 'SERVICE_UNAVAILABLE');
    assert.equal(await attempts.countBy({ userId: owner.id, stageId: scarce.boss.stageId }), 0);
    assert.equal(await progress.countBy({ userId: owner.id, stageId: scarce.boss.stageId }), 0);
    assert.equal(await snapshots.countBy({ attempt: { userId: owner.id, stageId: scarce.boss.stageId } }), 0);
  });

  await t.test('Normal keeps its mapped three questions, HP 2, pass at two and fail/retry at three', async () => {
    const start = `/stages/${main.normal.stageId}/attempts`;
    let state = data(await request(start, owner, resumeOrStart), 201);
    assert.equal(state.maxQuestionCount, 3);
    assert.equal(state.hp, 2);
    assert.equal('bossCombat' in state, false);
    let nextQuestion = state.currentQuestion;
    for (let index = 0; index < 2; index += 1) {
      assert.equal(nextQuestion.id, main.normalIds[index]);
      state = data(await request(`/attempts/${state.attemptId}/answers`, owner, await answerFor(main.normalIds[index], true)), 201);
      nextQuestion = state.nextQuestion;
    }
    assert.equal(state.status, 'PASSED');
    assert.equal(state.submittedCount, 2);
    assert.equal(nextQuestion, null);
    assert.equal('bossCombat' in state, false);
    assert.equal((await attempts.findOneByOrFail({ attemptId: state.attemptId })).bossCombatState, null);
    assert.equal(await snapshots.countBy({ attemptId: state.attemptId }), 0);

    let failure = data(await request(start, outsider, resumeOrStart), 201);
    for (const questionId of main.normalIds) {
      failure = data(await request(`/attempts/${failure.attemptId}/answers`, outsider, await answerFor(questionId)), 201);
    }
    assert.equal(failure.status, 'FAILED');
    assert.equal(failure.submittedCount, 3);
    const retry = data(await request(start, outsider, { mode: 'RETRY' }), 201);
    assert.equal(retry.attemptNo, 2);
    assert.equal(retry.currentQuestion.id, main.normalIds[0]);
  });

  let attemptId;
  let orderedIds;
  await t.test('authenticated concurrent Boss start creates one seven-question snapshot, then resumes it', async () => {
    const detail = data(await request(`/bosses/${main.boss.stageId}`, owner), 200);
    assert.equal(detail.maxQuestionCount, 7);
    assert.equal(detail.initialMonsterHp, 6);
    assert.equal(detail.requiredCorrectCount, 5);
    assert.equal((await request(bossStart(main), null, resumeOrStart)).status, 401);
    assert.equal((await request(bossStart(main), owner, { mode: 'INVALID' })).status, 422);
    const pair = await Promise.all([request(bossStart(main), owner, resumeOrStart), request(bossStart(main), owner, resumeOrStart)]);
    assert.deepEqual(pair.map(response => response.status).sort(), [200, 201]);
    const started = data(pair.find(response => response.status === 201), 201);
    const resumed = data(pair.find(response => response.status === 200), 200);
    assert.equal(started.resumed, false);
    assert.deepEqual(resumed, { ...started, resumed: true });
    assert.equal(started.maxQuestionCount, 7);
    assert.equal(started.hp, 6);
    assert.deepEqual(started.bossCombat, { consecutiveCorrectCount: 0, criticalUsed: false,
      defeatedAtQuestion: null, bonusQuestionCount: 0, bonusCorrectCount: 0 });
    assert.equal(started.currentQuestion.choices.length, 4);
    assert.ok(started.currentQuestion.choices.every(choice => !('isCorrect' in choice)));
    assert.equal('explanation' in started.currentQuestion, false);
    attemptId = started.attemptId;
    const rows = await snapshots.find({ where: { attemptId }, order: { questionOrder: 'ASC' } });
    orderedIds = rows.map(row => row.questionId);
    assert.deepEqual(rows.map(row => row.questionOrder), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(new Set(orderedIds).size, 7);
    assert.ok(orderedIds.every(id => main.eligibleIds.includes(id)));
    assert.equal(started.currentQuestion.id, orderedIds[0]);
    assert.equal(await attempts.countBy({ userId: owner.id, stageId: main.boss.stageId }), 1);
    assert.deepEqual(data(await request(bossAttempt(attemptId), owner), 200),
      Object.fromEntries(Object.entries(started).filter(([key]) => key !== 'resumed')));
  });

  await t.test('only the owner can read or submit the next assigned question; concurrent replay is idempotent', async () => {
    const path = `${bossAttempt(attemptId)}/answers`;
    const answer = await answerFor(orderedIds[0]);
    assert.equal((await request(bossAttempt(attemptId), outsider)).status, 404);
    assert.equal((await request(path, outsider, answer)).status, 404);
    assert.equal((await request(path, owner, await answerFor(main.normalIds[0]))).status, 409);
    assert.equal((await request(path, owner, await answerFor(orderedIds[1]))).status, 409);
    assert.equal(await submissions.countBy({ attemptId }), 0);
    const responses = await Promise.all([request(path, owner, answer), request(path, owner, answer)]);
    const states = responses.map(response => data(response, 201));
    assert.deepEqual(states.map(state => Boolean(state.duplicate)).sort(), [false, true]);
    assert.ok(states.every(state => state.nextQuestion.id === orderedIds[1] && state.submittedCount === 1));
    assert.equal(await submissions.countBy({ attemptId }), 1);
  });

  await t.test('reconnection retains the chosen order and saved answers after the available pool changes', async () => {
    const unselectedId = main.eligibleIds.find(id => !orderedIds.includes(id));
    await db.getRepository(E.Question).update({ questionId: unselectedId }, { status: 'RETIRED' });
    await save(E.StageQuestion, { stageId: scarce.normal.stageId, questionId: orderedIds[1], questionOrder: 4 });
    const fromGet = data(await request(bossAttempt(attemptId), owner), 200);
    const fromStart = data(await request(bossStart(main), owner, resumeOrStart), 200);
    assert.deepEqual(fromStart, { ...fromGet, resumed: true });
    assert.equal(fromGet.submittedCount, 1);
    assert.equal(fromGet.currentQuestion.id, orderedIds[1]);
    assert.deepEqual((await snapshots.find({ where: { attemptId }, order: { questionOrder: 'ASC' } })).map(row => row.questionId), orderedIds);
    for (const [index, questionId] of orderedIds.entries()) {
      if (index === 0) continue;
      const result = data(await request(`${bossAttempt(attemptId)}/answers`, owner, await answerFor(questionId)), 201);
      assert.equal(result.submittedCount, index + 1);
      assert.equal(result.nextQuestion?.id, orderedIds[index + 1]);
      assert.equal(result.status, index === 6 ? 'FAILED' : 'IN_PROGRESS');
    }
    assert.equal(await submissions.countBy({ attemptId }), 7);
  });

  await t.test('a write failure after inserting the snapshot rolls back both it and the new attempt', async testContext => {
    const retired = main.eligibleIds.find(id => !orderedIds.includes(id));
    await db.getRepository(E.Question).update({ questionId: retired }, { status: 'PUBLISHED' });
    const snapshotScope = { attempt: { userId: owner.id, stageId: main.boss.stageId } };
    const snapshotCount = await snapshots.countBy(snapshotScope);
    const originalSave = bossQuestions.save;
    const failure = testContext.mock.method(bossQuestions, 'save', async (...args) => {
      await originalSave(...args);
      throw AppError.unavailable('격리 DB 테스트 쓰기 장애');
    });
    const response = await request(bossStart(main), owner, { mode: 'RETRY' });
    assert.equal(failure.mock.callCount(), 1);
    assert.equal(response.status, 503);
    assert.equal(await attempts.countBy({ userId: owner.id, stageId: main.boss.stageId }), 1);
    assert.equal(await attempts.countBy({ userId: owner.id, stageId: main.boss.stageId, status: 'IN_PROGRESS' }), 0);
    assert.equal(await snapshots.countBy(snapshotScope), snapshotCount);
  });

  await t.test('a pre-combat seven-question snapshot retains its original HP and early pass', async () => {
    const player = await account('은행전투사용자');
    const existing = await save(E.LearningAttempt, { userId: player.id, stageId: main.boss.stageId, attemptNo: 1,
      maxQuestionCount: 7, requiredCorrectCount: 4, initialHp: 4, status: 'IN_PROGRESS' });
    await save(E.BossAttemptQuestion, main.eligibleIds.slice(0, 7).map((questionId, index) => ({
      attemptId: existing.attemptId, questionOrder: index + 1, questionId,
    })));
    let state = data(await request(bossStart(main), player, resumeOrStart), 200);
    assert.equal(state.attemptId, existing.attemptId);
    assert.equal(state.hp, 4);
    assert.equal('bossCombat' in state, false);
    let nextQuestion = state.currentQuestion;
    for (let correct = 1; correct <= 4; correct += 1) {
      state = data(await request(`${bossAttempt(state.attemptId)}/answers`, player, await answerFor(nextQuestion.id, true)), 201);
      nextQuestion = state.nextQuestion;
      assert.equal(state.status, correct < 4 ? 'IN_PROGRESS' : 'PASSED');
      assert.equal(state.hpAfter, 4 - correct);
      assert.equal('bossCombat' in state, false);
    }
    assert.equal(state.submittedCount, 4);
    assert.equal(nextQuestion, null);
    assert.equal(await snapshots.countBy({ attemptId: state.attemptId }), 7);
  });

  await t.test('a pre-migration Boss attempt without snapshots resumes its original Stage assignments', async () => {
    const stageId = main.boss.stageId;
    await save(E.StageQuestion, main.normalIds.slice(0, 2).map((questionId, index) => ({ stageId, questionId, questionOrder: index + 1 })));
    const existing = await save(E.LearningAttempt, { userId: legacy.id, stageId, attemptNo: 1, maxQuestionCount: 5,
      requiredCorrectCount: 4, initialHp: 4, status: 'IN_PROGRESS' });
    const restored = data(await request(bossStart(main), legacy, resumeOrStart), 200);
    assert.equal(restored.attemptId, existing.attemptId);
    assert.equal(restored.maxQuestionCount, 5);
    assert.equal('bossCombat' in restored, false);
    assert.equal(restored.currentQuestion.id, main.normalIds[0]);
    const advanced = data(await request(`${bossAttempt(restored.attemptId)}/answers`, legacy, await answerFor(main.normalIds[0])), 201);
    assert.equal(advanced.nextQuestion.id, main.normalIds[1]);
    assert.equal(await snapshots.countBy({ attemptId: restored.attemptId }), 0);
  });

  const scenarios = [
    { label: 'defeat on five with wrong and correct bonus answers', answers: 'TTTTTFT', hp: [5, 3, 2, 1, 0, 0, 0], criticalAt: 2, defeatedAt: 5, bonusCorrect: 1 },
    { label: 'wrong answer resets streak before defeat on six', answers: 'TFTTTTF', hp: [5, 5, 4, 2, 1, 0, 0], criticalAt: 4, defeatedAt: 6, bonusCorrect: 0 },
    { label: 'defeat on seven has no bonus questions', answers: 'TFTFTTT', hp: [5, 5, 4, 4, 3, 1, 0], criticalAt: 6, defeatedAt: 7, bonusCorrect: 0 },
    { label: 'four nonconsecutive correct answers fail after seven', answers: 'TFTFTFT', hp: [5, 5, 4, 4, 3, 3, 2], criticalAt: null, defeatedAt: null, bonusCorrect: 0 },
  ];
  const stageId = main.boss.stageId;
  const rewardExp = db.getRepository(E.ExpLedger);
  const rewardCoin = db.getRepository(E.CoinLedger);
  await db.getRepository(E.Stage).update({ stageId }, { rewardTotalExp: 10, rewardEconomyExp: 5, rewardCoin: 3 });

  for (const [scenarioIndex, scenario] of scenarios.entries()) {
    await t.test(scenario.label, async () => {
      const player = await account(`전투${scenarioIndex}`);
      await save(E.UserStageProgress, { userId: player.id, stageId: main.normal.stageId,
        progressStatus: 'PASSED', firstPassedAt: new Date() });
      const start = data(await request(bossStart(main), player, resumeOrStart), 201);
      const path = `${bossAttempt(start.attemptId)}/answers`;
      const expCriteria = { userId: player.id, sourceStageId: stageId };
      const coinCriteria = { userId: player.id, refId: stageId };
      assert.equal(start.hp, 6);
      assert.equal(start.maxQuestionCount, 7);
      let nextQuestion = start.currentQuestion;
      let streak = 0;
      let bonusCorrect = 0;
      let criticalReplay;
      let result;
      for (const [index, outcome] of [...scenario.answers].entries()) {
        const order = index + 1;
        const isCorrect = outcome === 'T';
        const isBonus = scenario.defeatedAt !== null && order > scenario.defeatedAt;
        const defeated = scenario.defeatedAt !== null && order >= scenario.defeatedAt;
        const requestBody = await answerFor(nextQuestion.id, isCorrect);
        streak = isCorrect ? streak + 1 : 0;
        if (isBonus && isCorrect) bonusCorrect += 1;
        if (scenarioIndex === 0 && (order === 2 || order === 7)) {
          const pair = await Promise.all([request(path, player, requestBody), request(path, player, requestBody)]);
          const graded = pair.map(response => data(response, 201));
          result = graded.find(answer => !answer.duplicate);
          assert.deepEqual(graded.find(answer => answer.duplicate), { ...result, duplicate: true });
          assert.equal(await submissions.countBy({ attemptId: start.attemptId }), order);
          if (order === 2) criticalReplay = { requestBody, result };
        } else if (scenarioIndex === 0 && order === 3) {
          const competing = { ...requestBody, submissionId: randomUUID() };
          const pair = await Promise.all([request(path, player, requestBody), request(path, player, competing)]);
          assert.deepEqual(pair.map(response => response.status).sort(), [201, 409]);
          result = data(pair.find(response => response.status === 201), 201);
          assert.equal(await submissions.countBy({ attemptId: start.attemptId }), order);
        } else {
          result = data(await request(path, player, requestBody), 201);
        }
        assert.equal(result.hpBefore, index === 0 ? 6 : scenario.hp[index - 1]);
        assert.equal(result.hpAfter, scenario.hp[index]);
        assert.equal(result.submittedCount, order);
        assert.equal(result.isCorrect, isCorrect);
        assert.deepEqual(result.bossCombat, {
          consecutiveCorrectCount: streak, criticalUsed: scenario.criticalAt !== null && order >= scenario.criticalAt,
          defeatedAtQuestion: defeated ? scenario.defeatedAt : null, bonusQuestionCount: defeated ? 7 - scenario.defeatedAt : 0,
          bonusCorrectCount: bonusCorrect, isBonusQuestion: isBonus, criticalTriggered: scenario.criticalAt === order,
        });
        nextQuestion = result.nextQuestion;
        if (order < 7) {
          assert.equal(result.status, 'IN_PROGRESS');
          assert.equal(result.endReason, null);
          assert.equal(result.rewardGranted, false);
          assert.ok(nextQuestion);
          const stored = await attempts.findOneByOrFail({ attemptId: start.attemptId });
          assert.equal(stored.status, 'IN_PROGRESS');
          assert.equal(stored.resultSavedAt, null);
          assert.equal(stored.endedAt, null);
          assert.equal(await rewardExp.countBy(expCriteria), 0);
          assert.equal(await rewardCoin.countBy(coinCriteria), 0);
          if (scenario.defeatedAt === order) {
            const get = data(await request(bossAttempt(start.attemptId), player), 200);
            const resumed = data(await request(bossStart(main), player, resumeOrStart), 200);
            assert.deepEqual(resumed, { ...get, resumed: true });
            assert.equal(get.hp, 0);
            assert.equal(get.currentQuestion.id, nextQuestion.id);
            assert.deepEqual(get.bossCombat, stored.bossCombatState);
          }
        }
      }

      const passed = scenario.defeatedAt !== null;
      assert.equal(result.status, passed ? 'PASSED' : 'FAILED');
      assert.equal(result.endReason, passed ? 'MONSTER_DEFEATED' : 'QUESTIONS_EXHAUSTED');
      assert.equal(result.bossCombat.bonusCorrectCount, scenario.bonusCorrect);
      assert.equal(result.nextQuestion, null);
      assert.equal(result.rewardGranted, passed);
      const stored = await attempts.findOneByOrFail({ attemptId: start.attemptId });
      assert.equal(stored.status, result.status);
      assert.equal(stored.finalHp, result.hpAfter);
      assert.equal(stored.submittedCount, 7);
      assert.ok(stored.resultSavedAt);
      const { isBonusQuestion, criticalTriggered, ...responseState } = result.bossCombat;
      assert.deepEqual(stored.bossCombatState, responseState);
      const rows = await submissions.find({ where: { attemptId: start.attemptId }, order: { sequenceNo: 'ASC' } });
      assert.deepEqual(rows.map(row => row.hpAfter), scenario.hp);
      assert.deepEqual(rows.map(row => row.isCorrect), [...scenario.answers].map(answer => answer === 'T'));
      assert.equal(await rewardExp.countBy(expCriteria), Number(passed));
      assert.equal(await rewardCoin.countBy(coinCriteria), Number(passed));

      if (scenarioIndex === 0) {
        const replayed = data(await request(path, player, criticalReplay.requestBody), 201);
        assert.deepEqual(replayed, { ...criticalReplay.result, duplicate: true });
        assert.equal(await submissions.countBy({ attemptId: start.attemptId }), 7);
        let retry = data(await request(bossStart(main), player, { mode: 'RETRY' }), 201);
        assert.equal(retry.hp, 6);
        const retryPath = `${bossAttempt(retry.attemptId)}/answers`;
        let nextQuestion = retry.currentQuestion;
        for (let order = 1; order <= 7; order += 1) {
          retry = data(await request(retryPath, player, await answerFor(nextQuestion.id, true)), 201);
          nextQuestion = retry.nextQuestion;
        }
        assert.equal(retry.status, 'PASSED');
        assert.equal(retry.rewardGranted, false);
        assert.equal(await rewardExp.countBy(expCriteria), 1);
        assert.equal(await rewardCoin.countBy(coinCriteria), 1);
        assert.equal((await rewardExp.findOneByOrFail(expCriteria)).totalExpAmount, 10);
        assert.equal((await rewardCoin.findOneByOrFail(coinCriteria)).amount, 3);
        assert.equal((await progress.findOneByOrFail({ userId: player.id, stageId })).firstPassAttemptId, start.attemptId);
      }
    });
  }
});
