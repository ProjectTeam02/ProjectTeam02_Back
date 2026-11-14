const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const configPath = process.env.LEREN_CALENDAR_HISTORY_PG_TEST_CONFIG;

// Explicit opt-in: ordinary npm test never writes to a database.
test('calendar and learning history against isolated PostgreSQL', { skip: !configPath, timeout: 120000 }, async t => {
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  assert.match(cfg.name, /^leren-calendar-it-[0-9a-f]{8}$/);
  assert.equal(cfg.host, '127.0.0.1');
  assert.equal(cfg.database, 'leren_calendar_it');
  assert.ok(Number.isInteger(cfg.port) && cfg.port !== 5433);
  const [container] = JSON.parse(execFileSync('docker', ['inspect', cfg.name], { encoding: 'utf8' }));
  assert.equal(container.Config.Labels['codex.purpose'], 'leren-calendar-history-integration');
  assert.equal(container.HostConfig.Tmpfs['/var/lib/postgresql'], 'rw');
  const binding = container.NetworkSettings.Ports['5432/tcp'][0];
  assert.equal(binding.HostIp, '127.0.0.1');
  assert.equal(Number(binding.HostPort), cfg.port);

  const E = require('@leren/database');
  const { DataSource } = require('typeorm');
  const root = path.resolve(__dirname, '../..');
  const env = require(root + '/src/config/env');
  const oldSecret = env.jwtAccessSecret;
  const oldOptions = { ...E.AppDataSource.options };
  const options = { ...oldOptions, host: cfg.host, port: cfg.port, database: cfg.database,
    username: 'postgres', password: cfg.password, ssl: false, synchronize: false, migrationsRun: false,
    migrations: [root + '/database/dist/migrations/*.js'], logging: false,
    extra: { options: '-c search_path=app,account,character,content,learning,reward,review,tutor,public', max: 12, application_name: 'leren-calendar-it' } };
  let admin, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (E.AppDataSource.isInitialized) await E.AppDataSource.destroy();
    if (admin?.isInitialized) await admin.destroy();
    E.AppDataSource.setOptions(oldOptions);
    env.jwtAccessSecret = oldSecret;
  });

  admin = new DataSource(options);
  await admin.initialize();
  const [database] = await admin.query('SELECT current_database() AS name');
  assert.equal(database.name, 'leren_calendar_it');
  assert.equal((await admin.query("SELECT to_regclass('account.users') AS existing"))[0].existing, null);
  await admin.query('CREATE SCHEMA app');
  await admin.runMigrations();
  E.AppDataSource.setOptions({ ...options, migrations: [] });
  await E.AppDataSource.initialize();
  env.jwtAccessSecret = crypto.randomBytes(32).toString('hex');

  const db = E.AppDataSource;
  const owner = await db.getRepository(E.User).save({ nickname: 'calendar owner', email: 'calendar-owner@example.test' });
  const other = await db.getRepository(E.User).save({ nickname: 'calendar other', email: 'calendar-other@example.test' });
  const session = await db.getRepository(E.UserSession).save({ userId: owner.userId,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'), loginMethod: 'EMAIL',
    expiresAt: new Date(Date.now() + 3600000) });
  const token = require(root + '/src/common/utils/token.util').issueAccessToken(owner, session.sessionId);
  const topic = await db.getRepository(E.Topic).save({ topicCode: 'CALENDAR_IT', topicNo: 1, title: '테스트 주제' });
  const stage = await db.getRepository(E.Stage).save({ topicId: topic.topicId, stageCode: 'IT-1', stageNo: 1,
    stageType: 'NORMAL', title: '테스트 단계', maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2 });
  server = await require(root + '/test/helpers/listen-test-server')(require(root + '/src/app'));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async url => {
    const response = await fetch(base + url, { headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  };
  const month = value => get(`/api/v1/calendar?month=${value}`);
  const day = value => get(`/api/v1/calendar/days/${value}`);
  const history = query => get(`/api/v1/learning/history${query || ''}`);
  const makePlan = (userId, scheduledDate) => db.getRepository(E.StudyPlan).save({
    userId, scheduledDate, stageId: stage.stageId, planType: 'NEW_LEARNING', title: '학습 일정', status: 'PLANNED',
  });
  const makeAttempt = (userId, attemptNo, date) => {
    const startedAt = new Date(`${date}T00:00:00+09:00`);
    const endedAt = new Date(startedAt.getTime() + 120000);
    return db.getRepository(E.LearningAttempt).save({ userId, stageId: stage.stageId, attemptNo,
      attemptType: 'PLAY', mode: 'START', status: 'PASSED', endReason: 'MONSTER_DEFEATED',
      maxQuestionCount: 3, requiredCorrectCount: 2, initialHp: 2, finalHp: 1,
      submittedCount: 0, correctCount: 0, startedAt, endedAt, resultSavedAt: endedAt });
  };
  const withoutMessage = data => assert.equal('emptyMessage' in data, false);

  await makePlan(other.userId, '2026-01-10');
  await makeAttempt(other.userId, 1, '2026-01-10');
  await t.test('empty month, day, and history ignore another user', async () => {
    const m = await month('2026-01');
    assert.equal(m.status, 200);
    assert.equal(m.body.success, true);
    assert.equal(m.body.data.emptyMessage, '아직 등록된 학습 일정이나 완료한 학습이 없습니다.');
    assert.equal(m.body.data.days.length, 31);
    assert.equal(m.body.data.completedDayCount, 0);
    assert.ok(m.body.data.days.every(row => row.completedCount === 0 && row.scheduledCount === 0));
    const d = await day('2026-01-10');
    assert.equal(d.status, 200);
    assert.deepEqual(d.body.data, { date: '2026-01-10', timeZone: 'Asia/Seoul', learningRecords: [], schedules: [],
      emptyMessage: '해당 날짜에 등록된 학습 일정이나 완료한 학습이 없습니다.' });
    const h = await history();
    assert.equal(h.status, 200);
    assert.deepEqual(h.body.data, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0,
      emptyMessage: '아직 학습 기록이 없습니다.' });
  });

  const planOnly = await makePlan(owner.userId, '2026-02-10');
  await t.test('scheduled plan alone preserves month and day responses', async () => {
    const m = (await month('2026-02')).body.data;
    assert.equal(m.completedDayCount, 0);
    assert.equal(m.days[9].scheduledCount, 1);
    assert.equal(m.days[9].completedCount, 0);
    withoutMessage(m);
    const d = (await day('2026-02-10')).body.data;
    assert.deepEqual(d.learningRecords, []);
    assert.deepEqual(d.schedules.map(row => row.planId), [planOnly.planId]);
    withoutMessage(d);
  });

  const completedOnly = await makeAttempt(owner.userId, 1, '2026-03-10');
  await t.test('completed attempt alone appears by Seoul completion date', async () => {
    const m = (await month('2026-03')).body.data;
    assert.equal(m.completedDayCount, 1);
    assert.equal(m.days[9].completedCount, 1);
    assert.equal(m.days[9].scheduledCount, 0);
    withoutMessage(m);
    const d = (await day('2026-03-10')).body.data;
    assert.deepEqual(d.schedules, []);
    assert.deepEqual(d.learningRecords.map(row => row.recordId), [completedOnly.attemptId]);
    withoutMessage(d);
    const adjacent = (await day('2026-03-11')).body.data;
    assert.deepEqual(adjacent.learningRecords, []);
    assert.equal(adjacent.emptyMessage, '해당 날짜에 등록된 학습 일정이나 완료한 학습이 없습니다.');
  });

  const bothPlan = await makePlan(owner.userId, '2026-04-10');
  const bothAttempt = await makeAttempt(owner.userId, 2, '2026-04-10');
  await t.test('plan and completion coexist without changing existing fields', async () => {
    const m = (await month('2026-04')).body.data;
    assert.equal(m.completedDayCount, 1);
    assert.equal(m.days[9].completedCount, 1);
    assert.equal(m.days[9].scheduledCount, 1);
    assert.deepEqual(Object.keys(m).sort(), ['year', 'month', 'timeZone', 'completedDayCount', 'streakDays',
      'streakAsOfDate', 'streakPolicy', 'days'].sort());
    const d = (await day('2026-04-10')).body.data;
    assert.deepEqual(d.schedules.map(row => row.planId), [bothPlan.planId]);
    assert.deepEqual(d.learningRecords.map(row => row.recordId), [bothAttempt.attemptId]);
    assert.deepEqual(Object.keys(d).sort(), ['date', 'timeZone', 'learningRecords', 'schedules'].sort());
  });

  await t.test('history keeps owner filtering and out-of-range pagination', async () => {
    const h = await history();
    assert.equal(h.status, 200);
    assert.deepEqual(h.body.data.items.map(row => row.recordId), [bothAttempt.attemptId, completedOnly.attemptId]);
    assert.equal(h.body.data.total, 2);
    withoutMessage(h.body.data);
    const page = await history('?page=3&pageSize=1');
    assert.equal(page.status, 200);
    assert.deepEqual(page.body.data, { items: [], page: 3, pageSize: 1, total: 2, totalPages: 2 });
    const filtered = await history('?status=FAILED');
    assert.equal(filtered.body.data.total, 0);
    assert.equal(filtered.body.data.emptyMessage, '아직 학습 기록이 없습니다.');
  });

  await t.test('Swagger documents populated and empty responses for all three APIs', async () => {
    const spec = await (await fetch(base + '/api-docs.json')).json();
    for (const [route, schemaName] of [
      ['/api/v1/calendar', 'CalendarMonthResponse'],
      ['/api/v1/calendar/days/{date}', 'CalendarDayResponse'],
      ['/api/v1/learning/history', 'LearningHistoryListResponse'],
    ]) {
      const response = spec.paths[route].get.responses[200].content['application/json'];
      assert.equal(response.schema.$ref, `#/components/schemas/${schemaName}`);
      assert.ok(spec.components.schemas[schemaName].properties.data.properties.emptyMessage);
      assert.ok(response.examples.populated.value.data);
      assert.ok(response.examples.empty.value.data.emptyMessage);
      withoutMessage(response.examples.populated.value.data);
    }
  });

  await t.test('database query errors remain 503 responses', async () => {
    await admin.query('ALTER TABLE learning.learning_attempts RENAME TO learning_attempts_test_unavailable');
    try {
      for (const route of ['/api/v1/calendar?month=2026-04', '/api/v1/calendar/days/2026-04-10', '/api/v1/learning/history']) {
        const response = await get(route);
        assert.equal(response.status, 503, route);
        assert.equal(response.body.success, false);
        assert.equal('emptyMessage' in response.body, false);
      }
    } finally {
      await admin.query('ALTER TABLE learning.learning_attempts_test_unavailable RENAME TO learning_attempts');
    }
  });

  // The calendar fixture owns topicNo 1; keep the Quiz seed's documented 1/2 slots free.
  await db.getRepository(E.Topic).update({ topicId: topic.topicId }, { topicNo: 99 });
  await require(root + '/database/dist/scripts/seed-minimal').seedMinimal();
  const quizStage = await db.getRepository(E.Stage).findOneByOrFail({ stageCode: '1-1' });
  const mappings = await db.getRepository(E.StageQuestion).find({
    where: { stageId: quizStage.stageId }, order: { questionOrder: 'ASC' },
  });
  const answers = await Promise.all(mappings.map(async mapping => ({
    questionId: mapping.questionId,
    correct: await db.getRepository(E.QuestionChoice).findOneByOrFail({ questionId: mapping.questionId, isCorrect: true }),
    wrong: await db.getRepository(E.QuestionChoice).findOneByOrFail({ questionId: mapping.questionId, isCorrect: false }),
  })));
  const quizUser = await db.getRepository(E.User).save({ nickname: 'quiz owner', email: 'quiz-owner@example.test' });
  const quizSession = await db.getRepository(E.UserSession).save({ userId: quizUser.userId,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'), loginMethod: 'EMAIL',
    expiresAt: new Date(Date.now() + 3600000) });
  const quizToken = require(root + '/src/common/utils/token.util').issueAccessToken(quizUser, quizSession.sessionId);
  const quizRequest = async (method, route, body, bearer = quizToken, extraHeaders = {}) => {
    const response = await fetch(base + `/api/v1${route}`, { method,
      headers: { authorization: `Bearer ${bearer}`, ...(body ? { 'content-type': 'application/json' } : {}), ...extraHeaders },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  const begin = () => quizRequest('POST', `/quizzes/stages/${quizStage.stageId}/attempts`);
  const read = id => quizRequest('GET', `/quizzes/attempts/${id}`);
  const submit = (id, index, correct) => quizRequest('POST', `/quizzes/${answers[index].questionId}/submit`,
    { attemptId: id, choiceId: (correct ? answers[index].correct : answers[index].wrong).choiceId });

  await t.test('normal Stage starts, resumes and hides answers before submission', async () => {
    const concurrentStarts = await Promise.all([begin(), begin()]);
    assert.deepEqual(concurrentStarts.map(row => row.status).sort(), [200, 201]);
    assert.equal(concurrentStarts[0].body.data.attemptId, concurrentStarts[1].body.data.attemptId);
    const started = concurrentStarts.find(row => row.status === 201);
    assert.equal(started.status, 201);
    assert.equal(started.body.data.hp, 2);
    assert.equal(started.body.data.currentQuestion.id, answers[0].questionId);
    assert.equal('explanation' in started.body.data.currentQuestion, false);
    assert.equal('isCorrect' in started.body.data.currentQuestion.choices[0], false);
    const resumed = await begin();
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.data.attemptId, started.body.data.attemptId);
    assert.equal((await read(started.body.data.attemptId)).body.data.currentQuestion.id, answers[0].questionId);
    assert.equal((await quizRequest('GET', `/quizzes/attempts/${started.body.data.attemptId}/result`)).status, 409);
    assert.equal((await quizRequest('POST', `/quizzes/stages/${quizStage.stageId}/attempts`, null, '')).status, 401);
    assert.equal((await quizRequest('POST', '/quizzes/stages/123e4567-e89b-42d3-a456-426614174099/attempts')).status, 404);
  });

  const first = (await begin()).body.data.attemptId;
  await t.test('two correct answers immediately pass, grant once, and appear in history/calendar', async () => {
    const keyedAnswer = (index, key, correct = true) => quizRequest('POST', `/quizzes/${answers[index].questionId}/submit`,
      { attemptId: first, choiceId: (correct ? answers[index].correct : answers[index].wrong).choiceId },
      quizToken, { 'Idempotency-Key': key });
    const concurrentAnswers = await Promise.all([
      keyedAnswer(0, 'quiz-answer-1'), keyedAnswer(0, 'quiz-answer-1'),
    ]);
    assert.deepEqual(concurrentAnswers.map(row => row.status), [201, 201]);
    assert.deepEqual(concurrentAnswers.map(row => Boolean(row.body.data.duplicate)).sort(), [false, true]);
    assert.equal(concurrentAnswers[0].body.data.hpAfter, 1);
    const replay = await keyedAnswer(0, 'quiz-answer-1');
    assert.equal(replay.status, 201);
    assert.equal(replay.body.data.duplicate, true);
    assert.equal(replay.body.data.hpAfter, 1);
    assert.equal((await keyedAnswer(0, 'quiz-answer-1', false)).status, 409);
    assert.equal((await keyedAnswer(1, 'quiz-answer-1')).status, 409);
    assert.equal((await db.getRepository(E.QuestionSubmission).countBy({ attemptId: first })), 1);
    assert.equal((await read(first)).body.data.currentQuestion.id, answers[1].questionId);
    const completed = await keyedAnswer(1, 'quiz-answer-2');
    assert.equal(completed.status, 201);
    assert.equal(completed.body.data.hpBefore, 1);
    assert.equal(completed.body.data.hpAfter, 0);
    assert.equal(completed.body.data.status, 'PASSED');
    const submittedQuestion = await db.getRepository(E.Question).findOneByOrFail({ questionId: answers[1].questionId });
    assert.equal(completed.body.data.explanation, submittedQuestion.explanation);
    assert.equal(completed.body.data.endReason, 'MONSTER_DEFEATED');
    assert.equal(completed.body.data.rewardGranted, true);
    const terminalReplay = await keyedAnswer(1, 'quiz-answer-2');
    assert.equal(terminalReplay.status, 201);
    assert.equal(terminalReplay.body.data.duplicate, true);
    assert.equal(terminalReplay.body.data.status, 'PASSED');
    assert.equal((await keyedAnswer(0, 'quiz-answer-1')).body.data.status, 'IN_PROGRESS');
    assert.equal((await read(first)).body.data.currentQuestion, null);
    assert.equal((await quizRequest('GET', `/quizzes/attempts/${first}/result`)).body.data.status, 'PASSED');
    assert.equal((await submit(first, 2, true)).status, 409);
    const stored = await db.getRepository(E.LearningAttempt).findOneByOrFail({ attemptId: first });
    assert.ok(stored.endedAt && stored.resultSavedAt);
    assert.equal(stored.isFirstPass, true);
    assert.equal((await db.getRepository(E.ExpLedger).countBy({ userId: quizUser.userId })), 1);
    assert.equal((await db.getRepository(E.CoinLedger).countBy({ userId: quizUser.userId })), 1);
    const growth = await db.getRepository(E.UserGrowth).findOneByOrFail({ userId: quizUser.userId });
    const wallet = await db.getRepository(E.UserWallet).findOneByOrFail({ userId: quizUser.userId });
    assert.equal(growth.totalExp, quizStage.rewardTotalExp);
    assert.equal(growth.economyExp, quizStage.rewardEconomyExp);
    assert.equal(wallet.coinBalance, quizStage.rewardCoin);
    const progress = await db.getRepository(E.UserStageProgress).findOneByOrFail({ userId: quizUser.userId, stageId: quizStage.stageId });
    assert.equal(progress.progressStatus, 'PASSED');
    assert.equal(progress.firstPassAttemptId, first);
    const ownHistory = await quizRequest('GET', '/learning/history');
    assert.equal(ownHistory.body.data.items[0].recordId, first);
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(stored.endedAt);
    const ownDay = await quizRequest('GET', `/calendar/days/${date}`);
    assert.equal(ownDay.body.data.learningRecords[0].recordId, first);
    const ownMonth = await quizRequest('GET', `/calendar?month=${date.slice(0, 7)}`);
    assert.equal(ownMonth.body.data.completedDayCount, 1);
  });

  await t.test('retry wrong/correct/wrong fails without changing rewards', async () => {
    const retry = await begin();
    assert.equal(retry.body.data.mode, 'RETRY');
    const id = retry.body.data.attemptId;
    const a = await submit(id, 0, false);
    assert.equal(a.body.data.hpBefore, 2); assert.equal(a.body.data.hpAfter, 2);
    assert.equal((await submit(id, 1, true)).body.data.hpAfter, 1);
    const c = await submit(id, 2, false);
    assert.equal(c.body.data.hpAfter, 1);
    assert.equal(c.body.data.status, 'FAILED');
    assert.equal(c.body.data.endReason, 'QUESTIONS_EXHAUSTED');
    assert.equal((await db.getRepository(E.ExpLedger).countBy({ userId: quizUser.userId })), 1);
    assert.equal((await db.getRepository(E.CoinLedger).countBy({ userId: quizUser.userId })), 1);
  });

  await t.test('retry wrong/correct/correct passes without a second reward', async () => {
    const id = (await begin()).body.data.attemptId;
    assert.equal((await submit(id, 0, false)).body.data.hpAfter, 2);
    assert.equal((await submit(id, 1, true)).body.data.hpAfter, 1);
    const result = await submit(id, 2, true);
    assert.equal(result.body.data.hpAfter, 0);
    assert.equal(result.body.data.status, 'PASSED');
    assert.equal(result.body.data.rewardGranted, false);
    assert.equal((await db.getRepository(E.ExpLedger).countBy({ userId: quizUser.userId })), 1);
  });

  await t.test('wrong answers never reduce HP; owner, choice and duplicate guards hold', async () => {
    const id = (await begin()).body.data.attemptId;
    const wrongChoice = answers[1].wrong.choiceId;
    assert.equal((await quizRequest('POST', `/quizzes/${answers[1].questionId}/submit`,
      { attemptId: id, choiceId: answers[1].correct.choiceId })).status, 409);
    assert.equal((await quizRequest('POST', `/quizzes/${answers[0].questionId}/submit`, { attemptId: id, choiceId: wrongChoice })).status, 422);
    assert.equal((await quizRequest('GET', `/quizzes/attempts/${id}`, null, token)).status, 404);
    assert.equal((await quizRequest('POST', `/quizzes/${answers[0].questionId}/submit`, { attemptId: id, choiceId: answers[0].correct.choiceId }, token)).status, 404);
    assert.equal((await submit(id, 0, false)).body.data.hpAfter, 2);
    assert.equal((await submit(id, 0, false)).status, 409);
    const concurrent = await Promise.all([submit(id, 1, false), submit(id, 1, false)]);
    assert.deepEqual(concurrent.map(row => row.status).sort(), [201, 409]);
    const last = await submit(id, 2, false);
    assert.equal(last.body.data.status, 'FAILED');
    assert.equal(last.body.data.hpAfter, 2);
    assert.equal((await db.getRepository(E.QuestionSubmission).countBy({ attemptId: id })), 3);
  });

  await t.test('reward configuration failure rolls back terminal answer and state', async () => {
    const otherQuizUser = await db.getRepository(E.User).save({ nickname: 'rollback user', email: 'rollback-user@example.test' });
    const otherSession = await db.getRepository(E.UserSession).save({ userId: otherQuizUser.userId,
      refreshTokenHash: crypto.randomBytes(32).toString('hex'), loginMethod: 'EMAIL',
      expiresAt: new Date(Date.now() + 3600000) });
    const otherToken = require(root + '/src/common/utils/token.util').issueAccessToken(otherQuizUser, otherSession.sessionId);
    const started = await quizRequest('POST', `/quizzes/stages/${quizStage.stageId}/attempts`, null, otherToken);
    const id = started.body.data.attemptId;
    const answer = (index, correct) => quizRequest('POST', `/quizzes/${answers[index].questionId}/submit`,
      { attemptId: id, choiceId: (correct ? answers[index].correct : answers[index].wrong).choiceId }, otherToken);
    assert.equal((await answer(0, true)).status, 201);
    await db.getRepository(E.Stage).update({ stageId: quizStage.stageId }, { rewardCoin: null });
    try {
      assert.equal((await answer(1, true)).status, 503);
      const attempt = await db.getRepository(E.LearningAttempt).findOneByOrFail({ attemptId: id });
      assert.equal(attempt.status, 'IN_PROGRESS');
      assert.equal(attempt.submittedCount, 1);
      assert.equal((await db.getRepository(E.QuestionSubmission).countBy({ attemptId: id })), 1);
      assert.equal((await db.getRepository(E.ExpLedger).countBy({ userId: otherQuizUser.userId })), 0);
    } finally {
      await db.getRepository(E.Stage).update({ stageId: quizStage.stageId }, { rewardCoin: quizStage.rewardCoin });
    }
  });

  await t.test('a prior PASSED attempt without progress cannot earn first-clear rewards again', async () => {
    const pastUser = await db.getRepository(E.User).save({ nickname: 'past passer', email: 'past-passer@example.test' });
    const pastSession = await db.getRepository(E.UserSession).save({ userId: pastUser.userId,
      refreshTokenHash: crypto.randomBytes(32).toString('hex'), loginMethod: 'EMAIL',
      expiresAt: new Date(Date.now() + 3600000) });
    const pastToken = require(root + '/src/common/utils/token.util').issueAccessToken(pastUser, pastSession.sessionId);
    const old = await db.getRepository(E.LearningAttempt).save({
      userId: pastUser.userId, stageId: quizStage.stageId, attemptNo: 1,
      attemptType: 'PLAY', mode: 'START', status: 'PASSED', endReason: 'MONSTER_DEFEATED',
      maxQuestionCount: 3, requiredCorrectCount: 2, initialHp: 2, finalHp: 0,
      submittedCount: 2, correctCount: 2, endedAt: new Date(),
    });
    const retry = await quizRequest('POST', `/quizzes/stages/${quizStage.stageId}/attempts`, null, pastToken);
    assert.equal(retry.status, 201);
    assert.equal(retry.body.data.mode, 'RETRY');
    const id = retry.body.data.attemptId;
    for (const index of [0, 1]) {
      const response = await quizRequest('POST', `/quizzes/${answers[index].questionId}/submit`,
        { attemptId: id, choiceId: answers[index].correct.choiceId }, pastToken);
      assert.equal(response.status, 201);
      if (index === 1) assert.equal(response.body.data.rewardGranted, false);
    }
    assert.equal((await db.getRepository(E.ExpLedger).countBy({ userId: pastUser.userId })), 0);
    assert.equal((await db.getRepository(E.CoinLedger).countBy({ userId: pastUser.userId })), 0);
    const progress = await db.getRepository(E.UserStageProgress).findOneByOrFail({ userId: pastUser.userId, stageId: quizStage.stageId });
    assert.equal(progress.firstPassAttemptId, old.attemptId);
  });

  await t.test('Stage entry rejects locked, unprepared and Boss stages', async () => {
    const next = await db.getRepository(E.Stage).save({
      topicId: quizStage.topicId, stageCode: 'IT-LOCKED', stageNo: 2,
      stageType: 'NORMAL', title: '다음 일반 Stage', status: 'PUBLISHED',
      maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2,
      rewardTotalExp: 10, rewardEconomyExp: 10, rewardCoin: 10,
    });
    assert.equal((await quizRequest('POST', `/quizzes/stages/${next.stageId}/attempts`, null, token)).status, 403);
    assert.equal((await quizRequest('POST', `/quizzes/stages/${next.stageId}/attempts`)).status, 503);
    const boss = await db.getRepository(E.Stage).save({
      topicId: quizStage.topicId, stageCode: 'IT-BOSS', stageNo: 3,
      stageType: 'BOSS', title: '보스 Stage', status: 'PUBLISHED',
      maxQuestionCount: 5, requiredCorrectCount: 4, initialMonsterHp: 4,
    });
    assert.equal((await quizRequest('POST', `/quizzes/stages/${boss.stageId}/attempts`)).status, 422);
  });

  await t.test('legacy approved-question GET keeps the frontend fields and hides the pre-answer explanation', async () => {
    const questionRepo = db.getRepository(E.Question);
    const questionId = answers[0].questionId;
    const question = await questionRepo.findOneByOrFail({ questionId });
    await questionRepo.update({ questionId }, { status: 'APPROVED' });
    try {
      const generated = await quizRequest('GET', `/quizzes/generate?conceptId=${question.conceptId}`);
      assert.equal(generated.status, 200);
      assert.equal(generated.body.data.id, questionId);
      assert.equal(generated.body.data.title, question.questionText);
      assert.equal(generated.body.data.explanation, null);
      assert.equal(generated.body.data.choices.length, 4);
      assert.equal('isCorrect' in generated.body.data.choices[0], false);
    } finally {
      await questionRepo.update({ questionId }, { status: question.status });
    }
  });
});
