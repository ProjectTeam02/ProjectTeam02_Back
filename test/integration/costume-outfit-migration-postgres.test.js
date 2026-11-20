const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DataSource } = require('typeorm');
const listenTestServer = require('../helpers/listen-test-server');

const config = process.env.LEREN_COSTUME_MIGRATION_PG_TEST_CONFIG;
const migrationFile = '1795080000000-SharedCostumeOutfit.js';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('OUTFIT migration preserves existing items, purchases and current equipment', { skip: !config, timeout: 120000 }, async t => {
  const { port, database, password } = JSON.parse(config);
  assert.equal(database, 'leren_costume_upgrade');
  assert.ok(Number.isInteger(port) && port > 0);
  const migrationsDir = path.resolve(__dirname, '../../database/dist/migrations');
  const priorMigrations = readdirSync(migrationsDir).filter(name => name.endsWith('.js') && name < migrationFile)
    .map(name => path.join(migrationsDir, name));
  const migrationOptions = require('../../database/dist/migration-data-source').default.options;
  const options = { ...migrationOptions, host: '127.0.0.1', port, database, username: 'migrator', password,
    ssl: false, synchronize: false, migrationsRun: false };
  const previous = new DataSource({ ...options, migrations: priorMigrations });
  const upgraded = new DataSource({ ...options, migrations: [...priorMigrations, path.join(migrationsDir, migrationFile)] });
  t.after(async () => {
    for (const source of [previous, upgraded]) if (source.isInitialized) await source.destroy();
  });

  const userIds = [uuid(1), uuid(2), uuid(3), uuid(4)];
  const [owner, tied, single] = userIds;
  const [robe, armor, offSale] = [uuid(11), uuid(12), uuid(13)];
  const purchaseId = uuid(21);
  const requestId = 'legacy-upgrade-replay';
  await previous.initialize();
  assert.equal((await previous.query(`SELECT to_regclass('character.costumes') AS existing`))[0].existing, null);
  await previous.runMigrations();
  for (const [index, id] of userIds.entries()) {
    await previous.query('INSERT INTO account.users (user_id, nickname) VALUES ($1, $2)', [id, `upgrade-${index}`]);
  }
  await previous.query(`INSERT INTO character.costumes (item_id, costume_code, name, category, price_coin, is_on_sale, image_key)
    VALUES ($1, 'MIG-ROBE', 'Robe', 'TOP', 30, true, 'robe.png'),
           ($2, 'MIG-ARMOR', 'Armor', 'BOTTOM', 40, true, 'armor.png'),
           ($3, 'MIG-DEFAULT', 'Default outfit', 'TOP', NULL, false, NULL)`, [robe, armor, offSale]);
  await previous.query(`INSERT INTO reward.user_wallets (user_id, coin_balance, version) VALUES ($1, 70, 1)`, [owner]);
  await previous.query(`INSERT INTO reward.coin_ledger
    (coin_ledger_id, user_id, transaction_type, reason, amount, balance_before, balance_after, ref_type, ref_id, request_id)
    VALUES ($1, $2, 'SPEND', 'COSTUME_PURCHASE', -30, 100, 70, 'COSTUME', $3, $4)`, [purchaseId, owner, robe, requestId]);
  await previous.query(`INSERT INTO character.user_costumes (user_id, item_id, acquire_type, coin_ledger_id)
    VALUES ($1, $4, 'PURCHASE', $6), ($1, $5, 'DEFAULT', NULL), ($2, $4, 'DEFAULT', NULL),
           ($2, $5, 'DEFAULT', NULL), ($3, $5, 'DEFAULT', NULL)`, [owner, tied, single, robe, armor, purchaseId]);
  await previous.query(`INSERT INTO character.user_equipped_costumes (user_id, item_id, category, equipped_at)
    VALUES ($1, $4, 'TOP', '2025-01-01 00:00Z'), ($1, $5, 'BOTTOM', '2025-01-02 00:00Z'),
           ($2, $4, 'TOP', '2025-01-03 00:00Z'), ($2, $5, 'BOTTOM', '2025-01-03 00:00Z'),
           ($3, $5, 'BOTTOM', '2025-01-04 00:00Z')`, [owner, tied, single, robe, armor]);

  async function snapshot(db) {
    return {
      products: await db.query('SELECT * FROM character.costumes ORDER BY item_id'),
      owned: await db.query('SELECT * FROM character.user_costumes ORDER BY user_id, item_id'),
      equipment: await db.query('SELECT * FROM character.user_equipped_costumes ORDER BY user_id, item_id'),
      ledger: await db.query('SELECT * FROM reward.coin_ledger ORDER BY coin_ledger_id'),
      wallet: await db.query('SELECT * FROM reward.user_wallets ORDER BY user_id'),
    };
  }
  const before = await snapshot(previous);
  await previous.destroy();

  await upgraded.initialize();
  const executed = await upgraded.runMigrations();
  assert.deepEqual(executed.map(row => row.name), ['SharedCostumeOutfit1795080000000']);
  assert.deepEqual(await upgraded.query(`SELECT unnest(enum_range(NULL::"character".costume_category)) AS category`), [{ category: 'OUTFIT' }]);
  const after = await snapshot(upgraded);
  const asOutfit = row => ({ ...row, category: 'OUTFIT' });
  assert.deepEqual(after.products, before.products.map(asOutfit));
  assert.deepEqual(after.owned, before.owned);
  assert.deepEqual(after.ledger, before.ledger);
  assert.deepEqual(after.wallet, before.wallet);
  assert.deepEqual(after.equipment, [before.equipment[1], before.equipment[2], before.equipment[4]].map(asOutfit));
  assert.deepEqual(await upgraded.query('SELECT * FROM character.legacy_equipped_costumes ORDER BY user_id, item_id'),
    [before.equipment[0], before.equipment[3]]);

  const E = require('@leren/database');
  const appDb = E.AppDataSource;
  const env = require('../../src/config/env');
  env.jwtAccessSecret = randomBytes(32).toString('hex');
  appDb.setOptions({ host: '127.0.0.1', port, database, username: 'app_user', password: 'app_local', ssl: false });
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (appDb.isInitialized) await appDb.destroy();
  });
  await appDb.initialize();
  const account = await appDb.getRepository(E.User).findOneByOrFail({ userId: owner });
  const session = await appDb.getRepository(E.UserSession).save({ userId: owner, loginMethod: 'EMAIL',
    refreshTokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) });
  const { issueAccessToken } = require('../../src/common/utils/token.util');
  const token = issueAccessToken(account, session.sessionId);
  server = await listenTestServer(require('../../src/app'));
  async function request(route, { method = 'GET', body, status = 200 } = {}) {
    const headers = { authorization: `Bearer ${token}` };
    if (body) headers['content-type'] = 'application/json';
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${route}`,
      { method, headers, body: JSON.stringify(body) });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    assert.equal(result.success, true);
    return result.data;
  }
  const inventory = await request('/inventory');
  assert.deepEqual(inventory.items.map(item => [item.itemId, item.category, item.owned, item.equipped]).sort(),
    [[robe, 'OUTFIT', true, false], [armor, 'OUTFIT', true, true]]);
  assert.deepEqual(inventory.equipped, [{ itemId: armor, category: 'OUTFIT' }]);
  assert.deepEqual(await request('/shop/purchases', { method: 'POST', status: 201, body: { itemId: robe, requestId } }),
    { purchaseId, itemId: robe, coinBalance: 70, duplicate: true });
  await assert.rejects(() => upgraded.undoLastMigration(), /Cannot reconstruct legacy costume categories/);
  assert.deepEqual(await snapshot(upgraded), after);
});
