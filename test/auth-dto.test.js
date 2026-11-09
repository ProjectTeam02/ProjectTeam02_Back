const assert = require('node:assert/strict');
const test = require('node:test');
const { User } = require('@leren/database');
const app = require('../src/app');
const { AppDataSource } = require('../src/config/database');
const env = require('../src/config/env');
const AppError = require('../src/common/errors/AppError');
const signupRequest = require('../src/modules/auth/dto/signupRequest.dto');
const loginRequest = require('../src/modules/auth/dto/loginRequest.dto');
const loginResponse = require('../src/modules/auth/dto/loginResponse.dto');
const kakaoRequest = require('../src/modules/auth/dto/kakaoRequest.dto');
const notificationSetting = require('../src/modules/notifications/dto/notificationSetting.dto');
const database = require('./helpers/auth-db');

const originalEnv = { ...env };
const isValidation = error => error instanceof AppError && error.statusCode === 422;
const USER_KEYS = ['userId', 'nickname', 'email', 'level', 'totalExp', 'economyLevel', 'economyExp', 'plan', 'onboardingCompleted'];
const B64 = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

test('signup DTO normalizes input and enforces DB column limits', () => {
  const parsed = signupRequest.parse({ email: '  Learner@Example.COM ', password: 'password123', nickname: '  피아  ', extra: 'ignored' });
  assert.deepEqual(parsed, { email: 'learner@example.com', password: 'password123', nickname: '피아' });
  assert.equal(signupRequest.parse({ email: 'a@b.co', password: 'password123', nickname: '가'.repeat(30) }).nickname.length, 30);
  assert.throws(() => signupRequest.parse({ email: 'a@b.co', password: 'password123', nickname: '가'.repeat(31) }), isValidation);
  assert.throws(() => signupRequest.parse({ email: `${'a'.repeat(250)}@b.com`, password: 'password123', nickname: 'n' }), isValidation);
  assert.throws(() => signupRequest.parse({ email: 'not-an-email', password: 'password123', nickname: 'n' }), isValidation);
  assert.throws(() => signupRequest.parse({ email: 'a@b.co', password: 'short', nickname: 'n' }), isValidation);
  assert.throws(() => signupRequest.parse(undefined), isValidation);
});

test('signup DTO checks passwordConfirm only when it is sent', () => {
  const base = { email: 'a@b.co', password: 'password123', nickname: 'n' };
  assert.equal(signupRequest.parse({ ...base, passwordConfirm: 'password123' }).password, 'password123');
  assert.throws(() => signupRequest.parse({ ...base, passwordConfirm: 'password124' }), isValidation);
  assert.throws(() => signupRequest.parse({ ...base, passwordConfirm: 123 }), isValidation);
  assert.equal('passwordConfirm' in signupRequest.parse({ ...base, passwordConfirm: 'password123' }), false);
});

test('login DTO does not apply signup policy or email format and refresh requires a token', () => {
  assert.deepEqual(loginRequest.parse({ email: ' OLD@Example.com ', password: 'short' }), { email: 'old@example.com', password: 'short' });
  assert.throws(() => loginRequest.parse({ email: 'a@b.co' }), isValidation);
  assert.deepEqual(loginRequest.parseRefresh({ refreshToken: ' token ' }), { refreshToken: 'token' });
  assert.throws(() => loginRequest.parseRefresh({}), isValidation);
});

test('login response exposes fixed user fields, token metadata and never entity internals', () => {
  const entity = { userId: 'u1', nickname: 'pia', email: null, plan: 'PREMIUM', passwordHash: 'hash', failedLoginCount: 3, onboardingCompletedAt: null };
  const data = loginResponse.session({ user: entity, growth: { totalLevel: 3, totalExp: 120, economyLevel: 2, economyExp: 40 }, issued: { accessToken: 'a', refreshToken: 'r' } });
  assert.deepEqual(Object.keys(data.user).sort(), [...USER_KEYS].sort());
  assert.deepEqual(data.user, { userId: 'u1', nickname: 'pia', email: null, level: 3, totalExp: 120, economyLevel: 2, economyExp: 40, plan: 'PREMIUM', onboardingCompleted: false });
  assert.equal(data.accessToken, 'a');
  assert.equal(data.refreshToken, 'r');
  assert.equal(data.tokenType, 'Bearer');
  assert.equal(data.expiresIn, env.accessTokenTtlSeconds);
  assert.equal('isNewUser' in data, false);
  assert.equal(JSON.stringify(data).includes('hash'), false);
  const kakao = loginResponse.session({ user: { ...entity, onboardingCompletedAt: new Date() }, issued: { accessToken: 'a', refreshToken: 'r' }, isNewUser: true });
  assert.equal(kakao.isNewUser, true);
  assert.equal(kakao.user.onboardingCompleted, true);
  assert.equal(kakao.user.level, 1);
});

test('Kakao DTO keeps PKCE shapes strict', () => {
  assert.deepEqual(kakaoRequest.parseStart({ codeChallenge: B64, codeChallengeMethod: 'S256' }), { codeChallenge: B64, codeChallengeMethod: 'S256' });
  assert.throws(() => kakaoRequest.parseStart({ codeChallenge: B64, codeChallengeMethod: 'plain' }), isValidation);
  assert.throws(() => kakaoRequest.parseStart({ codeChallenge: B64, codeChallengeMethod: 'S256', redirectUri: 'x' }), isValidation);
  const exchange = { loginCode: B64, codeVerifier: 'v'.repeat(43), loginAttemptId: '123e4567-e89b-42d3-a456-426614174000' };
  assert.deepEqual(kakaoRequest.parseExchange(exchange), exchange);
  assert.throws(() => kakaoRequest.parseExchange({ ...exchange, loginAttemptId: 'bad' }), isValidation);
  assert.throws(() => kakaoRequest.parseExchange({ ...exchange, extra: 1 }), isValidation);
  assert.equal(kakaoRequest.isOAuthState(B64), true);
  assert.equal(kakaoRequest.isOAuthState('short'), false);
  assert.throws(() => kakaoRequest.parseLegacyLogin({ authorizationCode: 'c', redirectUri: 'https://a.test/cb' }, ['https://other.test/cb']), isValidation);
});

test('notification DTO validates learningOn and returns fixed fields only', () => {
  assert.deepEqual(notificationSetting.parse({ learningOn: false }), { learningOn: false });
  assert.throws(() => notificationSetting.parse({ learningOn: 'true' }), isValidation);
  assert.throws(() => notificationSetting.parse(undefined), isValidation);
  const data = notificationSetting.response({ userId: 'u1', reminderEnabled: true, reminderTime: null, timezone: 'Asia/Seoul', goalCount: 3, createdAt: 'c', updatedAt: 'u', futureColumn: 'x' });
  assert.deepEqual(data, { userId: 'u1', learningOn: true, reminderEnabled: true, reminderTime: null, timezone: 'Asia/Seoul', dailyGoalCount: 3, createdAt: 'c', updatedAt: 'u' });
});

test.describe('auth HTTP responses use the DTO shape', () => {
  let db;
  test.beforeEach(() => {
    env.jwtAccessSecret = 'unit-test-access-secret';
    env.jwtRefreshSecret = 'unit-test-refresh-secret';
    db = database();
    test.mock.method(AppDataSource, 'transaction', db.transaction);
    test.mock.method(AppDataSource.manager, 'getRepository', db.getRepository);
  });
  test.afterEach(() => { test.mock.restoreAll(); Object.assign(env, originalEnv); });

  async function post(path, body) {
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    } finally { await new Promise(resolve => server.close(resolve)); }
  }

  test('signup returns user, tokens, tokenType and expiresIn', async () => {
    const result = await post('/api/v1/auth/signup', { email: 'Dto@Example.com', password: 'password123', passwordConfirm: 'password123', nickname: '디티오' });
    assert.equal(result.status, 201);
    assert.deepEqual(Object.keys(result.body.data.user).sort(), [...USER_KEYS].sort());
    assert.equal(result.body.data.user.email, 'dto@example.com');
    assert.equal(result.body.data.user.onboardingCompleted, false);
    assert.equal(result.body.data.tokenType, 'Bearer');
    assert.equal(typeof result.body.data.expiresIn, 'number');
    assert.equal(db.rows(User).length, 1);
  });

  test('signup rejects values that would overflow DB columns before touching the DB', async () => {
    const long = await post('/api/v1/auth/signup', { email: 'a@b.co', password: 'password123', nickname: 'n'.repeat(31) });
    assert.equal(long.status, 422);
    const mismatch = await post('/api/v1/auth/signup', { email: 'a@b.co', password: 'password123', passwordConfirm: 'different1', nickname: 'n' });
    assert.equal(mismatch.status, 422);
    assert.equal(db.rows(User).length, 0);
  });
});
