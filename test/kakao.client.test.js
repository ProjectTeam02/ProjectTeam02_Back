const assert = require('node:assert/strict');
const { test } = require('node:test');
const AppError = require('../src/common/errors/AppError');
const env = require('../src/config/env');
const KakaoClient = require('../src/clients/kakao.client');
const client = new KakaoClient();

const REDIRECT_URI = 'https://example.com/oauth/callback?from=app';
const originalFetch = global.fetch;
const originalKey = env.kakaoRestApiKey;
const originalSecret = env.kakaoClientSecret;

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function mockFetch(handler) {
  global.fetch = handler;
}

function assertAppError(error, statusCode) {
  return error instanceof AppError && error.statusCode === statusCode;
}

test.afterEach(() => {
  global.fetch = originalFetch;
  env.kakaoRestApiKey = originalKey;
  env.kakaoClientSecret = originalSecret;
});

test('token request uses POST and encodes OAuth fields', async () => {
  env.kakaoRestApiKey = 'key+test';
  env.kakaoClientSecret = 'secret&test';
  const code = 'code +/&';
  mockFetch(async (url, options) => {
    assert.equal(url, 'https://kauth.kakao.com/oauth/token');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=utf-8');
    assert.ok(options.body instanceof URLSearchParams);
    const fields = new URLSearchParams(options.body.toString());
    assert.equal(fields.get('grant_type'), 'authorization_code');
    assert.equal(fields.get('client_id'), 'key+test');
    assert.equal(fields.get('client_secret'), 'secret&test');
    assert.equal(fields.get('redirect_uri'), REDIRECT_URI);
    assert.equal(fields.get('code'), code);
    assert.match(options.body.toString(), /code=code\+%2B%2F%26/);
    return response(200, { access_token: 'access', refresh_token: 'refresh', expires_in: 100 });
  });
  const token = await client.getAccessToken(code, REDIRECT_URI);
  assert.equal(token.access_token, 'access');
  assert.equal(token.refresh_token, 'refresh');
  assert.equal(token.expires_in, 100);
});

test('missing authorization code is rejected before fetch', async () => {
  mockFetch(() => assert.fail('fetch must not run'));
  await assert.rejects(client.getAccessToken('', REDIRECT_URI), error => assertAppError(error, 422));
});

test('invalid and expired/reused codes receive safe validation errors without retries', async () => {
  env.kakaoRestApiKey = 'key';
  env.kakaoClientSecret = 'secret';
  for (const kakaoError of ['invalid_grant', 'KOE320']) {
    let calls = 0;
    mockFetch(async () => { calls++; return response(400, { error: kakaoError, error_description: 'sensitive code' }); });
    await assert.rejects(client.getAccessToken('one-time-code', REDIRECT_URI), error =>
      assertAppError(error, 422) && !error.message.includes('sensitive'));
    assert.equal(calls, 1);
  }
});

test('token endpoint 5xx is mapped to unavailable', async () => {
  env.kakaoRestApiKey = 'key';
  env.kakaoClientSecret = 'secret';
  mockFetch(async () => response(503, {}));
  await assert.rejects(client.getAccessToken('code', REDIRECT_URI), error => assertAppError(error, 503));
});

test('network failure is mapped to unavailable', async () => {
  env.kakaoRestApiKey = 'key';
  env.kakaoClientSecret = 'secret';
  mockFetch(async () => { throw new Error('sensitive request details'); });
  await assert.rejects(client.getAccessToken('code', REDIRECT_URI), error =>
    assertAppError(error, 503) && !error.message.includes('sensitive'));
});

test('request timeout aborts and returns service-unavailable error', async () => {
  env.kakaoRestApiKey = 'key';
  env.kakaoClientSecret = 'secret';
  const realSetTimeout = global.setTimeout;
  global.setTimeout = callback => { queueMicrotask(callback); return 1; };
  try {
    mockFetch((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    await assert.rejects(client.getAccessToken('code', REDIRECT_URI), error => assertAppError(error, 503));
  } finally {
    global.setTimeout = realSetTimeout;
  }
});

test('missing either OAuth credential fails before fetch', async () => {
  mockFetch(() => assert.fail('fetch must not run'));
  for (const [key, secret] of [[undefined, 'secret'], ['key', undefined], ['', 'secret']]) {
    env.kakaoRestApiKey = key;
    env.kakaoClientSecret = secret;
    await assert.rejects(client.getAccessToken('code', REDIRECT_URI), error => assertAppError(error, 503));
  }
});

test('missing access_token and malformed JSON are rejected', async () => {
  env.kakaoRestApiKey = 'key';
  env.kakaoClientSecret = 'secret';
  mockFetch(async () => response(200, { refresh_token: 'refresh' }));
  await assert.rejects(client.getAccessToken('code', REDIRECT_URI), error => assertAppError(error, 503));
  mockFetch(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON'); } }));
  await assert.rejects(client.getAccessToken('code', REDIRECT_URI), error => assertAppError(error, 503));
  mockFetch(async () => response(200, []));
  await assert.rejects(client.getAccessToken('code', REDIRECT_URI), error => assertAppError(error, 503));
});

test('redirect URI must be a nonempty HTTP(S) URL', async () => {
  mockFetch(() => assert.fail('fetch must not run'));
  for (const uri of ['', 'leren://oauth', 'ftp://example.com/callback', 'not a URL', 'https://example.com/#fragment']) {
    await assert.rejects(client.getAccessToken('code', uri), error => assertAppError(error, 422));
  }
});

test('profile request returns ID and optional account fields', async () => {
  const profile = { id: 123456, kakao_account: { email: 'user@example.com', profile: { nickname: 'User' } } };
  mockFetch(async (url, options) => {
    assert.equal(url, 'https://kapi.kakao.com/v2/user/me');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'Bearer access');
    return response(200, profile);
  });
  assert.deepEqual(await client.getProfile('access'), profile);
});

test('profile accepts absent optional email and nickname', async () => {
  mockFetch(async () => response(200, { id: 123456 }));
  assert.deepEqual(await client.getProfile('access'), { id: 123456 });
});

test('invalid access token, 5xx and absent ID are handled', async () => {
  mockFetch(async () => response(401, { msg: 'sensitive token' }));
  await assert.rejects(client.getProfile('access'), error =>
    assertAppError(error, 401) && !error.message.includes('sensitive'));
  mockFetch(async () => response(500, {}));
  await assert.rejects(client.getProfile('access'), error => assertAppError(error, 503));
  mockFetch(async () => response(200, { kakao_account: {} }));
  await assert.rejects(client.getProfile('access'), error => assertAppError(error, 503));
  await assert.rejects(client.getProfile(''), error => assertAppError(error, 422));
});

test('CommonJS export remains a constructible class', () => {
  assert.equal(typeof KakaoClient, 'function');
  assert.equal(typeof new KakaoClient().getAccessToken, 'function');
  assert.equal(typeof new KakaoClient().getProfile, 'function');
});
