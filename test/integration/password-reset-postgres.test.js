const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const test = require('node:test');
const listenTestServer = require('../helpers/listen-test-server');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('password reset against Express, isolated PostgreSQL and a stub SMTP transport', { skip: !config, timeout: 120000 }, async t => {
  const options = JSON.parse(config);
  const E = require('@leren/database');
  const db = E.AppDataSource;
  const env = require('../../src/config/env');
  const { hashToken } = require('../../src/common/utils/token.util');
  const { verifyPassword } = require('../../src/common/utils/password.util');
  const delivery = require('../../src/modules/auth/password-reset.delivery');
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db.isInitialized) await db.destroy();
  });
  db.setOptions({ host: '127.0.0.1', port: options.port, database: options.database,
    username: options.username || 'app_user', password: options.password || 'app_local',
    ssl: false, synchronize: false, migrationsRun: false, logging: false });
  await db.initialize();
  env.jwtAccessSecret = randomBytes(32).toString('hex');
  env.jwtRefreshSecret = randomBytes(32).toString('hex');

  let mailEnabled = true;
  let onSend = async mail => ({ accepted: mail.envelope.to, rejected: [] });
  const deliveries = [];
  const log = t.mock.method(console, 'warn', () => {});
  const send = delivery.create({ NODE_ENV: 'production', PASSWORD_RESET_SMTP_HOST: 'smtp.invalid',
    PASSWORD_RESET_FROM: 'leren@example.test', PASSWORD_RESET_URL: 'https://app.example.test/reset-password' }, () => ({
    async sendMail(mail) {
      const url = new URL(mail.text.split('\n').find(line => line.startsWith('https:')));
      assert.equal(url.origin + url.pathname, 'https://app.example.test/reset-password');
      deliveries.push({ to: mail.envelope.to[0], token: url.searchParams.get('resetToken') });
      return onSend(mail);
    },
  }));
  t.mock.method(delivery, 'create', () => mailEnabled ? send : null);
  server = await listenTestServer(require('../../src/app'));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const origin = `${baseUrl}/api/v1`;
  const swagger = await (await fetch(`${baseUrl}/api-docs.json`)).json();
  for (const [path, flag, fields, statuses] of [
    ['request', 'accepted', ['email'], ['200', '422', '503']],
    ['confirm', 'reset', ['resetToken', 'newPassword'], ['200', '401', '422', '503']],
  ]) {
    const operation = swagger.paths[`/api/v1/auth/password-reset/${path}`].post;
    assert.deepEqual(operation.security, []);
    assert.deepEqual(operation.requestBody.content['application/json'].schema.required, fields);
    assert.deepEqual(Object.keys(operation.responses).sort(), statuses);
    assert.deepEqual(operation.responses[200].content['application/json'].schema.properties.data.required, [flag]);
  }
  async function request(path, body, accessToken) {
    const headers = accessToken ? { authorization: `Bearer ${accessToken}` } : {};
    if (body) headers['content-type'] = 'application/json';
    const response = await fetch(origin + path, { method: body ? 'POST' : 'GET', headers, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  const suffix = randomBytes(4).toString('hex');
  const oldPassword = 'isolated-old-password';
  const newPassword = 'isolated-new-password';
  const users = db.getRepository(E.User);
  const tokens = db.getRepository(E.AccountToken);
  const sessions = db.getRepository(E.UserSession);
  const accepted = { status: 200, body: { success: true, data: { accepted: true } } };
  const reset = { status: 200, body: { success: true, data: { reset: true } } };
  const issue = email => request('/auth/password-reset/request', { email });
  const confirm = (resetToken, password = newPassword) => request('/auth/password-reset/confirm', { resetToken, newPassword: password });
  const login = (email, password = oldPassword) => request('/auth/login', { email, password });
  const refresh = refreshToken => request('/auth/refresh', { refreshToken });
  const profile = accessToken => request('/users/me', undefined, accessToken);
  async function learner(label) {
    const email = `${label}-${suffix}@example.test`;
    const reply = await request('/auth/signup', { email, password: oldPassword, nickname: `${label}-${suffix}` });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    return { email, ...reply.body.data };
  }
  const rows = (userId) => tokens.find({ where: { userId, tokenType: 'PASSWORD_RESET' }, order: { createdAt: 'ASC' } });
  const byToken = token => tokens.findOneBy({ tokenHash: hashToken(token) });
  async function until(check) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await check();
      if (result) return result;
      await delay(20);
    }
    assert.fail('Background mail state did not settle');
  }
  const lastToken = email => deliveries.findLast(mail => mail.to === email)?.token;
  async function sent(email) {
    assert.deepEqual(await issue(email), accepted);
    const raw = await until(() => lastToken(email));
    await until(async () => (await byToken(raw))?.sendCount === 1);
    return raw;
  }

  await t.test('eligible local account, unknown email, and Kakao-only account return the same acceptance', async () => {
    const owner = await learner('identity');
    const kakao = await users.save({ nickname: `kakao-${suffix}`, lastLoginMethod: 'KAKAO' });
    const kakaoEmail = `social-${suffix}@example.test`;
    await db.getRepository(E.SocialAccount).save({ userId: kakao.userId, provider: 'KAKAO',
      providerUserId: `test-${suffix}`, providerEmail: kakaoEmail });
    const missing = `unknown-${suffix}@example.test`;
    assert.deepEqual(await issue(missing), accepted);
    assert.deepEqual(await issue(kakaoEmail), accepted);
    assert.equal(lastToken(missing), undefined);
    assert.equal(lastToken(kakaoEmail), undefined);
    assert.deepEqual(await rows(kakao.userId), []);
    const staleSocialToken = randomBytes(32).toString('base64url');
    await tokens.save({ userId: kakao.userId, targetEmail: kakaoEmail, tokenType: 'PASSWORD_RESET',
      tokenHash: hashToken(staleSocialToken), expiresAt: new Date(Date.now() + 60_000) });
    assert.equal((await confirm(staleSocialToken)).status, 401);
    assert.equal((await users.findOneByOrFail({ userId: kakao.userId })).passwordHash, null);

    // SMTP를 보류한 상태에서도 HTTP 응답은 끝나며, 접수 전 토큰은 사용할 수 없다.
    let release;
    const hold = new Promise(resolve => { release = resolve; });
    onSend = () => hold;
    try {
      assert.deepEqual(await issue(owner.email.toUpperCase()), accepted);
      const raw = await until(() => lastToken(owner.email));
      assert.equal(Buffer.from(raw, 'base64url').length, 32);
      const row = await byToken(raw);
      assert.equal(row.userId, owner.user.userId);
      assert.equal(row.tokenHash, hashToken(raw));
      assert.equal(JSON.stringify(row).includes(raw), false);
      assert.equal(row.sendCount, 0);
      assert.ok(Math.abs(row.expiresAt - row.createdAt - 30 * 60_000) < 3000);
      assert.equal((await confirm(raw)).status, 401);
    } finally {
      release({ accepted: [owner.email], rejected: [] });
      onSend = async mail => ({ accepted: mail.envelope.to, rejected: [] });
    }
    await until(async () => (await byToken(lastToken(owner.email)))?.sendCount === 1);
  });

  await t.test('repeated and concurrent requests share the cooldown and hourly budget', async () => {
    const owner = await learner('limited');
    const userId = owner.user.userId;
    for (const result of await Promise.all(Array.from({ length: 5 }, () => issue(owner.email)))) assert.deepEqual(result, accepted);
    const first = await until(() => lastToken(owner.email));
    await until(async () => (await byToken(first))?.sendCount === 1);
    assert.equal((await rows(userId)).length, 1);
    for (const elapsed of [4, 2]) {
      const previous = lastToken(owner.email);
      await tokens.update({ tokenHash: hashToken(previous) }, { createdAt: new Date(Date.now() - elapsed * 60_000) });
      assert.deepEqual(await issue(owner.email), accepted);
      await until(async () => lastToken(owner.email) !== previous && (await byToken(lastToken(owner.email)))?.sendCount === 1);
      assert.ok((await byToken(previous)).usedAt);
    }
    await tokens.update({ tokenHash: hashToken(lastToken(owner.email)) }, { createdAt: new Date(Date.now() - 61_000) });
    assert.deepEqual(await issue(owner.email), accepted);
    assert.equal((await rows(userId)).length, 3);
    assert.equal(deliveries.filter(mail => mail.to === owner.email).length, 3);
    assert.equal((await confirm(first)).status, 401);
  });

  await t.test('SMTP failure is private, does not activate the new token and leaves a prior token valid', async () => {
    const owner = await learner('mail-failure');
    const previous = await sent(owner.email);
    await tokens.update({ tokenHash: hashToken(previous) }, { createdAt: new Date(Date.now() - 61_000) });
    onSend = async () => { throw new Error('mock SMTP diagnostics with private information'); };
    try {
      assert.deepEqual(await issue(owner.email), accepted);
      const failed = await until(() => lastToken(owner.email) !== previous && lastToken(owner.email));
      const row = await until(async () => {
        const result = await byToken(failed);
        return result?.usedAt && result;
      });
      assert.equal(row.sendCount, 0);
      assert.equal((await confirm(failed)).status, 401);
      assert.equal((await byToken(previous)).usedAt, null);
      assert.deepEqual(log.mock.calls.at(-1).arguments, ['password_reset_delivery_failed']);
      assert.deepEqual(await confirm(previous), reset);
    } finally { onSend = async mail => ({ accepted: mail.envelope.to, rejected: [] }); }
  });

  await t.test('missing mail setup returns one 503 and does not create tokens', async () => {
    const owner = await learner('unconfigured');
    mailEnabled = false;
    try {
      const result = await issue(owner.email);
      assert.equal(result.status, 503);
      assert.equal(result.body.code, 'SERVICE_UNAVAILABLE');
      assert.deepEqual(result, await issue(`not-found-${suffix}@example.test`));
      assert.deepEqual(await rows(owner.user.userId), []);
    } finally { mailEnabled = true; }
  });

  await t.test('expired, unknown and invalid password inputs do not change accounts', async () => {
    const owner = await learner('expired');
    const raw = await sent(owner.email);
    assert.equal((await confirm(raw, 'short')).status, 422);
    await tokens.update({ tokenHash: hashToken(raw) }, { expiresAt: new Date(Date.now() - 1000) });
    const expired = await confirm(raw);
    assert.equal(expired.status, 401);
    assert.deepEqual(await confirm(randomBytes(32).toString('base64url')), expired);
    assert.equal((await login(owner.email)).status, 200);
  });

  await t.test('one concurrent confirmation changes the password and revokes only the owner sessions', async () => {
    const owner = await learner('reset');
    const other = await learner('separate');
    const second = (await login(owner.email)).body.data;
    const raw = await sent(owner.email);
    const attempts = await Promise.all([confirm(raw, `  ${newPassword}  `), confirm(raw, `  ${newPassword}  `), refresh(second.refreshToken)]);
    assert.deepEqual(attempts.slice(0, 2).map(reply => reply.status).sort(), [200, 401]);
    assert.ok([200, 401].includes(attempts[2].status));
    const saved = await users.findOneByOrFail({ userId: owner.user.userId });
    assert.ok(saved.passwordChangedAt);
    assert.ok(verifyPassword(newPassword, saved.passwordHash));
    assert.ok((await byToken(raw)).usedAt);
    assert.equal((await confirm(raw)).status, 401);
    const ownerSessions = await sessions.findBy({ userId: owner.user.userId });
    assert.ok(ownerSessions.every(row => row.revokedAt));
    assert.ok(ownerSessions.some(row => row.revokeReason === 'SECURITY'));
    for (const pair of [owner, second, attempts[2].body.data].filter(Boolean)) {
      assert.equal((await profile(pair.accessToken)).status, 401);
      assert.equal((await refresh(pair.refreshToken)).status, 401);
    }
    assert.equal((await profile(other.accessToken)).status, 200);
    assert.equal((await refresh(other.refreshToken)).status, 200);
    assert.equal((await login(owner.email)).status, 401);
    assert.equal((await login(owner.email, newPassword)).status, 200);
  });

  await t.test('old-password login cannot leave a live session racing the password change', async () => {
    const owner = await learner('login-race');
    const raw = await sent(owner.email);
    const [changed, staleLogin] = await Promise.all([confirm(raw), login(owner.email)]);
    assert.deepEqual(changed, reset);
    assert.ok([200, 401].includes(staleLogin.status));
    if (staleLogin.status === 200) {
      assert.equal((await profile(staleLogin.body.data.accessToken)).status, 401);
      assert.equal((await refresh(staleLogin.body.data.refreshToken)).status, 401);
    }
    assert.equal((await login(owner.email, newPassword)).status, 200);
  });
});
