const assert = require('node:assert/strict');
const test = require('node:test');
const { randomBytes, randomInt, randomUUID } = require('node:crypto');
const listenTestServer = require('../helpers/listen-test-server');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('wrong answer collection with Express and isolated PostgreSQL', { skip: !config, timeout: 120000 }, async t => {
  const E = require('@leren/database');
  const { AppDataSource: db } = E;
  const env = require('../../src/config/env');
  const { issueAccessToken } = require('../../src/common/utils/token.util');
  const oldOptions = { ...db.options };
  const oldSecret = env.jwtAccessSecret;
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db.isInitialized) await db.destroy();
    db.setOptions(oldOptions);
    env.jwtAccessSecret = oldSecret;
  });

  const options = JSON.parse(config);
  db.setOptions({ host: '127.0.0.1', port: options.port, database: options.database, username: options.username,
    password: options.password, ssl: false, synchronize: false, migrationsRun: false });
  await db.initialize();
  env.jwtAccessSecret = randomBytes(32).toString('hex');
  server = await listenTestServer(require('../../src/app'));
  const base = `http://127.0.0.1:${server.address().port}`;
  const suffix = randomBytes(4).toString('hex');
  const combatRules = db.getMetadata(E.LearningAttempt).columns.some(column => column.propertyName === 'bossCombatState');
  const save = (entity, row) => db.getRepository(entity).save(row);
  const items = db.getRepository(E.ReviewItem);
  const attempts = db.getRepository(E.LearningAttempt);
  const submissions = db.getRepository(E.QuestionSubmission);
  const missions = db.getRepository(E.ReviewMission);
  const topic = await save(E.Topic, { topicCode: `WR-${suffix}`, topicNo: 27000 + randomInt(1000), title: '오답 테스트', status: 'PUBLISHED' });
  const concept = await save(E.Concept, { conceptCode: `WR-${suffix}`, topicId: topic.topicId, title: '개념', status: 'PUBLISHED' });
  const stage = { topicId: topic.topicId, status: 'PUBLISHED', rewardTotalExp: 10, rewardEconomyExp: 5, rewardCoin: 3 };
  const normal = await save(E.Stage, { ...stage, stageCode: `WR-N-${suffix}`, stageNo: 1, stageType: 'NORMAL', title: '일반',
    maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2 });
  const parallel = await save(E.Stage, { ...stage, stageCode: `WR-P-${suffix}`, stageNo: 2, stageType: 'NORMAL', title: '일반 2',
    maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2 });
  const boss = await save(E.Stage, { ...stage, stageCode: `WR-B-${suffix}`, stageNo: 3, stageType: 'BOSS', title: 'Boss',
    maxQuestionCount: 5, requiredCorrectCount: 4, initialMonsterHp: 4 });
  const questions = await save(E.Question, Array.from({ length: 10 }, (_, index) => ({ questionCode: `WR-${suffix}-${index}`,
    conceptId: concept.conceptId, questionText: '문항', explanation: '테스트 해설', generatedBy: 'MANUAL', status: 'PUBLISHED' })));
  await save(E.QuestionChoice, questions.flatMap(question => [1, 2, 3, 4].map(baseOrder => ({ questionId: question.questionId,
    baseOrder, choiceText: `보기 ${baseOrder}`, isCorrect: baseOrder === 1 }))));
  await save(E.StageQuestion, [
    ...[normal, parallel].flatMap(row => questions.slice(0, 3).map((question, index) => ({ stageId: row.stageId,
      questionId: question.questionId, questionOrder: index + 1 }))),
    ...questions.slice(3, 8).map((question, index) => ({ stageId: boss.stageId, questionId: question.questionId, questionOrder: index + 1 })),
  ]);
  await db.createQueryBuilder().insert().into(E.LevelThreshold).values([
    { scope: 'ACCOUNT', level: 1, requiredExp: 0 }, { scope: 'ECONOMY', level: 1, requiredExp: 0 },
  ]).orIgnore().execute();

  async function user(label, unlock) {
    const account = await save(E.User, { nickname: `${label}${suffix}` });
    if (unlock) await save(E.UserStageProgress, { userId: account.userId, stageId: unlock.stageId, progressStatus: 'PASSED', firstPassedAt: new Date() });
    const session = await save(E.UserSession, { userId: account.userId, loginMethod: 'EMAIL',
      refreshTokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 600000) });
    return { id: account.userId, token: issueAccessToken(account, session.sessionId) };
  }

  async function http(method, path, actor, body, extraHeaders = {}) {
    const headers = { ...(actor && { authorization: `Bearer ${actor.token}` }), ...extraHeaders };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${base}/api/v1${path}`, { method, headers, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  }
  function data(response, status = 200) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    assert.equal(response.body.success, true);
    return response.body.data;
  }
  const start = async (actor, row, mode = 'START') => data(await http('POST',
    row === boss ? `/bosses/${row.stageId}/attempts` : `/stages/${row.stageId}/attempts`, actor, { mode }), 201);
  const wrong = actor => http('GET', '/reviews/items?source=WRONG', actor);
  const bookmark = (actor, method, questionId) => http(method, `/questions/${questionId}/bookmark`, actor);
  const stored = (actor, questionCode) => items.findOneByOrFail({ userId: actor.id, questionCode });
  const counts = (actor, attemptId) => Promise.all([
    attempts.findOneByOrFail({ attemptId }), submissions.countBy({ attemptId }),
    items.countBy({ userId: actor.id }), missions.countBy({ userId: actor.id }),
  ]);

  async function prepare(state, correct) {
    const questionId = (state.currentQuestion || state.nextQuestion).id;
    const choice = await db.getRepository(E.QuestionChoice).findOneByOrFail({ questionId, baseOrder: correct ? 1 : 2 });
    return { questionId, choiceId: choice.choiceId, submissionId: randomUUID() };
  }
  const submit = (actor, row, state, answer) => http('POST', row === boss ? `/boss-attempts/${state.attemptId}/answers` : `/attempts/${state.attemptId}/answers`, actor, answer);
  const grade = async (actor, row, state, correct) => data(await submit(actor, row, state, await prepare(state, correct)), 201);
  const legacy = (actor, state, answer) => http('POST', `/quizzes/${answer.questionId}/submit`, actor,
    { attemptId: state.attemptId, choiceId: answer.choiceId }, { 'Idempotency-Key': answer.submissionId });

  await t.test('Normal collects only saved wrong answers, replays once, and merges with manual bookmarks', async () => {
    const actor = await user('오답일반');
    const other = await user('다른사용자');
    const opened = await start(actor, normal);
    assert.deepEqual(data(await wrong(actor)).items, []);
    const firstAnswer = await prepare(opened, false);
    const responses = await Promise.all([legacy(actor, opened, firstAnswer), legacy(actor, opened, firstAnswer)]);
    const graded = responses.map(response => data(response, 201));
    assert.deepEqual(graded.map(answer => Boolean(answer.duplicate)).sort(), [false, true]);
    const [first] = graded;
    const firstItem = await stored(actor, questions[0].questionCode);
    assert.equal(firstItem.wrongCount, 1);
    assert.equal(firstItem.firstReason, 'WRONG');
    assert.equal(firstItem.sourceStageId, normal.stageId);
    assert.equal(firstItem.conceptCode, concept.conceptCode);
    assert.equal(firstItem.lastAnswerResult, 'WRONG');
    assert.equal(firstItem.isBookmarked, false);
    assert.deepEqual((await counts(actor, opened.attemptId)).slice(1), [1, 1, 0]);
    assert.deepEqual(data(await wrong(other)).items, []);
    assert.equal((await wrong(null)).status, 401);

    const correct = await grade(actor, normal, first, true);
    assert.equal(correct.isCorrect, true);
    assert.equal(await items.countBy({ userId: actor.id, questionCode: questions[1].questionCode }), 0);
    const markedCorrect = data(await bookmark(actor, 'PUT', questions[1].questionId));
    assert.equal(markedCorrect.bookmarked, true);
    assert.equal((await stored(actor, questions[1].questionCode)).firstReason, 'BOOKMARK');
    assert.equal((await stored(actor, questions[1].questionCode)).wrongCount, 0);

    const finished = await grade(actor, normal, correct, false);
    assert.equal(finished.status, 'FAILED');
    const markedWrong = data(await bookmark(actor, 'PUT', firstAnswer.questionId));
    assert.equal(markedWrong.reviewItemId, firstItem.reviewItemId);
    const retry = await start(actor, normal, 'RETRY');
    await grade(actor, normal, retry, false);
    const repeated = await stored(actor, questions[0].questionCode);
    assert.equal(repeated.firstReason, 'WRONG');
    assert.equal(repeated.isBookmarked, true);
    assert.equal(repeated.wrongCount, 2);
    assert.equal(data(await bookmark(actor, 'DELETE', firstAnswer.questionId)).bookmarked, false);
    assert.equal((await stored(actor, questions[0].questionCode)).wrongCount, 2);
    assert.deepEqual(data(await wrong(actor)).items.map(row => row.questionCode).sort(), [questions[0].questionCode, questions[2].questionCode].sort());
    assert.deepEqual(data(await http('GET', '/reviews/items?source=BOOKMARK', actor)).items.map(row => row.reviewItemId), [markedCorrect.reviewItemId]);
    assert.equal(await missions.countBy({ userId: actor.id }), 0);
  });

  await t.test('concurrent submissions in distinct attempts and a bookmark preserve every change on one item', async () => {
    const actor = await user('동시오답', normal);
    const first = await start(actor, normal);
    const second = await start(actor, parallel);
    const mark = data(await bookmark(actor, 'PUT', first.currentQuestion.id));
    const results = await Promise.all([
      grade(actor, normal, first, false), grade(actor, parallel, second, false), bookmark(actor, 'PUT', first.currentQuestion.id),
    ]);
    assert.equal(data(results[2]).reviewItemId, mark.reviewItemId);
    const row = await stored(actor, questions[0].questionCode);
    assert.equal(row.reviewItemId, mark.reviewItemId);
    assert.equal(row.firstReason, 'BOOKMARK');
    assert.equal(row.isBookmarked, true);
    assert.equal(row.wrongCount, 2);
    assert.equal(await items.countBy({ userId: actor.id }), 1);
    assert.equal(await submissions.countBy({ attemptId: first.attemptId, isCorrect: false }), 1);
    assert.equal(await submissions.countBy({ attemptId: second.attemptId, isCorrect: false }), 1);
  });

  await t.test('Boss records a wrong answer and replay without collecting unseen questions', async () => {
    const actor = await user('오답보스', parallel);
    const state = await start(actor, boss);
    const wrongAnswer = await prepare(state, false);
    const first = data(await submit(actor, boss, state, wrongAnswer), 201);
    assert.equal(first.isCorrect, false);
    assert.equal(data(await submit(actor, boss, state, wrongAnswer), 201).duplicate, true);
    const rows = data(await wrong(actor)).items;
    assert.deepEqual(rows.map(row => row.questionId), [wrongAnswer.questionId]);
    assert.equal(rows[0].sourceStageId, boss.stageId);
    assert.equal(rows[0].wrongCount, 1);
    assert.deepEqual((await counts(actor, state.attemptId)).slice(1), [1, 1, 0]);
  });

  await t.test('review visibility is rechecked when a collected question is retired', async testContext => {
    const actor = await user('복습공개');
    const outsider = await user('복습타인');
    const opened = await start(actor, normal);
    await grade(actor, normal, opened, false);
    const question = questions[0];
    assert.equal(data(await wrong(actor)).total, 1);
    const mission = await save(E.ReviewMission, { userId: actor.id, conceptCode: concept.conceptCode,
      firstRegisteredAt: new Date(), dueDate: new Date().toISOString().slice(0, 10), status: 'AVAILABLE', targetQuestionCount: 1 });
    const startPath = `/reviews/missions/${mission.missionId}/attempts`;
    assert.equal((await http('POST', startPath, outsider)).status, 404);
    const first = data(await http('POST', startPath, actor), 201);
    const unfinished = data(await http('POST', startPath, actor), 201);
    const firstPath = `/review-attempts/${first.reviewAttemptId}`;
    const unfinishedPath = `/review-attempts/${unfinished.reviewAttemptId}`;
    const baseAnswer = await prepare(opened, true);
    const correct = { ...baseAnswer, submissionId: first.answers[0].submissionId };
    assert.equal((await http('GET', firstPath, outsider)).status, 404);
    assert.equal((await http('POST', `${firstPath}/answers`, outsider, correct)).status, 404);
    const completed = data(await http('POST', `${firstPath}/answers`, actor, correct));
    assert.equal(completed.result.isCorrect, true);
    assert.equal((await stored(actor, question.questionCode)).wrongCount, 1);

    const questionRepo = db.getRepository(E.Question);
    testContext.after(() => questionRepo.update({ questionId: question.questionId }, { status: 'PUBLISHED' }));
    await questionRepo.update({ questionId: question.questionId }, { status: 'RETIRED' });
    const hidden = data(await wrong(actor));
    assert.deepEqual(hidden.items, []);
    assert.equal(hidden.total, 0);
    assert.equal((await bookmark(actor, 'PUT', question.questionId)).status, 404);
    assert.equal(data(await bookmark(actor, 'DELETE', question.questionId)).bookmarked, false);
    for (const response of [await http('GET', firstPath, actor), await http('POST', `${firstPath}/answers`, actor, correct),
      await http('POST', `${unfinishedPath}/answers`, actor, { ...baseAnswer, submissionId: unfinished.answers[0].submissionId })]) {
      assert.equal(response.status, 404);
      assert.equal(response.body.data, undefined);
    }
    assert.equal((await db.getRepository(E.ReviewSubmission).findOneByOrFail({ submissionId: unfinished.answers[0].submissionId })).submittedAt, null);
    assert.equal((await stored(actor, question.questionCode)).wrongCount, 1);
    await missions.update({ missionId: mission.missionId }, { status: 'AVAILABLE' });
    assert.equal((await http('POST', startPath, actor)).status, 409);
    assert.equal(await db.getRepository(E.ReviewAttempt).countBy({ missionId: mission.missionId }), 2);
  });

  await t.test('wrong-count write failure rolls back a Normal answer and allows the same request after repair', async () => {
    const actor = await user('오답롤백');
    const opened = await start(actor, normal);
    const answer = await prepare(opened, false);
    const mark = data(await bookmark(actor, 'PUT', answer.questionId));
    await items.update({ reviewItemId: mark.reviewItemId }, { wrongCount: 2147483647 });
    const before = await counts(actor, opened.attemptId);
    const original = await items.findOneByOrFail({ reviewItemId: mark.reviewItemId });
    const failed = await legacy(actor, opened, answer);
    assert.equal(failed.status, 503, JSON.stringify(failed.body));
    assert.deepEqual(await counts(actor, opened.attemptId), before);
    assert.deepEqual(await items.findOneByOrFail({ reviewItemId: mark.reviewItemId }), original);
    await items.update({ reviewItemId: mark.reviewItemId }, { wrongCount: 0 });
    data(await legacy(actor, opened, answer), 201);
    assert.deepEqual((await counts(actor, opened.attemptId)).slice(1), [1, 1, 0]);
    assert.equal((await items.findOneByOrFail({ reviewItemId: mark.reviewItemId })).wrongCount, 1);
  });

  if (combatRules) {
    await t.test('Boss bonus wrong answers count and a failed seventh collection rolls back first-clear rewards', async () => {
      const actor = await user('보너스오답', parallel);
      const opened = await start(actor, boss);
      assert.equal(opened.maxQuestionCount, 7);
      let state = opened;
      for (let index = 0; index < 5; index += 1) state = await grade(actor, boss, state, true);
      assert.equal(state.hpAfter, 0);
      assert.equal(state.status, 'IN_PROGRESS');
      assert.equal((await counts(actor, opened.attemptId))[2], 0);
      state = await grade(actor, boss, state, false);
      assert.equal(state.bossCombat.isBonusQuestion, true);
      const final = await prepare(state, false);
      const mark = data(await bookmark(actor, 'PUT', final.questionId));
      await items.update({ reviewItemId: mark.reviewItemId }, { wrongCount: 2147483647 });
      const before = await counts(actor, opened.attemptId);
      assert.equal((await submit(actor, boss, state, final)).status, 503);
      assert.deepEqual(await counts(actor, opened.attemptId), before);
      assert.equal(await db.getRepository(E.ExpLedger).countBy({ userId: actor.id }), 0);
      assert.equal(await db.getRepository(E.CoinLedger).countBy({ userId: actor.id }), 0);
      await items.update({ reviewItemId: mark.reviewItemId }, { wrongCount: 0 });
      const done = data(await submit(actor, boss, state, final), 201);
      assert.equal(done.status, 'PASSED');
      assert.equal(done.bossCombat.isBonusQuestion, true);
      assert.equal(done.rewardGranted, true);
      assert.deepEqual((await counts(actor, opened.attemptId)).slice(1), [7, 2, 0]);
      assert.equal((await items.findOneByOrFail({ reviewItemId: mark.reviewItemId })).wrongCount, 1);
      assert.equal(await db.getRepository(E.ExpLedger).countBy({ userId: actor.id }), 1);
      assert.equal(await db.getRepository(E.CoinLedger).countBy({ userId: actor.id }), 1);
    });

    await t.test('abandon retains the submitted wrong answer and leaves unsubmitted slots out of review', async () => {
      const actor = await user('포기오답', parallel);
      const opened = await start(actor, boss);
      const state = await grade(actor, boss, opened, false);
      await grade(actor, boss, state, true);
      assert.equal(data(await http('POST', `/attempts/${opened.attemptId}/abandon`, actor)).status, 'ABANDONED');
      const [attempt, count] = await counts(actor, opened.attemptId);
      assert.equal(attempt.status, 'ABANDONED');
      assert.equal(count, 2);
      assert.deepEqual(data(await wrong(actor)).items.map(row => row.questionId), [opened.currentQuestion.id]);
      assert.equal((await counts(actor, opened.attemptId))[3], 0);
    });
  }
});
