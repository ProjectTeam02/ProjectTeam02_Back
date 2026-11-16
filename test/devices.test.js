const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { UserSession, UserDevice } = require('@leren/database');
const app = require('../src/app');
const env = require('../src/config/env');
const { AppDataSource } = require('../src/config/database');
const { issueAccessToken } = require('../src/common/utils/token.util');
const request = require('../src/modules/devices/dto/deviceRequest.dto');
const listenTestServer = require('./helpers/listen-test-server');

// E-1 기기(푸시 토큰) 등록·해제 API와 로그아웃 시 기기 비활성화
const ids = Object.fromEntries(['user', 'other', 'session', 'otherSession'].map(name => [name, crypto.randomUUID()]));
const TOKEN = 'ExponentPushToken[abcDEF123_-xyz]';
const originalSecret = env.jwtAccessSecret;
let server;
let base;
let tables;

function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (value?._type === 'not') return row[key] !== value._value;
    if (value?.type === 'isNull') return row[key] == null;
    if (value?.type === 'moreThan') return row[key] > value.value;
    return row[key] === value;
  });
}

function repository(entity) {
  const rows = () => tables.get(entity);
  return {
    findOne: async ({ where }) => structuredClone(rows().find(row => matches(row, where)) ?? null),
    find: async ({ where }) => rows().filter(row => matches(row, where)).map(row => structuredClone(row)),
    create: data => ({ deviceId: crypto.randomUUID(), isActive: true, notificationPermission: false, pushToken: null, ...data }),
    save: async row => {
      const saved = { ...row, updatedAt: new Date('2026-11-15T00:00:00Z') };
      // DB UNIQUE(push_token)를 흉내 낸다
      if (saved.pushToken && rows().some(item => item.deviceId !== saved.deviceId && item.pushToken === saved.pushToken)) {
        throw Object.assign(new Error('duplicate push_token'), { code: '23505' });
      }
      const index = rows().findIndex(item => item.deviceId === saved.deviceId);
      if (index >= 0) rows()[index] = structuredClone(saved); else rows().push(structuredClone(saved));
      return saved;
    },
    update: async (where, values) => {
      let affected = 0;
      for (const row of rows()) if (matches(row, where)) { Object.assign(row, values); affected += 1; }
      return { affected };
    },
  };
}

test.beforeEach(async () => {
  env.jwtAccessSecret = 'devices-test-secret';
  tables = new Map([
    [UserSession, [ids.user, ids.other].map((userId, index) => ({ userId, sessionId: index ? ids.otherSession : ids.session, revokedAt: null, expiresAt: new Date(Date.now() + 60000) }))],
    [UserDevice, []],
  ]);
  const getRepository = entity => {
    assert.ok(tables.has(entity), 'device APIs must touch only user_devices (and sessions for auth)');
    return repository(entity);
  };
  test.mock.method(AppDataSource.manager, 'getRepository', getRepository);
  test.mock.method(AppDataSource, 'getRepository', getRepository);
  test.mock.method(AppDataSource, 'transaction', async callback => {
    const before = new Map([...tables].map(([key, rows]) => [key, structuredClone(rows)]));
    try { return await callback({ getRepository }); } catch (error) { tables = before; throw error; }
  });
  server = await listenTestServer(app);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
  test.mock.restoreAll();
  env.jwtAccessSecret = originalSecret;
});

async function call(method, path, body, userId = ids.user) {
  const token = issueAccessToken({ userId }, userId === ids.user ? ids.session : ids.otherSession);
  const response = await fetch(`${base}/api/v1${path}`, {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
const register = (body, userId) => call('PUT', '/users/me/devices', body, userId);
const valid = { deviceUuid: 'install-1', platform: 'ANDROID', notificationPermission: true, pushToken: TOKEN, appVersion: '1.0.0' };
const devices = () => tables.get(UserDevice);

test('요청 DTO: 필수값·형식·길이·추가 필드 검사', () => {
  const ok = request.parseRegister({ body: valid, query: {} }).body;
  assert.deepEqual(ok, { deviceUuid: 'install-1', platform: 'ANDROID', notificationPermission: true, pushToken: TOKEN, appVersion: '1.0.0' });
  assert.deepEqual(request.parseRegister({ body: { ...valid, pushToken: null }, query: {} }).body.pushToken, null);
  assert.equal('pushToken' in request.parseRegister({ body: { deviceUuid: 'a', platform: 'IOS', notificationPermission: false }, query: {} }).body, false);
  for (const body of [
    { ...valid, deviceUuid: undefined }, { ...valid, deviceUuid: 'has space' }, { ...valid, deviceUuid: 'x'.repeat(101) },
    { ...valid, platform: 'android' }, { ...valid, platform: 'WEB' }, { ...valid, notificationPermission: 'true' },
    { ...valid, pushToken: 'fcm-raw-token' }, { ...valid, pushToken: `ExponentPushToken[${'a'.repeat(520)}]` },
    { ...valid, osVersion: 'x'.repeat(31) }, { ...valid, deviceModel: 'x'.repeat(101) }, { ...valid, userId: ids.other },
  ]) assert.throws(() => request.parseRegister({ body, query: {} }), { statusCode: 422 }, JSON.stringify(body));
  assert.throws(() => request.parseRegister({ body: valid, query: { a: '1' } }), { statusCode: 422 });
  assert.throws(() => request.parseRemove({ params: { deviceUuid: 'bad uuid' }, query: {}, body: {} }), { statusCode: 422 });
});

test('등록: 새 기기 추가, 같은 deviceUuid는 갱신하고 응답에 토큰 원문이 없다', async () => {
  const created = await register(valid);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.deepEqual(Object.keys(created.body.data).sort(), ['deviceId', 'deviceUuid', 'isActive', 'notificationPermission', 'platform', 'pushTokenRegistered', 'updatedAt']);
  assert.equal(created.body.data.pushTokenRegistered, true);
  assert.equal(JSON.stringify(created.body).includes(TOKEN), false);
  const updated = await register({ deviceUuid: 'install-1', platform: 'ANDROID', notificationPermission: false, osVersion: '15' });
  assert.equal(updated.body.data.deviceId, created.body.data.deviceId);
  assert.equal(devices().length, 1);
  assert.equal(devices()[0].pushToken, TOKEN, '생략한 pushToken은 유지');
  assert.equal(devices()[0].appVersion, '1.0.0', '생략한 선택 필드는 유지');
  assert.equal(devices()[0].osVersion, '15');
  assert.equal(devices()[0].notificationPermission, false);
  assert.ok(devices()[0].lastSeenAt && devices()[0].permissionCheckedAt);
});

test('다른 계정에 같은 토큰이 있으면 그쪽 토큰을 비우고 이 계정에 등록한다', async () => {
  await register(valid, ids.other);
  const result = await register({ ...valid, deviceUuid: 'install-1' });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const otherRow = devices().find(row => row.userId === ids.other);
  const mine = devices().find(row => row.userId === ids.user);
  assert.equal(otherRow.pushToken, null);
  assert.equal(mine.pushToken, TOKEN);
});

test('해제: 비활성화하고 토큰을 비우며, 없는 기기도 200이고 다른 사용자 기기는 그대로다', async () => {
  await register(valid);
  await register({ ...valid, pushToken: 'ExponentPushToken[other]' }, ids.other);
  const removed = await call('DELETE', '/users/me/devices/install-1');
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body.data, { deviceUuid: 'install-1', isActive: false });
  const mine = devices().find(row => row.userId === ids.user);
  assert.equal(mine.isActive, false);
  assert.equal(mine.pushToken, null);
  assert.equal(devices().find(row => row.userId === ids.other).isActive, true);
  assert.equal((await call('DELETE', '/users/me/devices/unknown-device')).status, 200);
  assert.equal((await call('DELETE', '/users/me/devices/install-1?x=1')).status, 422);
});

test('로그아웃하면 그 사용자의 기기가 모두 비활성화된다', async () => {
  await register(valid);
  await register({ ...valid, deviceUuid: 'install-2', pushToken: 'ExponentPushToken[second]' });
  await register({ ...valid, pushToken: 'ExponentPushToken[other]' }, ids.other);
  const logout = await call('POST', '/auth/logout');
  assert.equal(logout.status, 200, JSON.stringify(logout.body));
  for (const row of devices().filter(item => item.userId === ids.user)) {
    assert.equal(row.isActive, false);
    assert.equal(row.pushToken, null);
  }
  assert.equal(devices().find(row => row.userId === ids.other).isActive, true);
  assert.ok(tables.get(UserSession).find(row => row.userId === ids.user).revokedAt);
});

test('인증 필수, Swagger에 두 경로가 있다', async () => {
  assert.equal((await fetch(`${base}/api/v1/users/me/devices`, { method: 'PUT' })).status, 401);
  const spec = await (await fetch(`${base}/api-docs.json`)).json();
  assert.ok(spec.paths['/api/v1/users/me/devices'].put);
  assert.ok(spec.paths['/api/v1/users/me/devices/{deviceUuid}'].delete);
  assert.deepEqual(spec.components.schemas.DeviceRegisterRequest.required, ['deviceUuid', 'platform', 'notificationPermission']);
});
