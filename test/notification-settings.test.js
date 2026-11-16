const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { UserSession, UserSetting } = require('@leren/database');
const app = require('../src/app');
const env = require('../src/config/env');
const { AppDataSource } = require('../src/config/database');
const { issueAccessToken } = require('../src/common/utils/token.util');
const listenTestServer = require('./helpers/listen-test-server');

// 알림 설정 공식 API(GET/PATCH /users/me/notification-settings)와 호환 API(PATCH /users/me/notifications)
const ids = Object.fromEntries(['user', 'session'].map(name => [name, crypto.randomUUID()]));
const originalSecret = env.jwtAccessSecret;
let server;
let base;
let token;
let settings;

test.beforeEach(async () => {
  env.jwtAccessSecret = 'notification-settings-test-secret';
  settings = [];
  const session = { userId: ids.user, sessionId: ids.session, revokedAt: null, expiresAt: new Date(Date.now() + 60000) };
  const getRepository = entity => {
    if (entity === UserSession) return { findOne: async () => ({ ...session }) };
    assert.equal(entity, UserSetting, 'notification APIs must touch only user_settings');
    const find = where => structuredClone(settings.find(row => row.userId === where.userId) ?? null);
    return {
      findOne: async ({ where }) => find(where),
      findOneBy: async where => find(where),
      // DB 기본값을 흉내 낸다 (reminder_enabled false, timezone Asia/Seoul)
      create: data => ({ reminderEnabled: false, reminderTime: null, timezone: 'Asia/Seoul', goalCount: 3, ...data }),
      save: async row => {
        const saved = { ...row, createdAt: row.createdAt ?? new Date('2026-11-01T00:00:00Z'), updatedAt: new Date('2026-11-15T00:00:00Z') };
        const index = settings.findIndex(item => item.userId === row.userId);
        if (index >= 0) settings[index] = structuredClone(saved); else settings.push(structuredClone(saved));
        return saved;
      },
    };
  };
  test.mock.method(AppDataSource.manager, 'getRepository', getRepository);
  test.mock.method(AppDataSource, 'getRepository', getRepository);
  test.mock.method(AppDataSource, 'transaction', async callback => callback({ getRepository }));
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
  const response = await fetch(`${base}/api/v1/users/me${path}`, {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

test('GET은 설정이 없으면 기본값으로 만들고 알림 필드만 응답한다', async () => {
  const result = await call('GET', '/notification-settings');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(Object.keys(result.body.data).sort(), ['reminderEnabled', 'reminderTime', 'timezone', 'updatedAt']);
  assert.equal(result.body.data.reminderEnabled, false);
  assert.equal(result.body.data.reminderTime, null);
  assert.equal(settings.length, 1);
});

test('PATCH는 보낸 필드만 바꾸고 나머지는 유지한다 (HH:MM → HH:MM:SS)', async () => {
  const on = await call('PATCH', '/notification-settings', { reminderEnabled: true, reminderTime: '20:30' });
  assert.equal(on.status, 200, JSON.stringify(on.body));
  assert.equal(on.body.data.reminderTime, '20:30:00');
  const timeOnly = await call('PATCH', '/notification-settings', { reminderTime: '07:05:00' });
  assert.equal(timeOnly.body.data.reminderEnabled, true);
  assert.equal(timeOnly.body.data.reminderTime, '07:05:00');
  const zone = await call('PATCH', '/notification-settings', { timezone: 'America/New_York' });
  assert.deepEqual({ ...zone.body.data, updatedAt: undefined }, { reminderEnabled: true, reminderTime: '07:05:00', timezone: 'America/New_York', updatedAt: undefined });
  const cleared = await call('PATCH', '/notification-settings', { reminderTime: null });
  assert.equal(cleared.body.data.reminderTime, null);
  assert.equal(cleared.body.data.reminderEnabled, true);
});

test('PATCH 잘못된 요청은 422이고 저장하지 않는다', async () => {
  for (const body of [{}, { reminderEnabled: 'yes' }, { reminderTime: '25:00' }, { reminderTime: 830 }, { timezone: 'Not/AZone' },
    { timezone: 'x'.repeat(51) }, { learningOn: true }, { goalCount: 3 }]) {
    const result = await call('PATCH', '/notification-settings', body);
    assert.equal(result.status, 422, JSON.stringify(body));
  }
  assert.equal(settings.length, 0);
});

test('호환 API는 앱이 읽는 learningOn을 유지하고 dailyGoalCount는 보내지 않는다', async () => {
  const result = await call('PATCH', '/notifications', { learningOn: true });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.data.learningOn, true);
  assert.equal(result.body.data.reminderEnabled, true);
  assert.equal('dailyGoalCount' in result.body.data, false);
  const official = await call('GET', '/notification-settings');
  assert.equal(official.body.data.reminderEnabled, true);
});

test('Swagger: 공식 API는 선택 필드·실제 응답 코드, 호환 API는 deprecated', async () => {
  const spec = await (await fetch(`${base}/api-docs.json`)).json();
  const official = spec.paths['/api/v1/users/me/notification-settings'];
  const schema = official.patch.requestBody.content['application/json'].schema;
  assert.equal(schema.required, undefined);
  assert.equal(schema.minProperties, 1);
  for (const operation of [official.get, official.patch]) assert.deepEqual(Object.keys(operation.responses).sort(), ['200', '401', '422', '503']);
  assert.equal(spec.paths['/api/v1/users/me/notifications'].patch.deprecated, true);
  assert.equal('dailyGoalCount' in spec.components.schemas.NotificationSetting.properties, false);
});
