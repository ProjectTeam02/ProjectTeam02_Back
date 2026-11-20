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
  await admin.query(fs.readFileSync(path.join(root, 'database/sql/init/01_app_schema.sql'), 'utf8'));
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

  async function rewardFixture() {
    const user = await db.getRepository(E.User).save({ nickname: 'reward fixture', email: `reward-${crypto.randomUUID()}@example.test` });
    const session = await db.getRepository(E.UserSession).save({ userId: user.userId,
      refreshTokenHash: crypto.randomBytes(32).toString('hex'), loginMethod: 'EMAIL',
      expiresAt: new Date(Date.now() + 3600000) });
    const bearer = require(root + '/src/common/utils/token.util').issueAccessToken(user, session.sessionId);
    await db.getRepository(E.UserGrowth).save({ userId: user.userId, totalExp: 13, economyExp: 11 });
    await db.getRepository(E.UserWallet).save({ userId: user.userId, coinBalance: 17, version: 3 });
    return { userId: user.userId, bearer };
  }

  function rewardStart(fixture, route, relearn = false) {
    const prefix = route === 'legacy' ? '/quizzes/stages' : '/stages';
    const action = relearn ? 'relearn' : 'attempts';
    const body = route === 'official' && !relearn ? { mode: 'START' } : null;
    return quizRequest('POST', `${prefix}/${quizStage.stageId}/${action}`, body, fixture.bearer);
  }

  function rewardAnswer(fixture, route, attemptId, index, { correct = true, key = crypto.randomUUID() } = {}) {
    const { questionId } = answers[index];
    const { choiceId } = correct ? answers[index].correct : answers[index].wrong;
    return route === 'legacy'
      ? quizRequest('POST', `/quizzes/${questionId}/submit`, { attemptId, choiceId }, fixture.bearer, { 'Idempotency-Key': key })
      : quizRequest('POST', `/attempts/${attemptId}/answers`, { questionId, choiceId, submissionId: key }, fixture.bearer);
  }

  async function rewardSnapshot({ userId }, attemptId) {
    const [attempt, progress, submissions, exp, coin, growth, wallet] = await Promise.all([
      db.getRepository(E.LearningAttempt).findOneByOrFail({ attemptId }),
      db.getRepository(E.UserStageProgress).findOneByOrFail({ userId, stageId: quizStage.stageId }),
      db.getRepository(E.QuestionSubmission).find({ where: { attemptId }, order: { sequenceNo: 'ASC' } }),
      db.getRepository(E.ExpLedger).findBy({ userId }),
      db.getRepository(E.CoinLedger).findBy({ userId }),
      db.getRepository(E.UserGrowth).findOneByOrFail({ userId }),
      db.getRepository(E.UserWallet).findOneByOrFail({ userId }),
    ]);
    return { attempt, progress, submissions, exp, coin, growth, wallet };
  }

  async function startedReward(fixture, route) {
    const started = await rewardStart(fixture, route);
    assert.equal(started.status, 201);
    const { attemptId } = started.body.data;
    assert.equal((await rewardAnswer(fixture, route, attemptId, 0)).status, 201);
    return { attemptId, before: await rewardSnapshot(fixture, attemptId) };
  }

  async function assertSettledOnce(fixture, attemptId, before, reward = quizStage) {
    const state = await rewardSnapshot(fixture, attemptId);
    assert.equal(state.submissions.length, 2);
    assert.equal(state.attempt.status, 'PASSED');
    assert.equal(state.attempt.isFirstPass, true);
    assert.equal(state.attempt.rewardGranted, true);
    assert.equal(state.progress.progressStatus, 'PASSED');
    assert.equal(state.progress.firstPassAttemptId, attemptId);
    assert.equal(state.exp.length, 1);
    assert.equal(state.coin.length, 1);
    assert.equal(state.exp[0].attemptId, attemptId);
    assert.equal(state.exp[0].sourceStageId, quizStage.stageId);
    assert.equal(state.exp[0].totalExpAmount, reward.rewardTotalExp);
    assert.equal(state.exp[0].economyExpAmount, reward.rewardEconomyExp);
    assert.equal(state.coin[0].attemptId, attemptId);
    assert.equal(state.coin[0].refId, quizStage.stageId);
    assert.equal(state.coin[0].amount, reward.rewardCoin);
    assert.equal(state.coin[0].balanceBefore, before.wallet.coinBalance);
    assert.equal(state.growth.totalExp, before.growth.totalExp + reward.rewardTotalExp);
    assert.equal(state.growth.economyExp, before.growth.economyExp + reward.rewardEconomyExp);
    assert.equal(state.exp[0].totalExpAfter, state.growth.totalExp);
    assert.equal(state.exp[0].economyExpAfter, state.growth.economyExp);
    assert.equal(state.wallet.coinBalance, before.wallet.coinBalance + reward.rewardCoin);
    assert.equal(state.coin[0].balanceAfter, state.wallet.coinBalance);
    assert.equal(state.wallet.version, before.wallet.version + 1);
    return state;
  }

  for (const route of ['legacy', 'official']) {
    await t.test(`${route} first clear rolls back missing rewards and accepts the same request after repair`, async () => {
      const fixture = await rewardFixture();
      const { attemptId, before } = await startedReward(fixture, route);
      const key = crypto.randomUUID();
      const complete = () => rewardAnswer(fixture, route, attemptId, 1, { key });
      const changedField = route === 'legacy' ? 'rewardCoin' : 'rewardTotalExp';
      await db.getRepository(E.Stage).update({ stageId: quizStage.stageId }, { [changedField]: null });
      try {
        const failed = await complete();
        assert.equal(failed.status, 503);
        assert.deepEqual(failed.body, { success: false, message: 'Stage 최초 통과 보상이 설정되지 않았습니다.', code: 'SERVICE_UNAVAILABLE' });
        assert.equal(before.attempt.status, 'IN_PROGRESS');
        assert.equal(before.attempt.submittedCount, 1);
        assert.equal(before.submissions.length, 1);
        assert.equal(before.progress.progressStatus, 'IN_PROGRESS');
        assert.equal(before.exp.length, 0);
        assert.equal(before.coin.length, 0);
        assert.deepEqual(await rewardSnapshot(fixture, attemptId), before);
      } finally {
        await db.getRepository(E.Stage).update({ stageId: quizStage.stageId }, { [changedField]: quizStage[changedField] });
      }
      const settled = await complete();
      assert.equal(settled.status, 201);
      assert.equal(settled.body.data.rewardGranted, true);
      const committed = await assertSettledOnce(fixture, attemptId, before);
      const duplicate = await complete();
      assert.equal(duplicate.status, 201);
      assert.deepEqual(duplicate.body.data, { ...settled.body.data, duplicate: true });
      assert.equal((await rewardAnswer(fixture, route, attemptId, 1)).status, 409);
      assert.deepEqual(await rewardSnapshot(fixture, attemptId), committed);
    });
  }

  await t.test('explicit zero rewards settle normally and remain distinct from missing settings', async () => {
    const fixture = await rewardFixture();
    const zero = { rewardTotalExp: 0, rewardEconomyExp: 0, rewardCoin: 0 };
    const stages = db.getRepository(E.Stage);
    await stages.update({ stageId: quizStage.stageId }, zero);
    try {
      const { attemptId, before } = await startedReward(fixture, 'official');
      const result = await rewardAnswer(fixture, 'official', attemptId, 1);
      assert.equal(result.status, 201);
      assert.equal(result.body.data.rewardGranted, true);
      await assertSettledOnce(fixture, attemptId, before, zero);
    } finally {
      await stages.update({ stageId: quizStage.stageId }, {
        rewardTotalExp: quizStage.rewardTotalExp, rewardEconomyExp: quizStage.rewardEconomyExp, rewardCoin: quizStage.rewardCoin,
      });
    }
  });

  await t.test('mixed-route first-clear competition settles once and relearning keeps the original reward', async () => {
    const fixture = await rewardFixture();
    const starts = await Promise.all(['legacy', 'official'].map(route => rewardStart(fixture, route)));
    assert.deepEqual(starts.map(response => response.status).sort(), [200, 201]);
    const { attemptId } = starts[0].body.data;
    assert.equal(starts[1].body.data.attemptId, attemptId);
    assert.equal(await db.getRepository(E.LearningAttempt).countBy({ userId: fixture.userId, stageId: quizStage.stageId }), 1);

    const key = crypto.randomUUID();
    const first = await Promise.all([0, 1].map(() => rewardAnswer(fixture, 'official', attemptId, 0, { key })));
    assert.deepEqual(first.map(response => response.status), [201, 201]);
    assert.deepEqual(first.map(response => Boolean(response.body.data.duplicate)).sort(), [false, true]);
    const before = await rewardSnapshot(fixture, attemptId);
    assert.equal(before.submissions.length, 1);
    const routes = ['legacy', 'official'];
    const keys = routes.map(() => crypto.randomUUID());
    const final = await Promise.all(routes.map((route, i) => rewardAnswer(fixture, route, attemptId, 1, { key: keys[i] })));
    assert.deepEqual(final.map(response => response.status).sort(), [201, 409]);
    const winner = final.findIndex(response => response.status === 201);
    assert.equal(final[winner].body.data.rewardGranted, true);
    const committed = await assertSettledOnce(fixture, attemptId, before);
    const replay = await rewardAnswer(fixture, routes[winner], attemptId, 1, { key: keys[winner] });
    assert.equal(replay.status, 201);
    assert.equal(replay.body.data.duplicate, true);
    assert.equal(replay.body.data.rewardGranted, true);

    const relearn = await rewardStart(fixture, 'official', true);
    assert.equal(relearn.status, 201);
    const relearnId = relearn.body.data.attemptId;
    assert.notEqual(relearnId, attemptId);
    assert.equal((await rewardAnswer(fixture, 'official', relearnId, 0)).status, 201);
    const done = await rewardAnswer(fixture, 'official', relearnId, 1);
    assert.equal(done.status, 201);
    assert.equal(done.body.data.status, 'PASSED');
    assert.equal(done.body.data.rewardGranted, false);
    assert.equal((await db.getRepository(E.LearningAttempt).findOneByOrFail({ attemptId: relearnId })).attemptType, 'RELEARN');
    assert.deepEqual(await rewardSnapshot(fixture, attemptId), committed);
  });

  await t.test('a first-clear reward and a concurrent costume purchase share one consistent wallet ledger', async () => {
    const fixture = await rewardFixture();
    const { attemptId, before } = await startedReward(fixture, 'official');
    const product = await db.getRepository(E.Costume).save({ costumeCode: 'CALENDAR-REWARD-OUTFIT',
      name: '공용 코스튬', category: 'OUTFIT', priceCoin: 5, isOnSale: true });
    const requestId = crypto.randomUUID();
    const [clear, purchase] = await Promise.all([
      rewardAnswer(fixture, 'official', attemptId, 1),
      quizRequest('POST', '/shop/purchases', { itemId: product.itemId, requestId }, fixture.bearer),
    ]);
    assert.equal(clear.status, 201);
    assert.equal(clear.body.data.rewardGranted, true);
    assert.equal(purchase.status, 201);

    const after = await rewardSnapshot(fixture, attemptId);
    assert.equal(after.coin.length, 2);
    assert.equal(after.exp.length, 1);
    const earn = after.coin.find(entry => entry.reason === 'STAGE_FIRST_CLEAR');
    const spend = after.coin.find(entry => entry.reason === 'COSTUME_PURCHASE');
    assert.equal(earn?.amount, quizStage.rewardCoin);
    assert.equal(spend?.amount, -product.priceCoin);
    assert.equal(spend.coinLedgerId, purchase.body.data.purchaseId);
    const [first, second] = earn.balanceBefore === before.wallet.coinBalance ? [earn, spend] : [spend, earn];
    assert.equal(first.balanceBefore, before.wallet.coinBalance);
    assert.equal(first.balanceAfter, second.balanceBefore);
    assert.equal(second.balanceAfter, after.wallet.coinBalance);
    assert.equal(after.wallet.coinBalance, before.wallet.coinBalance + quizStage.rewardCoin - product.priceCoin);
    assert.equal(after.wallet.version, before.wallet.version + 2);
    const owned = await db.getRepository(E.UserCostume).findOneByOrFail({ userId: fixture.userId, itemId: product.itemId });
    assert.equal(owned.coinLedgerId, spend.coinLedgerId);
  });

  await t.test('a fresh failed Stage attempt leaves growth, wallet and ledgers unchanged', async () => {
    const fixture = await rewardFixture();
    const { attemptId, before } = await startedReward(fixture, 'official');
    assert.equal((await rewardAnswer(fixture, 'official', attemptId, 1, { correct: false })).status, 201);
    const failed = await rewardAnswer(fixture, 'official', attemptId, 2, { correct: false });
    assert.equal(failed.status, 201);
    assert.equal(failed.body.data.status, 'FAILED');
    assert.equal(failed.body.data.rewardGranted, false);
    const state = await rewardSnapshot(fixture, attemptId);
    assert.equal(state.attempt.status, 'FAILED');
    assert.equal(state.attempt.isFirstPass, false);
    assert.equal(state.submissions.length, 3);
    for (const key of ['progress', 'exp', 'coin', 'growth', 'wallet']) assert.deepEqual(state[key], before[key]);
  });

  await t.test('a repeated submissionId cannot replace another attempt’s saved answer', async () => {
    const fixtures = await Promise.all([rewardFixture(), rewardFixture()]);
    const started = await Promise.all(fixtures.map(fixture => rewardStart(fixture, 'official')));
    assert.deepEqual(started.map(response => response.status), [201, 201]);
    const ids = started.map(response => response.body.data.attemptId);
    const key = crypto.randomUUID();
    const replies = await Promise.all(fixtures.map((fixture, i) => rewardAnswer(fixture, 'official', ids[i], 0, { key })));
    assert.deepEqual(replies.map(response => response.status).sort(), [201, 409]);
    const winner = replies.findIndex(response => response.status === 201);
    const stored = await db.getRepository(E.QuestionSubmission).findOneByOrFail({ submissionId: key });
    assert.equal(stored.attemptId, ids[winner]);
    for (let i = 0; i < fixtures.length; i++) {
      const state = await rewardSnapshot(fixtures[i], ids[i]);
      assert.equal(state.submissions.length, i === winner ? 1 : 0);
      assert.equal(state.attempt.submittedCount, i === winner ? 1 : 0);
      assert.equal(state.exp.length, 0);
      assert.equal(state.coin.length, 0);
    }
  });

  for (const [table, operation, route] of [
    ['exp_ledger', 'INSERT', 'legacy'], ['coin_ledger', 'INSERT', 'official'],
    ['user_growth', 'UPDATE', 'legacy'], ['user_wallets', 'UPDATE', 'official'],
  ]) {
    await t.test(`${table} write failure rolls back the entire first clear`, async () => {
      const fixture = await rewardFixture();
      const { attemptId, before } = await startedReward(fixture, route);
      const key = crypto.randomUUID();
      await admin.query("CREATE FUNCTION app.reject_test_reward_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated reward write failed'; END $$");
      try {
        await admin.query(`CREATE TRIGGER reject_test_reward_write BEFORE ${operation} ON reward.${table} FOR EACH ROW EXECUTE FUNCTION app.reject_test_reward_write()`);
        try {
          const failed = await rewardAnswer(fixture, route, attemptId, 1, { key });
          assert.equal(failed.status, 503);
          assert.equal(failed.body.code, 'SERVICE_UNAVAILABLE');
          assert.deepEqual(await rewardSnapshot(fixture, attemptId), before);
        } finally {
          await admin.query(`DROP TRIGGER reject_test_reward_write ON reward.${table}`);
        }
      } finally {
        await admin.query('DROP FUNCTION app.reject_test_reward_write()');
      }
      assert.equal((await rewardAnswer(fixture, route, attemptId, 1, { key })).status, 201);
      await assertSettledOnce(fixture, attemptId, before);
    });
  }

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
      submittedCount: 2, correctCount: 2, endedAt: new Date(), isFirstPass: true, rewardGranted: false,
    });
    // A historical first clear can have been recorded before any reward was granted.
    const previousAnswers = await db.getRepository(E.QuestionSubmission).save(answers.slice(0, 2).map(({ questionId, correct }, index) => ({
      submissionId: crypto.randomUUID(), attemptId: old.attemptId, questionId, sequenceNo: index + 1,
      displayedChoiceOrder: [correct.choiceId], choiceId: correct.choiceId, selectedPosition: correct.baseOrder,
      isCorrect: true, hpBefore: 2 - index, hpAfter: 1 - index,
    })));
    const terminal = previousAnswers[1];
    const replay = await quizRequest('POST', `/attempts/${old.attemptId}/answers`, {
      questionId: terminal.questionId, choiceId: terminal.choiceId, submissionId: terminal.submissionId,
    }, pastToken);
    assert.equal(replay.status, 201);
    assert.equal(replay.body.data.duplicate, true);
    assert.equal(replay.body.data.rewardGranted, false);
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

  await t.test('legacy published-question GET keeps frontend fields and hides the pre-answer explanation', async () => {
    const questionRepo = db.getRepository(E.Question);
    const sample = await questionRepo.findOneByOrFail({ questionId: answers[0].questionId });
    const generated = await quizRequest('GET', `/quizzes/generate?conceptId=${sample.conceptId}`);
    assert.equal(generated.status, 200);
    const question = await questionRepo.findOneByOrFail({ questionId: generated.body.data.id });
    assert.equal(question.status, 'PUBLISHED');
    assert.equal(question.conceptId, sample.conceptId);
    assert.equal(generated.body.data.title, question.questionText);
    assert.equal(generated.body.data.explanation, null);
    assert.equal(generated.body.data.choices.length, 4);
    assert.equal('isCorrect' in generated.body.data.choices[0], false);
  });
});
