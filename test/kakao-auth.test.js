const assert = require('node:assert/strict');
const test = require('node:test');
const { User, SocialAccount, UserGrowth, UserSetting, UserSession } = require('@leren/database');
const app = require('../src/app');
const { AppDataSource } = require('../src/config/database');
const env = require('../src/config/env');
const KakaoClient = require('../src/clients/kakao.client');
const AppError = require('../src/common/errors/AppError');
const tokens = require('../src/common/utils/token.util');

const URI = 'https://frontend.test/kakao/callback';
const originalEnv = { ...env };

// These repositories model transactions/rollback without opening a DB connection.
const database = require('./helpers/auth-db');

let db;
let calls;
test.beforeEach(() => {
  env.nodeEnv = 'test';
  env.kakaoLegacyDirectLoginEnabled = true;
  env.jwtAccessSecret = 'unit-test-access-secret';
  env.jwtRefreshSecret = 'unit-test-refresh-secret';
  env.kakaoAllowedRedirectUris = [URI];
  db = database();
  calls = [];
  test.mock.method(AppDataSource, 'transaction', db.transaction);
  test.mock.method(AppDataSource.manager, 'getRepository', db.getRepository);
  test.mock.method(KakaoClient.prototype, 'getAccessToken', async (code, uri) => {
    calls.push(['token', code, uri]);
    return { access_token: 'kakao-only-token', refresh_token: 'kakao-only-refresh' };
  });
  test.mock.method(KakaoClient.prototype, 'getProfile', async accessToken => {
    calls.push(['profile', accessToken]);
    return { id: 123, kakao_account: { email: 'same@example.com', profile: { nickname: '카카오 회원' } } };
  });
});
test.afterEach(() => {
  test.mock.restoreAll();
  Object.assign(env, originalEnv);
});

async function request(path, body) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
const kakao = body => request('/api/v1/auth/kakao', body || { authorizationCode: 'code', redirectUri: URI });

test('authorization code API creates a social member and returns only LEREN tokens', async () => {
  db.rows(User).push({ userId: 'email-user', email: 'same@example.com', nickname: 'existing', accountStatus: 'ACTIVE' });
  const result = await kakao();
  assert.equal(result.status, 200);
  const { data } = result.body;
  assert.equal(data.isNewUser, true);
  assert.notEqual(data.user.userId, 'email-user');
  assert.equal(data.user.email, null);
  assert.equal(data.user.nickname, '카카오 회원');
  assert.equal(tokens.verifyAccessToken(data.accessToken).sub, data.user.userId);
  assert.equal(tokens.verifyRefreshToken(data.refreshToken).sub, data.user.userId);
  assert.deepEqual(calls, [['token', 'code', URI], ['profile', 'kakao-only-token']]);
  assert.equal(db.rows(SocialAccount)[0].providerUserId, '123');
  assert.equal(db.rows(SocialAccount)[0].provider, 'KAKAO');
  assert.equal(db.rows(UserSession)[0].refreshTokenHash, tokens.hashToken(data.refreshToken));
  assert.equal(db.rows(UserSession)[0].loginMethod, 'KAKAO');
  assert.equal(JSON.stringify(result.body).includes('kakao-only'), false);
  const second = await kakao();
  assert.equal(second.body.data.isNewUser, false);
  assert.equal(second.body.data.user.userId, data.user.userId);
  assert.equal(db.rows(SocialAccount).length, 1);
});

test('existing social login keeps nickname and learning progress', async () => {
  db.rows(User).push({ userId: 'u1', nickname: 'custom', email: null, accountStatus: 'ACTIVE' });
  db.rows(SocialAccount).push({ provider: 'KAKAO', providerUserId: '123', userId: 'u1' });
  db.rows(UserGrowth).push({ userId: 'u1', totalLevel: 9, totalExp: 800 });
  const result = await kakao();
  assert.equal(result.status, 200);
  assert.equal(result.body.data.isNewUser, false);
  assert.equal(result.body.data.user.nickname, 'custom');
  assert.equal(result.body.data.user.level, 9);
  assert.equal(result.body.data.user.totalExp, 800);
});

test('unique identity collision rolls back and retries DB only', async () => {
  db.collide();
  const result = await kakao();
  assert.equal(result.status, 200);
  assert.equal(result.body.data.isNewUser, false);
  assert.equal(db.rows(User).length, 1);
  assert.equal(db.transactionCount(), 2);
  assert.equal(calls.filter(([kind]) => kind === 'token').length, 1);
});

test('suspended and disconnected accounts cannot create sessions', async () => {
  const user = { userId: 'u1', accountStatus: 'SUSPENDED' };
  db.rows(User).push(user);
  db.rows(SocialAccount).push({ provider: 'KAKAO', providerUserId: '123', userId: 'u1' });
  assert.equal((await kakao()).status, 403);
  db.rows(User)[0].accountStatus = 'ACTIVE';
  db.rows(SocialAccount)[0].disconnectedAt = new Date();
  assert.equal((await kakao()).status, 403);
  assert.equal(db.rows(UserSession).length, 0);
});

test('missing inputs, old accessToken contract and bad redirect URIs fail before Kakao', async () => {
  for (const body of [ {}, { accessToken: 'old' },
    { authorizationCode: 'code', redirectUri: 'leren://callback' },
    { authorizationCode: 'code', redirectUri: `${URI}/` },
    { authorizationCode: 'code', redirectUri: ` ${URI}` },
    { authorizationCode: 123, redirectUri: URI },
    { authorizationCode: 'x'.repeat(4097), redirectUri: URI } ]) {
    assert.equal((await kakao(body)).status, 422);
  }
  env.kakaoAllowedRedirectUris = [];
  assert.equal((await kakao()).status, 503);
  assert.equal(calls.length, 0);
});

test('invalid code and Kakao outage return common error responses without DB writes', async () => {
  for (const error of [AppError.validation('인가 코드 오류'), AppError.unavailable('카카오 장애')]) {
    test.mock.method(KakaoClient.prototype, 'getAccessToken', async () => { throw error; });
    const result = await kakao();
    assert.equal(result.status, error.statusCode);
    assert.equal(result.body.success, false);
    assert.equal(result.body.code, error.code);
  }
  assert.equal(db.transactionCount(), 0);
});

test('missing profile ID and missing optional profile fields are handled', async () => {
  test.mock.method(KakaoClient.prototype, 'getProfile', async () => ({}));
  assert.equal((await kakao()).status, 503);
  assert.equal(db.transactionCount(), 0);
  test.mock.method(KakaoClient.prototype, 'getProfile', async () => ({ id: 123 }));
  const result = await kakao();
  assert.equal(result.status, 200);
  assert.equal(result.body.data.user.nickname, '카카오 사용자');
  assert.equal(result.body.data.user.email, null);
});

test('email signup, login and refresh rotation work with Kakao configuration absent', async () => {
  env.kakaoAllowedRedirectUris = [];
  env.kakaoRestApiKey = undefined;
  env.kakaoClientSecret = undefined;
  const signup = await request('/api/v1/auth/signup', { email: 'email@example.com', password: 'password123', nickname: 'email' });
  assert.equal(signup.status, 201);
  // PostgreSQL supplies this default; the mock makes it explicit.
  db.rows(User)[0].accountStatus = 'ACTIVE';
  const login = await request('/api/v1/auth/login', { email: 'email@example.com', password: 'password123' });
  assert.equal(login.status, 200);
  const oldToken = login.body.data.refreshToken;
  const refresh = await request('/api/v1/auth/refresh', { refreshToken: oldToken });
  assert.equal(refresh.status, 200);
  assert.equal(tokens.verifyAccessToken(refresh.body.data.accessToken).sub, signup.body.data.user.userId);
  assert.notEqual(refresh.body.data.refreshToken, oldToken);
  assert.equal((await request('/api/v1/auth/refresh', { refreshToken: oldToken })).status, 401);
  assert.equal((await request('/api/v1/auth/login', { email: 'email@example.com', password: 'wrong' })).status, 401);
});

test('Swagger describes authorization code input and LEREN response envelope', () => {
  const definition = require('../src/config/swagger.config').definition;
  const post = definition.paths['/api/v1/auth/kakao'].post;
  assert.equal(post.requestBody.content['application/json'].schema.$ref, '#/components/schemas/KakaoLoginRequest');
  assert.deepEqual(definition.components.schemas.KakaoLoginRequest.required, ['authorizationCode', 'redirectUri']);
  assert.ok(post.responses[200].content['application/json'].schema.$ref.endsWith('KakaoLoginResponse'));
  for (const status of [401, 403, 422, 503]) assert.ok(post.responses[status]);
});
