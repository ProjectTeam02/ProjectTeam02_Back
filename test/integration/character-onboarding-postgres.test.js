const assert = require('node:assert/strict');
const test = require('node:test');
const { randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const listenTestServer = require('../helpers/listen-test-server');

const config = process.env.LEREN_CHARACTER_ONBOARDING_PG_TEST_CONFIG;
const listPath = '/api/v1/character-classes';
const selectPath = '/api/v1/users/me/character-class';
const profilePath = '/api/v1/users/me';

test('character onboarding API against isolated PostgreSQL', { skip: !config, timeout: 120000 }, async t => {
  const { name, port, password } = JSON.parse(config);
  assert.match(name, /^leren-character-it-[0-9a-f]{8}$/);
  const [container] = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }));
  assert.equal(container.Config.Labels['codex.purpose'], 'leren-character-onboarding-integration');
  assert.equal(container.HostConfig.Tmpfs['/var/lib/postgresql'], 'rw');
  assert.equal(container.HostConfig.AutoRemove, true);
  assert.deepEqual(container.NetworkSettings.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: String(port) }]);

  const { AppDataSource: db, CharacterClass, User, UserCharacter, UserSession } = require('@leren/database');
  const env = require('../../src/config/env');
  const previous = { ...db.options };
  const secrets = { jwtAccessSecret: env.jwtAccessSecret, jwtRefreshSecret: env.jwtRefreshSecret };
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db.isInitialized) await db.destroy();
    db.setOptions(previous);
    Object.assign(env, secrets);
  });
  db.setOptions({
    host: '127.0.0.1', port, username: 'postgres', password, database: 'leren_character_it',
    ssl: false, synchronize: false, migrationsRun: false, logging: false,
    migrations: [path.resolve(__dirname, '../../database/dist/migrations/*.js')],
    extra: { options: '-c search_path=app,account,character,content,learning,reward,review,tutor,public' },
  });
  await db.initialize();
  const [database] = await db.query("SELECT current_database() AS name, to_regclass('account.users') AS users, version()");
  assert.equal(database.name, 'leren_character_it');
  assert.equal(database.users, null);
  t.diagnostic(database.version);
  await db.query('CREATE SCHEMA app');
  await db.runMigrations();

  env.jwtAccessSecret = randomBytes(32).toString('hex');
  env.jwtRefreshSecret = randomBytes(32).toString('hex');
  const { issueAccessToken } = require('../../src/common/utils/token.util');
  const users = db.getRepository(User);
  const classes = db.getRepository(CharacterClass);
  const selections = db.getRepository(UserCharacter);
  async function learner(nickname) {
    const user = await users.save({ nickname });
    const session = await db.getRepository(UserSession).save({
      userId: user.userId, refreshTokenHash: randomBytes(32).toString('hex'),
      loginMethod: 'EMAIL', expiresAt: new Date(Date.now() + 3600000),
    });
    return { userId: user.userId, token: issueAccessToken(user, session.sessionId) };
  }
  server = await listenTestServer(require('../../src/app'));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, { method = 'GET', token, body } = {}) {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body) headers['content-type'] = 'application/json';
    const response = await fetch(base + route, { method, headers, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  const pick = (token, classCode) => request(selectPath, { method: 'PATCH', token, body: { classCode } });
  const owner = await learner('class owner');
  const other = await learner('class other');

  await t.test('empty list and PR #73 master data are returned in sort order', async () => {
    assert.deepEqual(await request(listPath, { token: owner.token }), {
      status: 200, body: { success: true, data: { items: [] } },
    });
    const seed = readFileSync(path.resolve(__dirname, '../../database/sql/seed/01_master_data.sql'), 'utf8');
    await db.query(seed);
    await db.query(seed);
    const list = await request(listPath, { token: owner.token });
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data.items.map(({ classCode, name, imageKey }) => [classCode, name, imageKey]), [
      ['WARRIOR', '검사', null], ['MAGE', '마법사', null], ['ARCHER', '궁수', null],
    ]);
    await classes.update({ classCode: 'ARCHER' }, { isActive: false });
    await classes.update({ classCode: 'WARRIOR' }, { sortOrder: 5 });
    const active = await request(listPath, { token: owner.token });
    assert.deepEqual(active.body.data.items.map(job => job.classCode), ['MAGE', 'WARRIOR']);
  });

  await t.test('rejects unauthorized, injected userId, unknown code and inactive class', async () => {
    assert.equal((await request(listPath, { token: 'invalid-token' })).status, 401);
    assert.equal((await pick(null, 'WARRIOR')).status, 401);
    const injected = await request(selectPath, {
      method: 'PATCH', token: owner.token, body: { classCode: 'WARRIOR', userId: other.userId },
    });
    assert.equal(injected.status, 422);
    assert.equal((await pick(owner.token, 'PALADIN')).status, 404);
    assert.equal((await pick(owner.token, 'ARCHER')).status, 404);
    assert.equal(await selections.count(), 0);
  });

  await t.test('saves the first selection and completion once and exposes it on the profile', async () => {
    assert.equal((await request(profilePath, { token: owner.token })).body.data.characterClass, null);
    const result = await pick(owner.token, 'WARRIOR');
    assert.equal(result.status, 200);
    const warrior = await classes.findOneByOrFail({ classCode: 'WARRIOR' });
    const expected = { classId: warrior.classId, classCode: 'WARRIOR', name: '검사', imageKey: null };
    assert.deepEqual(result.body.data, { characterClass: expected, onboardingCompleted: true });
    const where = { userId: owner.userId };
    const selection = await selections.findOneByOrFail(where);
    const user = await users.findOneByOrFail(where);
    assert.equal(selection.classId, expected.classId);
    assert.ok(selection.firstSelectedAt instanceof Date);
    assert.deepEqual(user.onboardingCompletedAt, selection.firstSelectedAt);

    assert.deepEqual(await pick(owner.token, 'WARRIOR'), result);
    assert.equal((await pick(owner.token, 'MAGE')).status, 409);
    assert.equal(await selections.countBy(where), 1);
    assert.deepEqual(await selections.findOneByOrFail(where), selection);
    assert.deepEqual((await users.findOneByOrFail(where)).onboardingCompletedAt, user.onboardingCompletedAt);
    const profile = await request(profilePath, { token: owner.token });
    assert.equal(profile.status, 200);
    assert.deepEqual(profile.body.data.characterClass, expected);
    assert.equal(profile.body.data.email, null);
    assert.equal((await request(profilePath, { token: other.token })).body.data.characterClass, null);
  });

  await t.test('two concurrent first selections serialize on the user row', async () => {
    const racer = await learner('class race');
    const blocker = db.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    let pending;
    let waiting = 0;
    try {
      await blocker.query('SELECT user_id FROM account.users WHERE user_id = $1 FOR UPDATE', [racer.userId]);
      pending = Promise.allSettled([pick(racer.token, 'WARRIOR'), pick(racer.token, 'MAGE')]);
      for (let i = 0; i < 100 && waiting !== 2; i++) {
        const [row] = await db.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND cardinality(pg_blocking_pids(pid)) > 0`);
        waiting = row.waiting;
        if (waiting !== 2) await delay(50);
      }
    } finally {
      await blocker.rollbackTransaction();
      await blocker.release();
      if (pending) await pending;
    }
    assert.equal(waiting, 2);
    const results = (await pending).map(result => {
      assert.equal(result.status, 'fulfilled');
      return result.value;
    });
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    const winner = results.find(result => result.status === 200).body.data.characterClass;
    assert.equal(await selections.countBy({ userId: racer.userId }), 1);
    assert.equal((await selections.findOneByOrFail({ userId: racer.userId })).classId, winner.classId);
    assert.deepEqual((await request(profilePath, { token: racer.token })).body.data.characterClass, winner);
  });

  await t.test('rolls back the selection when the completion write fails', async () => {
    await db.query(`CREATE FUNCTION app.reject_test_onboarding() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test onboarding failure'; END $$`);
    await db.query(`CREATE TRIGGER reject_test_onboarding BEFORE UPDATE OF onboarding_completed_at ON account.users
      FOR EACH ROW EXECUTE FUNCTION app.reject_test_onboarding()`);
    try {
      assert.equal((await pick(other.token, 'MAGE')).status, 503);
      assert.equal(await selections.countBy({ userId: other.userId }), 0);
      assert.equal((await users.findOneByOrFail({ userId: other.userId })).onboardingCompletedAt, null);
    } finally {
      await db.query('DROP TRIGGER reject_test_onboarding ON account.users');
      await db.query('DROP FUNCTION app.reject_test_onboarding()');
    }
  });

  await t.test('email signup and login preserve onboarding state across sessions', async () => {
    const auth = (endpoint, body) => request(`/api/v1/auth/${endpoint}`, { method: 'POST', body });
    const credentials = { email: 'class-test@example.invalid', password: 'Test-onboarding-123!' };
    const signup = await auth('signup', { ...credentials, nickname: '가입테스트' });
    assert.equal(signup.status, 201);
    const token = signup.body.data.accessToken;
    assert.equal((await request(profilePath, { token })).body.data.characterClass, null);
    const result = await pick(token, 'MAGE');
    assert.equal(result.status, 200);
    const login = await auth('login', credentials);
    assert.equal(login.status, 200);
    const profile = await request(profilePath, { token: login.body.data.accessToken });
    assert.equal(profile.status, 200);
    assert.deepEqual(profile.body.data.characterClass, result.body.data.characterClass);
  });
});
