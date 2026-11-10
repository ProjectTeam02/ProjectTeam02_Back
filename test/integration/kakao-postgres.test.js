const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const configPath = process.env.LEREN_KAKAO_PG_TEST_CONFIG;

// Explicit opt-in. Ordinary npm test never opens or writes to a database here.
test('Kakao OAuth with isolated PostgreSQL (external Kakao only mocked)', { skip: !configPath, timeout: 120000 }, async t => {
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  assert.match(cfg.name, /^leren-kakao-it-[0-9a-f]{8}$/);
  assert.equal(cfg.host, '127.0.0.1');
  assert.equal(cfg.database, 'leren_kakao_it');
  assert.ok(Number.isInteger(cfg.port) && cfg.port !== 5433);
  const [container] = JSON.parse(execFileSync('docker', ['inspect', cfg.name], { encoding: 'utf8' }));
  assert.equal(container.Config.Labels['codex.purpose'], 'leren-kakao-integration');
  assert.equal(container.HostConfig.Tmpfs['/var/lib/postgresql'], 'rw');
  const binding = container.NetworkSettings.Ports['5432/tcp'][0];
  assert.equal(binding.HostIp, '127.0.0.1');
  assert.equal(Number(binding.HostPort), cfg.port);

  const E = require('@leren/database');
  const { DataSource } = require('typeorm');
  const root = require('node:path').resolve(__dirname, '../..');
  const env = require(root + '/src/config/env');
  const originalEnv = { ...env };
  const originalOptions = { ...E.AppDataSource.options };
  const errors = [], results = [], evidence = {};
  const logger = { logQuery() {}, logQueryError(error) { errors.push({ code: error.code, constraint: error.constraint }); }, logQuerySlow() {}, logSchemaBuild() {}, logMigration() {}, log() {} };
  const options = { ...originalOptions, host: cfg.host, port: cfg.port, database: cfg.database, username: 'postgres', password: cfg.password,
    ssl: false, synchronize: false, migrationsRun: false, migrations: [root + '/database/dist/migrations/*.js'], logging: false,
    extra: { options: '-c search_path=app,public', max: 12, application_name: 'leren-kakao-it' } };
  let admin, server;
  t.after(async () => {
    try { if (server) await new Promise(resolve => server.close(resolve)); }
    finally {
      if (E.AppDataSource.isInitialized) await E.AppDataSource.destroy();
      if (admin?.isInitialized) await admin.destroy();
      Object.assign(env, originalEnv);
      E.AppDataSource.setOptions(originalOptions);
      if (process.env.LEREN_KAKAO_PG_REPORT) fs.writeFileSync(process.env.LEREN_KAKAO_PG_REPORT, JSON.stringify({ results, evidence }, null, 2));
    }
  });
  async function check(name, fn) {
    await t.test(name, async () => {
      try { await fn(); results.push({ name, passed: true }); }
      catch (error) { results.push({ name, passed: false, error: error.message }); throw error; }
    });
  }
  admin = new DataSource(options); await admin.initialize();
  const [database] = await admin.query("SELECT current_database() AS name,current_setting('server_version') AS version");
  assert.equal(database.name, 'leren_kakao_it');
  // Never run on a previously populated DB, even when the name/port look correct.
  assert.equal((await admin.query("SELECT to_regclass('app.users') AS existing"))[0].existing, null);
  await admin.query('CREATE SCHEMA app');
  const migrations = await admin.runMigrations();
  evidence.database = database; evidence.migrations = migrations.map(x => x.name);
  const [role] = await admin.query("SELECT format('CREATE ROLE kakao_it_app LOGIN PASSWORD %L',$1::text) AS sql", [cfg.password]);
  await admin.query(role.sql);
  await admin.query('GRANT USAGE ON SCHEMA app TO kakao_it_app');
  await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA app TO kakao_it_app');
  Object.assign(env, { nodeEnv: 'test', jwtAccessSecret: crypto.randomBytes(32).toString('hex'), jwtRefreshSecret: crypto.randomBytes(32).toString('hex'),
    kakaoRestApiKey: 'isolated-mock-key', kakaoClientSecret: 'isolated-mock-secret', kakaoOauthStoreMode: 'memory',
    kakaoOauthCallbackUrl: 'https://backend.test/api/v1/auth/kakao/callback', kakaoAllowedRedirectUris: ['https://backend.test/api/v1/auth/kakao/callback'],
    kakaoAppDeepLink: 'leren://auth/callback', kakaoAllowedAppDeepLinks: ['leren://auth/callback'],
    kakaoOauthStateTtlSeconds: 300, kakaoOauthExchangeTtlSeconds: 60, kakaoLegacyDirectLoginEnabled: false });
  E.AppDataSource.setOptions({ ...options, username: 'kakao_it_app', migrations: [], logger, logging: ['error'] });
  E.AppDataSource.logger = logger;
  await E.AppDataSource.initialize();
  const d = E.AppDataSource;
  const KakaoClient = require(root + '/src/clients/kakao.client');
  const tokenUtil = require(root + '/src/common/utils/token.util');
  const AppError = require(root + '/src/common/errors/AppError');
  const profiles = new Map(), calls = { token: 0, profile: 0 };
  let serial = 800000;
  t.mock.method(KakaoClient.prototype, 'getAccessToken', async code => { calls.token++; assert.ok(profiles.has(code)); return { access_token: 'isolated:' + code }; });
  t.mock.method(KakaoClient.prototype, 'getProfile', async token => { calls.profile++; return profiles.get(token.slice('isolated:'.length)); });
  const auth = require(root + '/src/modules/auth/auth.service')(d, new KakaoClient());
  const app = require(root + '/src/app');
  server = await require('../helpers/listen-test-server')(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  const nativeFetch = global.fetch;
  t.mock.method(global, 'fetch', (url, init) => {
    assert.equal(new URL(url).origin, base, 'No requests outside the isolated HTTP server');
    return nativeFetch(url, init);
  });
  async function request(path, body, token, origin = base) {
    const r = await (origin === base ? fetch : nativeFetch)(origin + '/api/v1/' + path, { method: body ? 'POST' : 'GET', redirect: 'manual',
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (r.status === 302) return { status: r.status, location: new URL(r.headers.get('location')), text: await r.text(), headers: r.headers };
    return { status: r.status, body: await r.json(), headers: r.headers };
  }
  function identity(id = String(++serial), extra = {}) {
    const code = 'it-code-' + crypto.randomUUID(); profiles.set(code, { id, ...extra });
    return { id, code, input: { authorizationCode: code, redirectUri: env.kakaoOauthCallbackUrl } };
  }
  async function begin(who = identity()) {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const s = await request('auth/kakao/start', { codeChallenge: crypto.createHash('sha256').update(verifier).digest('base64url'), codeChallengeMethod: 'S256' });
    assert.equal(s.status, 200);
    return { who, verifier, start: s.body.data, state: new URL(s.body.data.authorizationUrl).searchParams.get('state') };
  }
  async function callback(flow) { return request('auth/kakao/callback?' + new URLSearchParams({ state: flow.state, code: flow.who.code })); }
  function exchangeBody(flow, cb) { return { loginCode: cb.location.searchParams.get('loginCode'), codeVerifier: flow.verifier, loginAttemptId: flow.start.loginAttemptId }; }
  async function mobile(who = identity()) {
    const flow = await begin(who), cb = await callback(flow);
    assert.equal(cb.status, 302); assert.ok(cb.location.searchParams.has('loginCode'));
    return request('auth/kakao/exchange', exchangeBody(flow, cb));
  }
  async function counts() { return (await admin.query('SELECT (SELECT count(*) FROM app.users)::int users,(SELECT count(*) FROM app.social_accounts)::int socials,(SELECT count(*) FROM app.user_growth)::int growth,(SELECT count(*) FROM app.user_settings)::int settings,(SELECT count(*) FROM app.user_sessions)::int sessions'))[0]; }
  async function fault(table, fn) {
    assert.ok(['users', 'social_accounts', 'user_growth', 'user_settings', 'user_sessions'].includes(table));
    await admin.query("CREATE FUNCTION app.it_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'isolated injected failure'; END$$");
    await admin.query(`CREATE TRIGGER it_fail_insert BEFORE INSERT ON app.${table} FOR EACH ROW EXECUTE FUNCTION app.it_fail_insert()`);
    try { await fn(); } finally {
      await admin.query(`DROP TRIGGER it_fail_insert ON app.${table}`);
      await admin.query('DROP FUNCTION app.it_fail_insert()');
    }
  }

  await check('normal migrations match actual account schema and social unique index', async () => {
    const drift = await admin.driver.createSchemaBuilder().log(); assert.equal(drift.upQueries.length, 0);
    const qr = admin.createQueryRunner(); const tables = await qr.getTables(['app.users', 'app.social_accounts', 'app.user_growth', 'app.user_settings', 'app.user_sessions']); await qr.release();
    assert.equal(tables.length, 5);
    assert.ok(tables.find(x => x.name.endsWith('social_accounts')).indices.some(x => x.name === 'social_accounts_provider_provider_user_id_idx' && x.isUnique));
    evidence.schema = { drift: drift.upQueries.length, tables: tables.map(x => ({ name: x.name, columns: x.columns.map(c => c.name), indices: x.indices.map(i => ({ name: i.name, unique: i.isUnique, columns: i.columnNames })), foreignKeys: x.foreignKeys.map(f => f.name) })) };
  });
  let first, firstIdentity;
  await check('new member callback commits User SocialAccount Growth Settings without a session', async () => {
    firstIdentity = identity(undefined, { kakao_account: { email: 'provider@example.test', profile: { nickname: '카카오 통합 회원' } } });
    const f = await begin(firstIdentity), cb = await callback(f);
    assert.equal(cb.status, 302); assert.equal(cb.text, ''); assert.equal(cb.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await counts(), { users: 1, socials: 1, growth: 1, settings: 1, sessions: 0 });
    const social = await d.getRepository(E.SocialAccount).findOneByOrFail({ provider: 'KAKAO', providerUserId: firstIdentity.id });
    const user = await d.getRepository(E.User).findOneByOrFail({ userId: social.userId });
    assert.equal(user.email, null); assert.equal(user.passwordHash, null); assert.equal(user.lastLoginAt, null);
    first = await request('auth/kakao/exchange', exchangeBody(f, cb));
    assert.equal(first.status, 200); assert.equal(first.body.data.isNewUser, true);
  });
  await check('exchange persists only hashed refresh token and real JWT authenticates protected API', async () => {
    const data = first.body.data, access = tokenUtil.verifyAccessToken(data.accessToken), refresh = tokenUtil.verifyRefreshToken(data.refreshToken);
    assert.equal(access.sub, data.user.userId); assert.equal(access.sid, refresh.sid);
    const session = await d.getRepository(E.UserSession).findOneByOrFail({ sessionId: access.sid });
    assert.equal(session.userId, data.user.userId); assert.equal(session.loginMethod, 'KAKAO');
    assert.equal(session.refreshTokenHash, tokenUtil.hashToken(data.refreshToken)); assert.notEqual(session.refreshTokenHash, data.refreshToken);
    assert.ok(session.expiresAt > new Date());
    assert.equal((await request('users/me', null, data.accessToken)).status, 200);
    assert.equal((await request('users/me', null, data.refreshToken)).status, 401);
    assert.equal(JSON.stringify(first.body).includes('isolated:'), false);
  });
  await check('existing member retains userId growth and custom nickname and gets another session', async () => {
    await d.getRepository(E.UserGrowth).update({ userId: first.body.data.user.userId }, { totalExp: 100, totalLevel: 3 });
    await d.getRepository(E.User).update({ userId: first.body.data.user.userId }, { nickname: '내 닉네임' });
    const second = await mobile(identity(firstIdentity.id));
    assert.equal(second.status, 200); assert.equal(second.body.data.isNewUser, false);
    assert.equal(second.body.data.user.userId, first.body.data.user.userId); assert.equal(second.body.data.user.nickname, '내 닉네임');
    assert.equal(second.body.data.user.totalExp, 100); assert.equal((await counts()).users, 1); assert.equal((await counts()).sessions, 2);
  });
  await check('simultaneous first callbacks hit actual unique constraint and DB-only retry leaves one User', async () => {
    const before = await counts(), id = String(++serial), oldCalls = calls.token, errorStart = errors.length;
    await admin.query("CREATE FUNCTION app.it_delay_user() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.nickname='동시 가입' THEN PERFORM pg_sleep(0.2); END IF; RETURN NEW; END$$");
    await admin.query('CREATE TRIGGER it_delay_user BEFORE INSERT ON app.users FOR EACH ROW EXECUTE FUNCTION app.it_delay_user()');
    try {
      const pair = await Promise.all([begin(identity(id, { kakao_account: { profile: { nickname: '동시 가입' } } })), begin(identity(id, { kakao_account: { profile: { nickname: '동시 가입' } } }))]);
      const callbacks = await Promise.all(pair.map(callback));
      assert.ok(callbacks.every(x => x.location.searchParams.has('loginCode')));
      const after = await counts(); assert.equal(after.users - before.users, 1); assert.equal(after.socials - before.socials, 1);
      assert.equal(after.growth - before.growth, 1); assert.equal(after.settings - before.settings, 1);
      assert.ok(errors.slice(errorStart).some(x => x.code === '23505' && x.constraint === 'social_accounts_provider_provider_user_id_idx'));
      assert.equal(calls.token - oldCalls, 2, 'No automatic authorization-code retry');
      const logins = await Promise.all(pair.map((f, i) => request('auth/kakao/exchange', exchangeBody(f, callbacks[i]))));
      assert.ok(logins.every(x => x.status === 200));
      assert.equal(logins[0].body.data.user.userId, logins[1].body.data.user.userId);
      assert.deepEqual(logins.map(x => x.body.data.isNewUser).sort(), [false, true]);
      evidence.concurrentSignup = { requests: 2, usersCreated: 1, socialAccountsCreated: 1, sessionsCreated: (await counts()).sessions - before.sessions, uniqueViolationObserved: true, kakaoTokenCalls: calls.token - oldCalls };
    } finally { await admin.query('DROP TRIGGER it_delay_user ON app.users'); await admin.query('DROP FUNCTION app.it_delay_user()'); }
  });
  for (const table of ['users', 'social_accounts', 'user_growth', 'user_settings', 'user_sessions']) {
    await check(`injected ${table} INSERT failure rolls back direct-login transaction`, async () => {
      const before = await counts(); const who = identity();
      await fault(table, async () => { await assert.rejects(auth.prepareKakaoLogin(who.input, true), e => (e.code || e.driverError?.code) === 'P0001'); });
      assert.deepEqual(await counts(), before);
    });
  }
  await check('callback DB failure redirects safely and creates no partial member', async () => {
    const before = await counts(), f = await begin();
    await fault('social_accounts', async () => { const cb = await callback(f); assert.equal(cb.status, 302); assert.equal(cb.location.searchParams.get('error'), 'login_failed'); assert.equal(cb.location.searchParams.has('loginCode'), false); });
    assert.deepEqual(await counts(), before); assert.equal((await callback(f)).status, 422);
  });
  await check('exchange session failure rolls back lastLogin and burns code but keeps callback-created member', async () => {
    const f = await begin(), cb = await callback(f), body = exchangeBody(f, cb), before = await counts();
    const social = await d.getRepository(E.SocialAccount).findOneByOrFail({ provider: 'KAKAO', providerUserId: f.who.id });
    await fault('user_sessions', async () => { assert.equal((await request('auth/kakao/exchange', body)).status, 503); });
    assert.deepEqual(await counts(), before);
    assert.equal((await d.getRepository(E.User).findOneByOrFail({ userId: social.userId })).lastLoginAt, null);
    assert.equal((await request('auth/kakao/exchange', body)).status, 401);
    evidence.twoPhaseFailure = { callbackMemberRetained: true, partialSessionRows: 0, loginCodeReplayStatus: 401 };
  });
  for (const status of ['SUSPENDED', 'LOCKED', 'WITHDRAWN']) {
    await check(`${status} rejects preparation and exchange without issuing a session`, async () => {
      const f = await begin(), cb = await callback(f), before = await counts();
      const social = await d.getRepository(E.SocialAccount).findOneByOrFail({ provider: 'KAKAO', providerUserId: f.who.id });
      await d.getRepository(E.User).update({ userId: social.userId }, { accountStatus: status, withdrawnAt: status === 'WITHDRAWN' ? new Date() : null });
      await assert.rejects(auth.prepareKakaoLogin(identity(f.who.id).input), e => e.statusCode === 403);
      assert.equal((await request('auth/kakao/exchange', exchangeBody(f, cb))).status, 403);
      assert.deepEqual(await counts(), before);
    });
  }
  await check('disconnected social account rejects both prepare and exchange', async () => {
    const f = await begin(), cb = await callback(f), before = await counts();
    await d.getRepository(E.SocialAccount).update({ provider: 'KAKAO', providerUserId: f.who.id }, { disconnectedAt: new Date() });
    await assert.rejects(auth.prepareKakaoLogin(identity(f.who.id).input), e => e.statusCode === 403);
    assert.equal((await request('auth/kakao/exchange', exchangeBody(f, cb))).status, 403); assert.deepEqual(await counts(), before);
  });
  await check('same email never links local account and null provider email works', async () => {
    const signup = await request('auth/signup', { email: 'same@example.test', password: 'it-password-123', nickname: '일반 회원' }); assert.equal(signup.status, 201);
    const who = identity(undefined, { kakao_account: { email: 'same@example.test' } }), kakao = await mobile(who);
    assert.equal(kakao.status, 200); assert.notEqual(kakao.body.data.user.userId, signup.body.data.user.userId); assert.equal(kakao.body.data.user.email, null);
    const empty = identity(), noEmail = await mobile(empty); assert.equal(noEmail.status, 200); assert.equal(noEmail.body.data.user.nickname, '카카오 사용자');
    assert.equal((await d.getRepository(E.SocialAccount).findOneByOrFail({ provider: 'KAKAO', providerUserId: empty.id })).providerEmail, null);
  });
  await check('email signup login sequential refresh logout work with Kakao disabled', async () => {
    const old = { ...env }; Object.assign(env, { kakaoRestApiKey: undefined, kakaoClientSecret: undefined, kakaoAllowedRedirectUris: [] });
    try {
      const body = { email: 'regression@example.test', password: 'it-password-123', nickname: '회귀 검증' };
      const signup = await request('auth/signup', body); assert.equal(signup.status, 201);
      assert.equal((await request('auth/signup', body)).status, 409);
      assert.equal((await request('auth/login', { email: body.email, password: 'incorrect' })).status, 401);
      const login = await request('auth/login', body); assert.equal(login.status, 200);
      const rotated = await request('auth/refresh', { refreshToken: login.body.data.refreshToken }); assert.equal(rotated.status, 200);
      assert.equal((await request('auth/refresh', { refreshToken: login.body.data.refreshToken })).status, 401);
      assert.equal((await request('users/me', null, login.body.data.accessToken)).status, 401);
      assert.equal((await request('users/me', null, rotated.body.data.accessToken)).status, 200);
      assert.equal((await request('auth/logout', {}, rotated.body.data.accessToken)).status, 200);
      assert.equal((await request('auth/refresh', { refreshToken: rotated.body.data.refreshToken })).status, 401);
    } finally { Object.assign(env, old); }
  });
  await check('real PostgreSQL reproduces concurrent refresh reuse (known security defect)', async () => {
    const signup = await request('auth/signup', { email: 'refresh-race@example.test', password: 'it-password-123', nickname: '동시 재발급' }); assert.equal(signup.status, 201);
    const data = signup.body.data, original = tokenUtil.verifyRefreshToken(data.refreshToken), qr = admin.createQueryRunner();
    await qr.connect(); await qr.startTransaction();
    let pending;
    try {
      await qr.query('SELECT session_id FROM app.user_sessions WHERE session_id=$1 FOR UPDATE', [original.sid]);
      pending = Promise.all([request('auth/refresh', { refreshToken: data.refreshToken }), request('auth/refresh', { refreshToken: data.refreshToken })]);
      let waiting = 0;
      for (let i = 0; i < 100; i++) {
        const [row] = await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='leren-kakao-it' AND wait_event_type='Lock' AND query LIKE '%UPDATE%user_sessions%'");
        waiting = row.n; if (waiting >= 2) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(waiting, 2, 'Both requests read active session before the UPDATE lock is released');
      await qr.commitTransaction();
      const responses = await pending;
      assert.deepEqual(responses.map(x => x.status), [200, 200]);
      const sessions = await d.getRepository(E.UserSession).findBy({ userId: data.user.userId });
      assert.equal(sessions.length, 3); assert.equal(sessions.filter(x => !x.revokedAt).length, 2);
      assert.equal((await request('auth/refresh', { refreshToken: data.refreshToken })).status, 401);
      assert.equal((await request('users/me', null, data.accessToken)).status, 401);
      for (const r of responses) assert.equal((await request('users/me', null, r.body.data.accessToken)).status, 200);
      evidence.refreshRace = { statuses: responses.map(x => x.status), waitingUpdates: waiting, originalSessions: 1, resultingSessions: 3, activeNewSessions: 2, originalTokenSequentialReplayStatus: 401, bothNewAccessTokensAuthenticate: true, securityExpectationSatisfied: false };
    } finally { if (qr.isTransactionActive) await qr.rollbackTransaction(); if (pending) await pending; await qr.release(); }
  });
  await check('one login code accepts only one concurrent exchange', async () => {
    const f = await begin(), cb = await callback(f), before = await counts(), body = exchangeBody(f, cb);
    const responses = await Promise.all([request('auth/kakao/exchange', body), request('auth/kakao/exchange', body)]);
    assert.deepEqual(responses.map(x => x.status).sort(), [200, 401]); assert.equal((await counts()).sessions - before.sessions, 1);
  });
  await check('malformed loginAttemptId is 422 without consuming a valid login code', async () => {
    const f = await begin(), cb = await callback(f), body = exchangeBody(f, cb);
    assert.equal((await request('auth/kakao/exchange', { ...body, loginAttemptId: 'not-a-uuid' })).status, 422);
    assert.equal((await request('auth/kakao/exchange', body)).status, 200);
  });
  await check('invalid profile and legacy/production paths cannot bypass mobile proof', async () => {
    const bad = identity(); profiles.set(bad.code, {}); const before = await counts(), f = await begin(bad), cb = await callback(f);
    assert.equal(cb.location.searchParams.get('error'), 'login_failed'); assert.deepEqual(await counts(), before);
    assert.equal((await request('auth/kakao', identity().input)).status, 403);
    const old = env.nodeEnv; env.nodeEnv = 'production';
    try { assert.equal((await request('auth/kakao/start', {})).status, 503); assert.equal((await request('auth/kakao/exchange', {})).status, 503); }
    finally { env.nodeEnv = old; }
  });
  await check('Swagger requests match the three mobile endpoints and runtime responses', async () => {
    // Fetch the absolute documentation path through the isolated server.
    const document = await (await fetch(base + '/api-docs.json')).json();
    for (const [path, method] of [['start', 'post'], ['callback', 'get'], ['exchange', 'post']]) {
      const op = document.paths['/api/v1/auth/kakao/' + path][method]; assert.deepEqual(op.security, []); assert.ok(op.responses[422]); assert.ok(op.responses[503]); assert.ok(op.responses[500]);
    }
    assert.equal(document.paths['/api/v1/auth/kakao/callback'].get.responses[302].content, undefined);
  });

  Object.assign(env, { nodeEnv: 'production', kakaoOauthStoreMode: 'postgres' });
  const { digest } = require(root + '/src/modules/auth/kakao-oauth.store');
  const entries = admin.getRepository(E.KakaoOAuthEntry);

  await check('production PostgreSQL stores only hashes and rejects state and exchange replay', async () => {
    const flow = await begin();
    const stateKey = { kind: 'state', tokenHash: digest(flow.state) };
    const state = await entries.findOneByOrFail(stateKey);
    assert.equal(state.payload.loginAttemptId, flow.start.loginAttemptId);
    assert.equal(state.payload.challenge, digestBase64url(flow.verifier));
    assert.ok(state.expiresAt > state.createdAt);
    assert.equal(JSON.stringify(state).includes(flow.state), false);
    assert.equal(JSON.stringify(state).includes(flow.verifier), false);

    const cb = await callback(flow);
    assert.equal(cb.status, 302);
    const body = exchangeBody(flow, cb);
    const exchangeKey = { kind: 'exchange', tokenHash: digest(body.loginCode) };
    const stored = await entries.findOneByOrFail(exchangeKey);
    assert.equal(JSON.stringify(stored).includes(body.loginCode), false);
    assert.equal(stored.payload.loginAttemptId, flow.start.loginAttemptId);
    assert.ok(stored.payload.userId);
    assert.equal(await entries.existsBy(stateKey), false);
    assert.equal((await callback(flow)).status, 422);

    const wrongVerifier = crypto.randomBytes(32).toString('base64url');
    assert.equal((await request('auth/kakao/exchange', { ...body, codeVerifier: wrongVerifier })).status, 401);
    assert.equal((await request('auth/kakao/exchange', { ...body, loginAttemptId: crypto.randomUUID() })).status, 401);
    assert.equal(await entries.existsBy(exchangeKey), true);
    assert.equal((await request('auth/kakao/exchange', body)).status, 200);
    assert.equal(await entries.existsBy(exchangeKey), false);
    assert.equal((await request('auth/kakao/exchange', body)).status, 401);
  });

  await check('expired database state and exchange codes fail closed and are pruned', async () => {
    const expiredState = await begin();
    const flow = await begin(), cb = await callback(flow), body = exchangeBody(flow, cb);
    const tokens = [digest(expiredState.state), digest(body.loginCode)];
    await admin.query("UPDATE app.kakao_oauth_entries SET expires_at = clock_timestamp() - interval '1 second' WHERE token_hash = ANY($1)", [tokens]);
    assert.equal((await callback(expiredState)).status, 422);
    assert.equal((await request('auth/kakao/exchange', body)).status, 401);
    const { PostgresOAuthStore } = require(root + '/src/modules/auth/kakao-postgres-oauth.store');
    const freshStore = new PostgresOAuthStore(d);
    await freshStore.put('state', { loginAttemptId: crypto.randomUUID() }, 60);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM app.kakao_oauth_entries WHERE token_hash = ANY($1)', [tokens]))[0].n, 0);
  });

  function digestBase64url(value) {
    return crypto.createHash('sha256').update(value).digest('base64url');
  }

  await check('independent Node processes preserve attempts across restarts and consume once', async () => {
    const startProcess = require('../helpers/kakao-oauth-process');
    const workers = [];
    const options = {
      db: { host: cfg.host, port: cfg.port, database: cfg.database, username: 'kakao_it_app', password: cfg.password },
      config: {
        nodeEnv: 'production', kakaoOauthStoreMode: 'postgres', kakaoRestApiKey: 'isolated-mock-key', kakaoClientSecret: 'isolated-mock-secret',
        kakaoOauthCallbackUrl: env.kakaoOauthCallbackUrl, kakaoAllowedRedirectUris: env.kakaoAllowedRedirectUris,
        kakaoAppDeepLink: env.kakaoAppDeepLink, kakaoAllowedAppDeepLinks: env.kakaoAllowedAppDeepLinks,
        kakaoOauthStateTtlSeconds: 300, kakaoOauthExchangeTtlSeconds: 60,
        jwtAccessSecret: env.jwtAccessSecret, jwtRefreshSecret: env.jwtRefreshSecret,
      },
      providerUserId: '900000001',
    };
    async function launch() {
      const worker = await startProcess(options);
      workers.push(worker);
      return worker;
    }
    async function raceOnLockedRow(kind, token, send) {
      const lock = admin.createQueryRunner();
      await lock.connect();
      let pending;
      try {
        await lock.startTransaction();
        await lock.query('SELECT 1 FROM app.kakao_oauth_entries WHERE kind=$1 AND token_hash=$2 FOR UPDATE', [kind, digest(token)]);
        pending = send();
        let waiting = 0;
        for (let attempt = 0; attempt < 100; attempt++) {
          const [result] = await admin.query(`
            SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE application_name = 'leren-kakao-oauth-worker'
              AND wait_event_type = 'Lock' AND query LIKE '%kakao_oauth_entries%FOR UPDATE%'
          `);
          waiting = result.n;
          if (waiting === 2) break;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        assert.equal(waiting, 2, 'Both processes must be waiting on the same OAuth row');
        await lock.commitTransaction();
        return await pending;
      } finally {
        if (lock.isTransactionActive) await lock.rollbackTransaction();
        await lock.release();
        if (pending) await pending;
      }
    }
    try {
      const before = await counts(), starter = await launch();
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const start = await request('auth/kakao/start', {
        codeChallenge: digestBase64url(codeVerifier), codeChallengeMethod: 'S256',
      }, null, starter.base);
      assert.equal(start.status, 200);
      const { authorizationUrl, loginAttemptId } = start.body.data;
      const state = new URL(authorizationUrl).searchParams.get('state');
      await starter.close();

      const first = await launch(), second = await launch();
      assert.notEqual(first.pid, second.pid);
      const callbackPath = 'auth/kakao/callback?' + new URLSearchParams({ state, code: 'isolated-provider-code' });
      const callbacks = await raceOnLockedRow('state', state, () =>
        Promise.all([first, second].map(worker => request(callbackPath, null, null, worker.base))));
      const callbackStatuses = callbacks.map(response => response.status).sort((a, b) => a - b);
      assert.deepEqual(callbackStatuses, [302, 422]);
      const redirect = callbacks.find(response => response.status === 302).location;
      assert.equal(redirect.searchParams.get('loginAttemptId'), loginAttemptId);
      assert.deepEqual([...redirect.searchParams.keys()].sort(), ['loginAttemptId', 'loginCode']);
      const loginCode = redirect.searchParams.get('loginCode');
      assert.ok(loginCode);
      await Promise.all([first.close(), second.close()]);

      const third = await launch(), fourth = await launch();
      assert.notEqual(third.pid, fourth.pid);
      const body = { loginCode, codeVerifier, loginAttemptId };
      const exchanges = await raceOnLockedRow('exchange', loginCode, () =>
        Promise.all([third, fourth].map(worker => request('auth/kakao/exchange', body, null, worker.base))));
      const exchangeStatuses = exchanges.map(response => response.status).sort((a, b) => a - b);
      assert.deepEqual(exchangeStatuses, [200, 401]);
      const issued = exchanges.find(response => response.status === 200).body.data;
      assert.equal((await request('users/me', null, issued.accessToken, fourth.base)).status, 200);
      const after = await counts();
      assert.equal(after.socials - before.socials, 1);
      assert.equal(after.sessions - before.sessions, 1);
      evidence.postgresOAuth = { stateSurvivedRestart: true, exchangeSurvivedRestart: true,
        simultaneousWaitersPerToken: 2, callbackStatuses, exchangeStatuses };
    } finally {
      await Promise.all(workers.map(worker => worker.close()));
    }
  });

  await check('OAuth migration can be reversed and reapplied without changing existing auth rows', async () => {
    const before = await counts();
    assert.equal(migrations.at(-1).name, 'KakaoOAuthEntries1794210000000');
    await admin.undoLastMigration();
    try {
      assert.equal((await admin.query("SELECT to_regclass('app.kakao_oauth_entries') AS table_name"))[0].table_name, null);
      const response = await request('auth/kakao/start', {
        codeChallenge: digestBase64url('synthetic-verifier'), codeChallengeMethod: 'S256',
      });
      assert.equal(response.status, 503);
      assert.equal(response.body.message, 'OAuth 상태 저장소 마이그레이션이 적용되지 않았습니다.');
      assert.deepEqual(await counts(), before);
    } finally {
      const reapplied = await admin.runMigrations();
      assert.deepEqual(reapplied.map(migration => migration.name), ['KakaoOAuthEntries1794210000000']);
      await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON app.kakao_oauth_entries TO kakao_it_app');
    }
    const drift = await admin.driver.createSchemaBuilder().log();
    assert.equal(drift.upQueries.length, 0);
    assert.deepEqual(await counts(), before);
    assert.ok((await begin()).state);
  });

  await check('production store failure returns a sanitized 503 on each OAuth endpoint', async () => {
    await d.destroy();
    const proof = crypto.randomBytes(32).toString('base64url');
    for (const response of [
      await request('auth/kakao/start', { codeChallenge: digestBase64url(proof), codeChallengeMethod: 'S256' }),
      await request('auth/kakao/callback?state=' + proof),
      await request('auth/kakao/exchange', { loginCode: proof, codeVerifier: proof, loginAttemptId: crypto.randomUUID() }),
    ]) {
      assert.equal(response.status, 503);
      assert.deepEqual(response.body, { success: false, message: 'OAuth 상태 저장소에 연결할 수 없습니다.', code: 'SERVICE_UNAVAILABLE' });
    }
  });
});
