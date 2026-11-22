const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DataSource } = require('typeorm');

const config = process.env.LEREN_CLASS_DEFAULT_COSTUME_PG_TEST_CONFIG;
const migrationFile = '1795200000000-ClassDefaultCostume.js';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('class default costume migration grants existing learners without replacing their outfit', { skip: !config, timeout: 120000 }, async t => {
  const { port, database, password } = JSON.parse(config);
  assert.equal(database, 'leren_class_default_upgrade');
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

  // 이관 전 상태: 직업 2개, 직업 공용 기본 옷(is_default), 판매 옷 1개
  const [bare, dressed, noClass, secondWarrior] = [uuid(1), uuid(2), uuid(3), uuid(4)];
  const [oldDefault, robe] = [uuid(11), uuid(12)];
  await previous.initialize();
  assert.equal((await previous.query(`SELECT to_regclass('character.costumes') AS existing`))[0].existing, null);
  await previous.runMigrations();
  await previous.query(`INSERT INTO character.character_classes (class_code, name, sort_order) VALUES ('WARRIOR', '검사', 1), ('MAGE', '마법사', 2)`);
  await previous.query(`INSERT INTO character.costumes (item_id, costume_code, name, category, price_coin, is_on_sale, is_default)
    VALUES ($1, 'BASIC_OUTFIT', '기본 한벌옷', 'OUTFIT', NULL, false, true), ($2, 'ROBE', '로브', 'OUTFIT', 30, true, false)`, [oldDefault, robe]);
  for (const [index, id] of [bare, dressed, noClass, secondWarrior].entries()) {
    await previous.query('INSERT INTO account.users (user_id, nickname) VALUES ($1, $2)', [id, `class-default-${index}`]);
  }
  await previous.query(`INSERT INTO character.user_characters (user_id, class_id)
    SELECT u.user_id, c.class_id FROM (VALUES ($1::uuid, 'WARRIOR'), ($2::uuid, 'MAGE'), ($3::uuid, 'WARRIOR')) AS u(user_id, code)
    JOIN character.character_classes c ON c.class_code::text = u.code`, [bare, dressed, secondWarrior]);
  await previous.query(`INSERT INTO character.user_costumes (user_id, item_id, acquire_type) VALUES ($1, $2, 'DEFAULT')`, [dressed, oldDefault]);
  await previous.query(`INSERT INTO character.user_equipped_costumes (user_id, category, item_id, equipped_at) VALUES ($1, 'OUTFIT', $2, '2025-01-01 00:00Z')`, [dressed, oldDefault]);
  const beforeEquipment = await previous.query('SELECT * FROM character.user_equipped_costumes ORDER BY user_id');
  await previous.destroy();

  await upgraded.initialize();
  const executed = await upgraded.runMigrations();
  assert.deepEqual(executed.map(row => row.name), ['ClassDefaultCostume1795200000000']);

  const defaults = await upgraded.query(`SELECT cc.class_code::text AS class_code, c.item_id, c.costume_code, c.category::text, c.is_on_sale, c.price_coin
    FROM character.character_classes cc JOIN character.costumes c ON c.item_id = cc.default_item_id ORDER BY cc.sort_order`);
  assert.deepEqual(defaults.map(({ class_code, costume_code, category, is_on_sale, price_coin }) => [class_code, costume_code, category, is_on_sale, price_coin]), [
    ['WARRIOR', 'WARRIOR_DEFAULT_OUTFIT', 'OUTFIT', false, null],
    ['MAGE', 'MAGE_DEFAULT_OUTFIT', 'OUTFIT', false, null],
  ]);
  const [warriorOutfit, mageOutfit] = defaults.map(row => row.item_id);
  assert.equal((await upgraded.query(`SELECT count(*)::int AS n FROM character.costumes WHERE costume_code = 'ARCHER_DEFAULT_OUTFIT'`))[0].n, 1);
  assert.deepEqual(await upgraded.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'character' AND table_name = 'costumes' AND column_name = 'is_default'`), []);
  assert.deepEqual(await upgraded.query(`SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'character' AND table_name = 'character_classes' AND column_name = 'default_item_id'`), [{ is_nullable: 'NO' }]);

  const ownedAfter = await upgraded.query(`SELECT user_id, item_id, acquire_type::text, coin_ledger_id FROM character.user_costumes ORDER BY user_id, item_id`);
  const expectedOwned = [
    { user_id: bare, item_id: warriorOutfit, acquire_type: 'DEFAULT', coin_ledger_id: null },
    ...[oldDefault, mageOutfit].sort().map(item_id => ({ user_id: dressed, item_id, acquire_type: 'DEFAULT', coin_ledger_id: null })),
    { user_id: secondWarrior, item_id: warriorOutfit, acquire_type: 'DEFAULT', coin_ledger_id: null },
  ];
  assert.deepEqual(ownedAfter, expectedOwned);
  const equipmentAfter = await upgraded.query('SELECT user_id, category::text, item_id FROM character.user_equipped_costumes ORDER BY user_id');
  assert.deepEqual(equipmentAfter, [
    { user_id: bare, category: 'OUTFIT', item_id: warriorOutfit },
    { user_id: dressed, category: 'OUTFIT', item_id: oldDefault },
    { user_id: secondWarrior, category: 'OUTFIT', item_id: warriorOutfit },
  ]);
  const dressedRow = (await upgraded.query('SELECT * FROM character.user_equipped_costumes WHERE user_id = $1', [dressed]))[0];
  assert.deepEqual(dressedRow, beforeEquipment.find(row => row.user_id === dressed));
  assert.deepEqual(await upgraded.query('SELECT * FROM character.user_costumes WHERE user_id = $1', [noClass]), []);

  // 되돌리기: 구조만 원래대로, 지급한 행은 유지
  await upgraded.undoLastMigration();
  assert.deepEqual(await upgraded.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'character' AND table_name = 'character_classes' AND column_name = 'default_item_id'`), []);
  assert.deepEqual(await upgraded.query(`SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'character' AND table_name = 'costumes' AND column_name = 'is_default'`), [{ n: 1 }]);
  assert.deepEqual(await upgraded.query(`SELECT user_id, item_id, acquire_type::text, coin_ledger_id FROM character.user_costumes ORDER BY user_id, item_id`), expectedOwned);
});
