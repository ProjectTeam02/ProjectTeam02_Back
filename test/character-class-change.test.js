const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { UserSession, CharacterClass, UserCharacter } = require('@leren/database');
const app = require('../src/app');
const env = require('../src/config/env');
const { AppDataSource } = require('../src/config/database');
const { issueAccessToken } = require('../src/common/utils/token.util');
const listenTestServer = require('./helpers/listen-test-server');

// 직업 변경(PATCH /users/me/character/class): classCode로 지정, 활성 직업만, 최초 선택 이후에만 가능
const ids = Object.fromEntries(['user', 'session', 'warrior', 'mage', 'archer'].map(name => [name, crypto.randomUUID()]));
const originalSecret = env.jwtAccessSecret;
let server;
let base;
let token;
let tables;
let saves;

function database() {
  tables = new Map([
    [UserSession, [{ userId: ids.user, sessionId: ids.session, revokedAt: null, expiresAt: new Date(Date.now() + 60000) }]],
    [CharacterClass, [
      { classId: ids.warrior, classCode: 'WARRIOR', isActive: true },
      { classId: ids.mage, classCode: 'MAGE', isActive: true },
      { classId: ids.archer, classCode: 'ARCHER', isActive: false },
    ]],
    [UserCharacter, []],
  ]);
  saves = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => (value?.type ? true : row[key] === value));
  const getRepository = entity => {
    assert.ok(tables.has(entity), 'unexpected entity');
    return {
      findOne: async ({ where }) => structuredClone(tables.get(entity).find(row => matches(row, where)) ?? null),
      findOneBy: async where => structuredClone(tables.get(entity).find(row => matches(row, where)) ?? null),
      save: async row => {
        saves.push(entity);
        const list = tables.get(entity);
        const index = list.findIndex(item => item.userId === row.userId);
        if (index >= 0) list[index] = structuredClone(row); else list.push(structuredClone(row));
        return row;
      },
    };
  };
  return { manager: { getRepository }, transaction: async callback => callback({ getRepository }) };
}

test.beforeEach(async () => {
  env.jwtAccessSecret = 'class-change-test-secret';
  const db = database();
  test.mock.method(AppDataSource.manager, 'getRepository', db.manager.getRepository);
  test.mock.method(AppDataSource, 'transaction', db.transaction);
  token = issueAccessToken({ userId: ids.user }, ids.session);
  server = await listenTestServer(app);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
  test.mock.restoreAll();
  env.jwtAccessSecret = originalSecret;
});

async function change(body, method = 'PATCH') {
  const response = await fetch(`${base}/api/v1/users/me/character/class`, {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
const select = classId => tables.get(UserCharacter).push({ userId: ids.user, classId, firstSelectedAt: new Date('2026-11-01'), classChangedAt: null });

test('직업 변경은 classCode만 받는다 (classId·소문자·모르는 코드·추가 필드는 422)', async () => {
  select(ids.warrior);
  for (const body of [{ classId: ids.mage }, { classCode: 'mage' }, { classCode: 'KNIGHT' }, { classCode: 'MAGE', userId: ids.user }, {}]) {
    const result = await change(body);
    assert.equal(result.status, 422, JSON.stringify(body));
    assert.equal(result.body.code, 'VALIDATION_ERROR');
  }
  assert.equal(tables.get(UserCharacter)[0].classId, ids.warrior);
});

test('직업을 처음 선택하기 전에는 변경할 수 없다 (409, 저장 없음)', async () => {
  const result = await change({ classCode: 'MAGE' });
  assert.equal(result.status, 409);
  assert.equal(tables.get(UserCharacter).length, 0);
  assert.equal(saves.length, 0);
});

test('비활성 직업으로는 변경할 수 없다 (404)', async () => {
  select(ids.warrior);
  assert.equal((await change({ classCode: 'ARCHER' })).status, 404);
  assert.equal(tables.get(UserCharacter)[0].classId, ids.warrior);
});

test('다른 활성 직업으로 변경하면 classChangedAt을 기록하고, 같은 직업이면 저장하지 않는다', async () => {
  select(ids.warrior);
  const changed = await change({ classCode: 'MAGE' });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.deepEqual(changed.body.data, { userId: ids.user, classId: ids.mage, classCode: 'MAGE' });
  const row = tables.get(UserCharacter)[0];
  assert.equal(row.classId, ids.mage);
  assert.ok(row.classChangedAt);
  assert.equal(saves.length, 1);
  const same = await change({ classCode: 'MAGE' });
  assert.equal(same.status, 200);
  assert.equal(saves.length, 1);
});

test('PUT 호환 경로는 최초 선택 API와 같은 검증(classCode만)을 쓰고, Swagger는 classCode로 안내한다', async () => {
  assert.equal((await change({ classId: ids.mage }, 'PUT')).status, 422);
  const spec = await (await fetch(`${base}/api-docs.json`)).json();
  const operations = spec.paths['/api/v1/users/me/character/class'];
  assert.equal(operations.put.deprecated, true);
  for (const operation of [operations.put, operations.patch]) {
    const schema = operation.requestBody.content['application/json'].schema;
    assert.deepEqual(schema.required, ['classCode']);
    assert.deepEqual(schema.properties.classCode.enum, ['WARRIOR', 'MAGE', 'ARCHER']);
    assert.deepEqual(Object.keys(operation.responses).sort(), ['200', '401', '404', '409', '422', '503']);
  }
});
