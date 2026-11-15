const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { UserSession } = require('@leren/database');
const app = require('../src/app');
const env = require('../src/config/env');
const { AppDataSource } = require('../src/config/database');
const { issueAccessToken } = require('../src/common/utils/token.util');
const listenTestServer = require('./helpers/listen-test-server');

// Boss 응시 조회·답안 제출은 요청 검증에서 막히면 서비스(트랜잭션)를 호출하지 않아야 한다.
const ids = Object.fromEntries(['user', 'session', 'attempt', 'question', 'choice', 'submission'].map(name => [name, crypto.randomUUID()]));
const originalSecret = env.jwtAccessSecret;
let server;
let base;
let token;
let transactions;

test.beforeEach(async () => {
  env.jwtAccessSecret = 'boss-validation-test-secret';
  transactions = 0;
  const session = { userId: ids.user, sessionId: ids.session, revokedAt: null, expiresAt: new Date(Date.now() + 60000) };
  test.mock.method(AppDataSource.manager, 'getRepository', entity => {
    assert.equal(entity, UserSession, 'validation failures must not read other tables');
    return { findOne: async () => ({ ...session }) };
  });
  test.mock.method(AppDataSource, 'transaction', async () => { transactions += 1; throw new Error('service must not run'); });
  token = issueAccessToken({ userId: ids.user }, ids.session);
  server = await listenTestServer(app);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
  test.mock.restoreAll();
  env.jwtAccessSecret = originalSecret;
});

async function call(method, path, body) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

test('Boss 응시 조회는 쿼리스트링과 잘못된 attemptId를 422로 거부한다', async () => {
  for (const path of [`/boss-attempts/${ids.attempt}?debug=1`, '/boss-attempts/not-uuid']) {
    const result = await call('GET', path);
    assert.equal(result.status, 422, path);
    assert.equal(result.body.code, 'VALIDATION_ERROR');
  }
  assert.equal(transactions, 0);
});

test('Boss 답안 제출은 submissionId 누락·형식 오류·허용 안 된 필드를 422로 거부한다', async () => {
  const valid = { questionId: ids.question, choiceId: ids.choice, submissionId: ids.submission };
  for (const body of [
    { questionId: ids.question, choiceId: ids.choice },
    { ...valid, submissionId: 'not-uuid' },
    { ...valid, idempotencyKey: 'key' },
    { ...valid, choiceId: undefined },
  ]) {
    const result = await call('POST', `/boss-attempts/${ids.attempt}/answers`, body);
    assert.equal(result.status, 422, JSON.stringify(body));
    assert.equal(result.body.code, 'VALIDATION_ERROR');
  }
  assert.equal((await call('POST', '/boss-attempts/not-uuid/answers', valid)).status, 422);
  assert.equal(transactions, 0);
});

test('Swagger의 Boss 조회·제출은 실제로 나오는 응답 코드와 공통 요청 형식만 표시한다', async () => {
  const spec = await (await fetch(`${base}/api-docs.json`)).json();
  const get = spec.paths['/api/v1/boss-attempts/{attemptId}'].get;
  const post = spec.paths['/api/v1/boss-attempts/{attemptId}/answers'].post;
  assert.deepEqual(Object.keys(get.responses).sort(), ['200', '401', '404', '422', '503']);
  assert.deepEqual(Object.keys(post.responses).sort(), ['201', '401', '404', '409', '422', '503']);
  assert.equal(post.requestBody.content['application/json'].schema.$ref, '#/components/schemas/NormalStageAnswerRequest');
});
