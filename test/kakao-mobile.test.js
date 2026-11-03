const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { User, SocialAccount, UserGrowth, UserSession } = require('@leren/database');
const app = require('../src/app');
const env = require('../src/config/env');
const { AppDataSource } = require('../src/config/database');
const KakaoClient = require('../src/clients/kakao.client');
const AppError = require('../src/common/errors/AppError');
const { verifyAccessToken, verifyRefreshToken } = require('../src/common/utils/token.util');
const createMobileService = require('../src/modules/auth/kakao-mobile.service');
const { MemoryOAuthStore } = require('../src/modules/auth/kakao-oauth.store');
const database = require('./helpers/auth-db');

const CALLBACK = 'https://backend.test/api/v1/auth/kakao/callback';
const APP = 'leren://auth/callback';
const verifier = () => crypto.randomBytes(32).toString('base64url');
const challenge = value => crypto.createHash('sha256').update(value).digest('base64url');
const originalEnv = { ...env };
let db;
let calls;
let base;
let server;

test.beforeEach(async () => {
  Object.assign(env, {
    nodeEnv: 'test', kakaoOauthStoreMode: 'memory', kakaoOauthCallbackUrl: CALLBACK,
    kakaoAppDeepLink: APP, kakaoAllowedAppDeepLinks: [APP], kakaoAllowedRedirectUris: [CALLBACK],
    kakaoOauthStateTtlSeconds: 300, kakaoOauthExchangeTtlSeconds: 60,
    kakaoRestApiKey: 'mock-key', kakaoClientSecret: 'mock-secret',
    jwtAccessSecret: 'mock-access-secret', jwtRefreshSecret: 'mock-refresh-secret',
    kakaoLegacyDirectLoginEnabled: false,
  });
  db = database();
  calls = [];
  test.mock.method(AppDataSource, 'transaction', db.transaction);
  test.mock.method(AppDataSource.manager, 'getRepository', db.getRepository);
  test.mock.method(KakaoClient.prototype, 'getAccessToken', async (code, uri) => {
    calls.push(['token', code, uri]);
    return { access_token: 'mock-kakao-access', refresh_token: 'mock-kakao-refresh' };
  });
  test.mock.method(KakaoClient.prototype, 'getProfile', async token => {
    calls.push(['profile', token]);
    return { id: 123, kakao_account: { email: 'same@example.com', profile: { nickname: 'Kakao user' } } };
  });
  server = await require('./helpers/listen-test-server')(app);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
  test.mock.restoreAll();
  Object.assign(env, originalEnv);
});

async function post(path, body) {
  const response = await fetch(`${base}/api/v1/auth/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function start(codeVerifier = verifier()) {
  const result = await post('kakao/start', { codeChallenge: challenge(codeVerifier), codeChallengeMethod: 'S256' });
  assert.equal(result.status, 200);
  return { ...result.body.data, codeVerifier, state: new URL(result.body.data.authorizationUrl).searchParams.get('state') };
}
async function callback(attempt, params = { code: 'mock-authorization-code' }) {
  return fetch(`${base}/api/v1/auth/kakao/callback?${new URLSearchParams({ state: attempt.state, ...params })}`, { redirect: 'manual' });
}
const exchangeBody = (attempt, url) => ({ loginCode: url.searchParams.get('loginCode'), codeVerifier: attempt.codeVerifier, loginAttemptId: attempt.loginAttemptId });

test('start generates unique state, binds the app, and sends only official Kakao parameters', async () => {
  const first = await start();
  const second = await start();
  assert.notEqual(first.state, second.state);
  const url = new URL(first.authorizationUrl);
  assert.equal(url.origin + url.pathname, 'https://kauth.kakao.com/oauth/authorize');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['client_id', 'redirect_uri', 'response_type', 'state']);
  assert.equal(url.searchParams.get('redirect_uri'), CALLBACK);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'mock-key');
  assert.equal(calls.length, 0);
});

test('full callback/exchange flow creates member but issues no session until proof is consumed', async () => {
  db.rows(User).push({ userId: 'email-user', email: 'same@example.com', accountStatus: 'ACTIVE' });
  const attempt = await start();
  const response = await callback(attempt);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(await response.text(), '');
  const url = new URL(response.headers.get('location'));
  assert.equal(url.protocol + '//' + url.host + url.pathname, APP);
  assert.deepEqual([...url.searchParams.keys()].sort(), ['loginAttemptId', 'loginCode']);
  assert.equal(db.rows(UserSession).length, 0);
  assert.equal(db.rows(SocialAccount).length, 1);
  assert.equal(db.rows(User)[1].lastLoginAt, undefined);
  const result = await post('kakao/exchange', exchangeBody(attempt, url));
  assert.equal(result.status, 200);
  assert.equal(result.body.data.isNewUser, true);
  assert.notEqual(result.body.data.user.userId, 'email-user');
  assert.equal(result.body.data.user.email, null);
  assert.equal(verifyAccessToken(result.body.data.accessToken).sub, result.body.data.user.userId);
  assert.equal(verifyRefreshToken(result.body.data.refreshToken).sub, result.body.data.user.userId);
  assert.equal(db.rows(UserSession).length, 1);
  assert.ok(db.rows(User)[1].lastLoginAt instanceof Date);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(calls, [['token', 'mock-authorization-code', CALLBACK], ['profile', 'mock-kakao-access']]);
  assert.equal(JSON.stringify(result.body).includes('mock-kakao'), false);
});

test('existing SocialAccount and learning progress survive callback/exchange', async () => {
  db.rows(User).push({ userId: 'u1', nickname: 'custom', email: null, accountStatus: 'ACTIVE' });
  db.rows(SocialAccount).push({ provider: 'KAKAO', providerUserId: '123', userId: 'u1' });
  db.rows(UserGrowth).push({ userId: 'u1', totalLevel: 7, totalExp: 100 });
  const attempt = await start();
  const url = new URL((await callback(attempt)).headers.get('location'));
  const result = await post('kakao/exchange', exchangeBody(attempt, url));
  assert.equal(result.status, 200);
  assert.equal(result.body.data.isNewUser, false);
  assert.equal(result.body.data.user.nickname, 'custom');
  assert.equal(result.body.data.user.level, 7);
});

test('missing/forged/array/reused state and missing code never exchange a Kakao token', async () => {
  for (const query of ['', '?state=forged&code=x', '?state=x&state=y&code=x', `?state=${verifier()}&code=x`]) {
    const response = await fetch(`${base}/api/v1/auth/kakao/callback${query}`, { redirect: 'manual' });
    assert.equal(response.status, 422);
    assert.equal(response.headers.get('location'), null);
  }
  const attempt = await start();
  assert.equal((await callback(attempt, {})).status, 422);
  assert.equal((await callback(attempt)).status, 422);
  assert.equal(calls.length, 0);
});

test('concurrent callbacks consume state once', async () => {
  const attempt = await start();
  const responses = await Promise.all([callback(attempt), callback(attempt)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [302, 422]);
  assert.equal(calls.filter(([kind]) => kind === 'token').length, 1);
});

test('cancellation/error descriptions are reduced to safe fixed deep-link errors', async () => {
  for (const [error, expected] of [['access_denied', 'login_cancelled'], ['sensitive-provider-error', 'login_failed']]) {
    const attempt = await start();
    const result = await callback(attempt, { error, error_description: 'secret-and-personal-data' });
    assert.equal(result.status, 302);
    const url = new URL(result.headers.get('location'));
    assert.equal(url.searchParams.get('error'), expected);
    assert.equal(url.searchParams.get('loginCode'), null);
    assert.equal(url.toString().includes('secret-and-personal-data'), false);
    assert.equal((await callback(attempt)).status, 422);
  }
  assert.equal(calls.length, 0);
});

test('Kakao outage and reused authorization code cannot issue exchange credentials', async () => {
  const used = new Set();
  test.mock.method(KakaoClient.prototype, 'getAccessToken', async code => {
    if (code === 'outage') throw AppError.unavailable('secret upstream details');
    if (used.has(code)) throw AppError.validation('already used');
    used.add(code);
    return { access_token: 'mock-kakao-access' };
  });
  const first = await start();
  assert.ok(new URL((await callback(first, { code: 'once' })).headers.get('location')).searchParams.get('loginCode'));
  for (const code of ['once', 'outage']) {
    const result = await callback(await start(), { code });
    const url = new URL(result.headers.get('location'));
    assert.equal(url.searchParams.get('error'), 'login_failed');
    assert.equal(url.searchParams.get('loginCode'), null);
    assert.equal(url.toString().includes('secret'), false);
  }
  assert.equal(db.rows(UserSession).length, 0);
});

test('wrong verifier or another attempt ID cannot exchange intercepted code', async () => {
  const attempt = await start();
  const url = new URL((await callback(attempt)).headers.get('location'));
  const body = exchangeBody(attempt, url);
  assert.equal((await post('kakao/exchange', { ...body, codeVerifier: verifier() })).status, 401);
  assert.equal((await post('kakao/exchange', { ...body, loginAttemptId: crypto.randomUUID() })).status, 401);
  assert.equal(db.rows(UserSession).length, 0);
  assert.equal((await post('kakao/exchange', body)).status, 200);
  assert.equal((await post('kakao/exchange', body)).status, 401);
});

test('simultaneous exchange consumes once and creates exactly one session', async () => {
  const attempt = await start();
  const url = new URL((await callback(attempt)).headers.get('location'));
  const results = await Promise.all([post('kakao/exchange', exchangeBody(attempt, url)), post('kakao/exchange', exchangeBody(attempt, url))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
  assert.equal(db.rows(UserSession).length, 1);
});

test('account status is rechecked after callback and before JWT issuance', async () => {
  for (const status of ['SUSPENDED', 'LOCKED', 'WITHDRAWN']) {
    db.rows(User).splice(0);
    db.rows(SocialAccount).splice(0);
    const attempt = await start();
    const url = new URL((await callback(attempt)).headers.get('location'));
    db.rows(User)[0].accountStatus = status;
    assert.equal((await post('kakao/exchange', exchangeBody(attempt, url))).status, 403);
    assert.equal(db.rows(UserSession).length, 0);
  }
});

test('state and login codes expire; hash-only bounded store prunes expired records', async () => {
  let now = 0;
  const store = new MemoryOAuthStore({ now: () => now, maxEntries: 2 });
  const auth = { prepareKakaoLogin: async () => ({ userId: 'u1', providerUserId: '123', isNewUser: true }), completeKakaoLogin: async () => ({ accessToken: 'LEREN' }) };
  const mobile = createMobileService(auth, { store });
  const v = verifier();
  const begin = () => mobile.start({ codeChallenge: challenge(v), codeChallengeMethod: 'S256' });
  const attempt = begin();
  const state = new URL(attempt.authorizationUrl).searchParams.get('state');
  assert.equal(JSON.stringify([...store.entries]).includes(state), false);
  now = 300000;
  await assert.rejects(mobile.callback({ state, code: 'code' }), e => e.statusCode === 422);
  const second = begin();
  const location = new URL(await mobile.callback({ state: new URL(second.authorizationUrl).searchParams.get('state'), code: 'code' }));
  now += 60000;
  await assert.rejects(mobile.exchange({ loginCode: location.searchParams.get('loginCode'), codeVerifier: v, loginAttemptId: second.loginAttemptId }), e => e.statusCode === 401);
  begin(); begin();
  assert.throws(begin, e => e.statusCode === 503);
  now += 300000;
  assert.doesNotThrow(begin);
});

test('redirect/deep-link settings and injected redirect requests fail closed', async () => {
  const payload = { codeChallenge: challenge(verifier()), codeChallengeMethod: 'S256' };
  assert.equal((await post('kakao/start', { ...payload, deepLink: 'https://attacker.test/' })).status, 422);
  assert.equal((await post('kakao/start', { ...payload, redirectUri: 'https://attacker.test/' })).status, 422);
  env.kakaoAllowedAppDeepLinks = [];
  assert.equal((await post('kakao/start', payload)).status, 503);
  env.kakaoAllowedAppDeepLinks = [APP];
  env.kakaoOauthCallbackUrl = 'https://attacker.test/api/v1/auth/kakao/callback';
  assert.equal((await post('kakao/start', payload)).status, 422);
  assert.equal(calls.length, 0);
});

test('production rejects memory store and the legacy state bypass even with opt-in flag', async () => {
  env.nodeEnv = 'production';
  env.kakaoLegacyDirectLoginEnabled = true;
  assert.equal((await post('kakao/start', { codeChallenge: challenge(verifier()), codeChallengeMethod: 'S256' })).status, 503);
  assert.equal((await post('kakao', { authorizationCode: 'code', redirectUri: CALLBACK })).status, 403);
  assert.equal(calls.length, 0);
});

test('missing configuration fails only mobile OAuth; direct flow is disabled by default', async () => {
  assert.equal((await post('kakao', { authorizationCode: 'code', redirectUri: CALLBACK })).status, 403);
  env.kakaoOauthStoreMode = undefined;
  assert.equal((await post('kakao/start', { codeChallenge: challenge(verifier()), codeChallengeMethod: 'S256' })).status, 503);
  assert.equal((await fetch(`${base}/health`)).status, 200);
});

test('invalid proofs are rejected and a failed session issuance still consumes the code', async () => {
  assert.equal((await post('kakao/start', { codeChallenge: 'bad', codeChallengeMethod: 'plain' })).status, 422);
  assert.equal((await post('kakao/exchange', { loginCode: verifier() })).status, 422);
  let issued = 0;
  const mobile = createMobileService({
    prepareKakaoLogin: async () => ({ userId: 'u1', providerUserId: '123', isNewUser: true }),
    completeKakaoLogin: async () => { issued++; throw AppError.unavailable('DB failure'); },
  });
  const v = verifier();
  const attempt = mobile.start({ codeChallenge: challenge(v), codeChallengeMethod: 'S256' });
  const location = new URL(await mobile.callback({ state: new URL(attempt.authorizationUrl).searchParams.get('state'), code: 'code' }));
  const body = { loginCode: location.searchParams.get('loginCode'), codeVerifier: v, loginAttemptId: attempt.loginAttemptId };
  await assert.rejects(mobile.exchange(body), e => e.statusCode === 503);
  await assert.rejects(mobile.exchange(body), e => e.statusCode === 401);
  assert.equal(issued, 1);
});

test('callback URLs and logs never contain JWT, verifier, provider messages or secrets', async () => {
  const logs = [];
  for (const level of ['log', 'warn', 'error']) test.mock.method(console, level, (...values) => logs.push(values));
  const attempt = await start();
  const response = await callback(attempt);
  const location = response.headers.get('location');
  for (const value of ['mock-secret', 'mock-access-secret', 'mock-refresh-secret', attempt.codeVerifier, 'mock-kakao-access', 'mock-kakao-refresh', 'mock-authorization-code']) {
    assert.equal(location.includes(value), false);
    assert.equal(JSON.stringify(logs).includes(value), false);
  }
  assert.equal(location.includes('eyJ'), false);
});

test('mobile exchange uses existing refresh rotation and logout/session middleware', async () => {
  const attempt = await start();
  const url = new URL((await callback(attempt)).headers.get('location'));
  const result = await post('kakao/exchange', exchangeBody(attempt, url));
  const refreshed = await post('refresh', { refreshToken: result.body.data.refreshToken });
  assert.equal(refreshed.status, 200);
  const logout = await fetch(`${base}/api/v1/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${refreshed.body.data.accessToken}` } });
  assert.equal(logout.status, 200);
  assert.equal((await post('refresh', { refreshToken: refreshed.body.data.refreshToken })).status, 401);
});

test('Swagger distinguishes callback redirect, exchange JSON, and legacy deprecation', async () => {
  const spec = await (await fetch(`${base}/api-docs.json`)).json();
  assert.ok(spec.paths['/api/v1/auth/kakao/start'].post);
  const callbackSpec = spec.paths['/api/v1/auth/kakao/callback'].get;
  assert.ok(callbackSpec.responses[302].headers.Location);
  assert.equal(callbackSpec.requestBody, undefined);
  assert.ok(spec.paths['/api/v1/auth/kakao/exchange'].post.responses[200]);
  assert.equal(spec.paths['/api/v1/auth/kakao'].post.deprecated, true);
});

test('malformed attempt UUID is rejected as 422 without consuming the valid code', async () => {
  const attempt = await start();
  const url = new URL((await callback(attempt)).headers.get('location'));
  const body = exchangeBody(attempt, url);
  for (const loginAttemptId of ['', 'not-a-uuid', 'x'.repeat(65), '00000000-0000-0000-0000-000000000000']) {
    assert.equal((await post('kakao/exchange', { ...body, loginAttemptId })).status, 422);
  }
  assert.equal(db.rows(UserSession).length, 0);
  assert.equal((await post('kakao/exchange', body)).status, 200);
  const spec = require('../src/config/swagger.config').definition;
  for (const [path, method] of [['start', 'post'], ['callback', 'get'], ['exchange', 'post']]) {
    const operation = spec.paths['/api/v1/auth/kakao/' + path][method];
    assert.ok(operation.responses[422]);
    assert.ok(operation.responses[503]);
    assert.ok(operation.responses[500]);
  }
});
