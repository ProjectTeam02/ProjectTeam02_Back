const assert = require('node:assert/strict');
const test = require('node:test');

const { formatMyPage } = require('../src/modules/users/dto/userResponse.dto');
const userRepository = require('../src/modules/users/user.repository');
const userService = require('../src/modules/users/user.service');
const swagger = require('../src/config/swagger.config').definition;
const {
  User, UserGrowth, UserWallet, UserCharacter, UserEquippedCostume,
  UserStageProgress, ProgressStatus,
} = require('@leren/database');

const user = { userId: 'user-1', nickname: 'pia', email: null, plan: 'FREE', passwordHash: 'secret' };

test('19-01 DTO reads real DB values without leaking private columns', () => {
  const result = formatMyPage({
    user,
    growth: { totalLevel: 12, economyLevel: 8, totalExp: 240, economyExp: 120 },
    wallet: { coinBalance: 840 },
    character: { characterClass: { classId: 'class-1', classCode: 'MAGE', name: '마법사', imageKey: 'mage.png' } },
    equippedCostumes: [{ category: 'TOP', itemId: 'item-1', costume: { name: '별빛 로브', imageKey: 'robe.png' } }],
    completedStageCount: 8,
  });
  assert.equal(result.level, 12);
  assert.equal(result.economyLevel, 8);
  assert.equal(result.completedStageCount, 8);
  assert.equal(result.coinBalance, 840);
  assert.equal(result.characterClass.name, '마법사');
  assert.equal(result.equippedCostumes[0].name, '별빛 로브');
  assert.equal('passwordHash' in result, false);
});

test('19-01 DTO does not fill missing growth, wallet, and costume with fake values', () => {
  const result = formatMyPage({ user, growth: null, wallet: null, character: null, equippedCostumes: [], completedStageCount: 0 });
  assert.equal(result.level, null);
  assert.equal(result.economyLevel, null);
  assert.equal(result.totalExp, null);
  assert.equal(result.coinBalance, null);
  assert.equal(result.characterClass, null);
  assert.deepEqual(result.equippedCostumes, []);
  assert.equal(result.completedStageCount, 0);
});

test('19-01 repository uses only the authenticated user and PASSED stage count', async () => {
  const calls = [];
  const getRepository = entity => ({
    findOneBy: async where => {
      calls.push({ entity, operation: 'findOneBy', where });
      return entity === User ? user : entity === UserGrowth ? { totalLevel: 2 } : { coinBalance: 5 };
    },
    findOne: async options => { calls.push({ entity, operation: 'findOne', options }); return null; },
    find: async options => { calls.push({ entity, operation: 'find', options }); return []; },
    count: async options => { calls.push({ entity, operation: 'count', options }); return 3; },
  });
  const manager = { getRepository };
  const result = await userRepository({ manager }).findMyPage('user-1');
  assert.equal(result.completedStageCount, 3);
  assert.equal(calls.length, 6);
  assert.equal(calls.every(x => (x.where || x.options?.where).userId === 'user-1'), true);
  assert.deepEqual(calls.find(x => x.entity === UserStageProgress).options.where,
    { userId: 'user-1', progressStatus: ProgressStatus.Passed });
  assert(calls.some(x => x.entity === UserCharacter));
  assert(calls.some(x => x.entity === UserEquippedCostume));
  assert(calls.some(x => x.entity === UserWallet));
});

test('19-01 service returns a 404 if the authenticated user does not exist', async () => {
  const manager = { getRepository: entity => ({ findOneBy: async () => null }) };
  const ds = { manager, transaction: async (_isolation, callback) => callback(manager) };
  await assert.rejects(() => userService(ds).me('missing'), e => e.statusCode === 404);
});

test('19-01 Swagger documents /users/me without adding new routes', () => {
  const get = swagger.paths['/api/v1/users/me'].get;
  assert.equal(get.security[0].bearerAuth.length, 0);
  assert.equal(get.responses[200].content['application/json'].schema.properties.data.$ref,
    '#/components/schemas/MyPage');
  assert.equal(swagger.components.schemas.MyPage.properties.completedStageCount.type, 'integer');
});
