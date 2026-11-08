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
    extra: { options: '-c search_path=app,public', max: 12, application_name: 'leren-calendar-it' } };
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
  assert.equal((await admin.query("SELECT to_regclass('app.users') AS existing"))[0].existing, null);
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
    await admin.query('ALTER TABLE app.learning_attempts RENAME TO learning_attempts_test_unavailable');
    try {
      for (const route of ['/api/v1/calendar?month=2026-04', '/api/v1/calendar/days/2026-04-10', '/api/v1/learning/history']) {
        const response = await get(route);
        assert.equal(response.status, 503, route);
        assert.equal(response.body.success, false);
        assert.equal('emptyMessage' in response.body, false);
      }
    } finally {
      await admin.query('ALTER TABLE app.learning_attempts_test_unavailable RENAME TO learning_attempts');
    }
  });
});
