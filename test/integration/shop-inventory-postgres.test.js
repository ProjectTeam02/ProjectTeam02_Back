const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const test = require('node:test');
const listenTestServer = require('../helpers/listen-test-server');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('shop, wallet and inventory against isolated PostgreSQL', { skip: !config, timeout: 120000 }, async t => {
  const options = JSON.parse(config);
  const E = require('@leren/database');
  const db = E.AppDataSource;
  const env = require('../../src/config/env');
  const { issueAccessToken } = require('../../src/common/utils/token.util');
  const oldOptions = { ...db.options };
  const oldSecret = env.jwtAccessSecret;
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db.isInitialized) await db.destroy();
    db.setOptions(oldOptions);
    env.jwtAccessSecret = oldSecret;
  });
  db.setOptions({ host: '127.0.0.1', port: options.port, database: options.database || 'leren_it',
    username: options.username || 'app_user', password: options.password || 'app_local',
    ssl: false, synchronize: false, migrationsRun: false, logging: false });
  await db.initialize();
  env.jwtAccessSecret = randomBytes(32).toString('hex');
  const suffix = randomBytes(4).toString('hex');
  const repo = entity => db.getRepository(entity);
  function session(user) {
    return repo(E.UserSession).save({ userId: user.userId, loginMethod: 'EMAIL',
      refreshTokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) });
  }
  async function learner(name, coinBalance) {
    const user = await repo(E.User).save({ nickname: `${name}-${suffix}` });
    await repo(E.UserWallet).save({ userId: user.userId, coinBalance });
    return { userId: user.userId, token: issueAccessToken(user, (await session(user)).sessionId) };
  }
  const owner = await learner('구매', 100);
  const other = await learner('별도', 20);
  const buyer = await learner('동시', 100);
  const rollbackUser = await learner('롤백', 100);
  const snapshotUser = await learner('스냅샷', 100);
  const legacyUser = await learner('기존 장착', 100);
  function product(code, priceCoin, overrides = {}) {
    return repo(E.Costume).save({ costumeCode: `SHOP-${suffix}-${code}`, name: `상점 테스트 ${code}`,
      category: 'OUTFIT', isOnSale: true, priceCoin, imageKey: 'test/shop.png',
      thumbnailKey: 'test/shop-thumb.png', sortOrder: -2000, ...overrides });
  }
  const robe = await product('robe', 30);
  const armor = await product('armor', 40);
  const cheap = await product('cheap', 15);
  const expensive = await product('expensive', 200);
  const offSale = await product('off', null, { isOnSale: false });
  const rollbackItem = await product('rollback', 10);
  const snapshotItem = await product('snapshot', 10);
  const classes = repo(E.CharacterClass);
  for (const [classCode, name, sortOrder] of [['WARRIOR', '전사', 1], ['MAGE', '마법사', 2], ['ARCHER', '궁수', 3]]) {
    const existing = await classes.findOneBy({ classCode });
    if (!existing) await classes.save({ classCode, name, isActive: true, sortOrder });
    else if (!existing.isActive) await classes.update(existing.classId, { isActive: true });
  }
  await repo(E.UserWallet).update(legacyUser.userId, { coinBalance: 100 - robe.priceCoin, version: 1 });
  const legacyLedger = await repo(E.CoinLedger).save({ userId: legacyUser.userId, transactionType: 'SPEND',
    reason: 'COSTUME_PURCHASE', refType: 'COSTUME', refId: robe.itemId, amount: -robe.priceCoin,
    balanceBefore: 100, balanceAfter: 100 - robe.priceCoin, requestId: `legacy-${suffix}` });
  await repo(E.UserCostume).save([
    { userId: legacyUser.userId, itemId: robe.itemId, acquireType: 'PURCHASE', coinLedgerId: legacyLedger.coinLedgerId },
    { userId: legacyUser.userId, itemId: armor.itemId, acquireType: 'DEFAULT' },
  ]);
  await repo(E.UserEquippedCostume).save({ userId: legacyUser.userId, itemId: armor.itemId,
    category: 'OUTFIT', equippedAt: new Date(Date.UTC(2025, 0, 2)) });
  for (const [user, item] of [[owner, offSale], [snapshotUser, offSale]]) {
    await repo(E.UserCostume).save({ userId: user.userId, itemId: item.itemId, acquireType: 'DEFAULT' });
  }
  server = await listenTestServer(require('../../src/app'));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(route, { user = owner, body, method = 'GET' } = {}) {
    const headers = user ? { authorization: `Bearer ${user.token}` } : {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${origin}/api/v1${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  function data(response, status = 200) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    assert.equal(response.body.success, true);
    return response.body.data;
  }
  const buy = (user, item, key) => request('/shop/purchases', { method: 'POST', user,
    body: { itemId: item.itemId, requestId: `shop-${suffix}-${key}` } });
  const equip = (user, item) => request(`/inventory/${item.itemId}/equip`, { method: 'PUT', user });
  const inventory = async user => data(await request('/inventory', { user }));
  const wallet = async user => (await repo(E.UserWallet).findOneByOrFail({ userId: user.userId })).coinBalance;
  const equippedRows = user => repo(E.UserEquippedCostume).findBy({ userId: user.userId });
  const equippedItem = item => ({ category: item.category, itemId: item.itemId });

  await t.test('all three classes see the same sale catalog without a category filter', async () => {
    const results = [];
    for (const [user, classCode] of [[owner, 'WARRIOR'], [other, 'MAGE'], [buyer, 'ARCHER']]) {
      data(await request('/users/me/character-class', { method: 'PATCH', user, body: { classCode } }));
      assert.equal(data(await request('/users/me', { user })).characterClass.classCode, classCode);
      results.push(data(await request('/shop/costumes?size=100', { user })));
    }
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(results[0], results[2]);
    assert.ok([robe, armor].every(product => results[0].items.some(item => item.itemId === product.itemId)));
    assert.ok(results[0].items.every(item => item.isOnSale && item.category === 'OUTFIT'));
    assert.equal((await request('/shop/costumes?category=WARRIOR')).status, 422);
  });

  await t.test('purchase debits once and links the wallet, ledger and owned item', async () => {
    const sale = data(await request(`/shop/costumes/${robe.itemId}`));
    assert.deepEqual([sale.priceCoin, sale.isOnSale, sale.imageKey, sale.thumbnailKey, sale.owned, sale.equipped],
      [30, true, robe.imageKey, robe.thumbnailKey, false, false]);
    assert.equal((await request(`/shop/costumes/${offSale.itemId}`)).status, 404);
    assert.equal((await buy(other, offSale, 'off')).status, 404);
    assert.equal((await buy(other, expensive, 'too-expensive')).status, 409);
    assert.equal(await wallet(other), 20);
    assert.equal(await repo(E.CoinLedger).countBy({ userId: other.userId }), 0);
    assert.equal(await repo(E.UserCostume).countBy({ userId: other.userId }), 0);
    const purchase = data(await buy(owner, robe, 'first'), 201);
    assert.deepEqual([purchase.itemId, purchase.coinBalance, await wallet(owner)], [robe.itemId, 70, 70]);
    const ledger = await repo(E.CoinLedger).findOneByOrFail({ coinLedgerId: purchase.purchaseId });
    assert.deepEqual([ledger.userId, ledger.transactionType, ledger.reason, ledger.refType, ledger.refId, ledger.amount, ledger.balanceBefore, ledger.balanceAfter],
      [owner.userId, 'SPEND', 'COSTUME_PURCHASE', 'COSTUME', robe.itemId, -30, 100, 70]);
    const owned = await repo(E.UserCostume).findOneByOrFail({ userId: owner.userId, itemId: robe.itemId });
    assert.deepEqual([owned.acquireType, owned.coinLedgerId], ['PURCHASE', purchase.purchaseId]);
    assert.equal((await buy(owner, robe, 'owned')).status, 409);
    assert.equal((await buy(other, robe, 'first')).status, 409);
    assert.equal((await buy(owner, armor, 'first')).status, 409);
    data(await buy(owner, armor, 'second'), 201);
    assert.deepEqual(data(await buy(owner, robe, 'first'), 201), { ...purchase, duplicate: true });
    assert.equal(await wallet(owner), 30);
    assert.equal(await repo(E.CoinLedger).countBy({ userId: owner.userId }), 2);
    assert.equal(data(await request('/users/me')).coinBalance, 30);
    assert.equal((await request('/inventory', { user: null })).status, 401);
    assert.equal((await request(`/inventory?userId=${owner.userId}`, { user: other })).status, 422);
    assert.ok((await inventory(owner)).items.some(item => item.itemId === robe.itemId));
    assert.deepEqual(await inventory(other), { items: [], equipped: [] });
    assert.equal(data(await request(`/shop/costumes/${robe.itemId}`, { user: other })).owned, false);
  });

  await t.test('concurrent requests serialize wallet debits and do not duplicate ownership', async () => {
    const results = await Promise.all([buy(buyer, robe, 'parallel-a'), buy(buyer, armor, 'parallel-b')]);
    for (const response of results) data(response, 201);
    const entries = await repo(E.CoinLedger).findBy({ userId: buyer.userId });
    entries.sort((a, b) => b.balanceBefore - a.balanceBefore);
    assert.equal(entries.length, 2);
    assert.deepEqual([entries[0].balanceBefore, entries[1].balanceBefore, entries[1].balanceAfter, await wallet(buyer)],
      [100, entries[0].balanceAfter, 30, 30]);
    const same = await Promise.all([buy(buyer, cheap, 'race-1'), buy(buyer, cheap, 'race-2')]);
    assert.deepEqual(same.map(response => response.status).sort(), [201, 409]);
    assert.equal(await wallet(buyer), 15);
    assert.equal(await repo(E.UserCostume).countBy({ userId: buyer.userId, itemId: cheap.itemId }), 1);
    const duplicates = await Promise.all([buy(buyer, snapshotItem, 'same-key'), buy(buyer, snapshotItem, 'same-key')]);
    const bodies = duplicates.map(response => data(response, 201));
    assert.equal(bodies[0].purchaseId, bodies[1].purchaseId);
    assert.equal(bodies.filter(body => body.duplicate === true).length, 1);
    assert.equal(await wallet(buyer), 5);
    const competing = await Promise.all([buy(other, cheap, 'funds-a'), buy(other, snapshotItem, 'funds-b')]);
    assert.deepEqual(competing.map(response => response.status).sort(), [201, 409]);
    const winner = data(competing.find(response => response.status === 201), 201);
    assert.equal(await wallet(other), winner.coinBalance);
    assert.equal(await repo(E.CoinLedger).countBy({ userId: other.userId }), 1);
  });

  await t.test('a PostgreSQL error at the inventory insert rolls back the debit and ledger', async () => {
    const subscriber = { listenTo: () => E.UserCostume, async beforeInsert(event) {
      if (event.entity.userId !== rollbackUser.userId || event.entity.itemId !== rollbackItem.itemId) return;
      const changedWallet = await event.manager.getRepository(E.UserWallet).findOneByOrFail({ userId: rollbackUser.userId });
      assert.equal(changedWallet.coinBalance, 90);
      assert.equal(await event.manager.getRepository(E.CoinLedger).countBy({ userId: rollbackUser.userId }), 1);
      await event.queryRunner.query('SELECT 1 / 0');
    } };
    db.subscribers.push(subscriber);
    try { assert.equal((await buy(rollbackUser, rollbackItem, 'rollback')).status, 503); }
    finally { db.subscribers.splice(db.subscribers.indexOf(subscriber), 1); }
    assert.equal(await wallet(rollbackUser), 100);
    assert.equal(await repo(E.CoinLedger).countBy({ userId: rollbackUser.userId }), 0);
    assert.deepEqual(await inventory(rollbackUser), { items: [], equipped: [] });
    data(await buy(rollbackUser, rollbackItem, 'rollback'), 201);
    assert.equal(await wallet(rollbackUser), 90);
  });

  await t.test('single outfit survives replay, class change and a new session without changing purchases', async () => {
    assert.equal((await equip(other, robe)).status, 403);
    // isOnSale controls the shop; a non-sale item can still be owned and equipped.
    data(await equip(owner, offSale));
    assert.deepEqual(data(await equip(owner, robe)), equippedItem(robe));
    assert.deepEqual(data(await equip(owner, armor)), equippedItem(armor));
    const [firstEquip] = await equippedRows(owner);
    assert.equal(firstEquip.itemId, armor.itemId);
    assert.deepEqual(data(await equip(owner, armor)), equippedItem(armor));
    assert.deepEqual(await equippedRows(owner), [firstEquip]);
    const current = await inventory(owner);
    assert.deepEqual(current.equipped, [equippedItem(armor)]);
    assert.equal(current.items.find(row => row.itemId === robe.itemId).equipped, false);
    assert.equal(current.items.find(row => row.itemId === offSale.itemId).equipped, false);
    const ownedBefore = await repo(E.UserCostume).find({ where: { userId: owner.userId }, order: { itemId: 'ASC' } });
    const ledgerBefore = await repo(E.CoinLedger).find({ where: { userId: owner.userId }, order: { coinLedgerId: 'ASC' } });
    const walletBefore = await wallet(owner);
    const shopBefore = data(await request('/shop/costumes?size=100'));
    assert.equal((await request('/users/me/character/class', { method: 'PATCH', body: { classId: owner.userId } })).status, 422);
    assert.equal(data(await request('/users/me/character/class', { method: 'PATCH', body: { classCode: 'MAGE' } })).classCode, 'MAGE');
    const nextSession = await session(owner);
    const returning = { ...owner, token: issueAccessToken(owner, nextSession.sessionId) };
    const profile = data(await request('/users/me', { user: returning }));
    assert.equal(profile.characterClass.classCode, 'MAGE');
    assert.deepEqual(profile.equippedCostumes.map(row => row.itemId), [armor.itemId]);
    assert.deepEqual(await inventory(returning), current);
    assert.deepEqual(data(await request('/shop/costumes?size=100', { user: returning })), shopBefore);
    assert.deepEqual(await repo(E.UserCostume).find({ where: { userId: owner.userId }, order: { itemId: 'ASC' } }), ownedBefore);
    assert.deepEqual(await repo(E.CoinLedger).find({ where: { userId: owner.userId }, order: { coinLedgerId: 'ASC' } }), ledgerBefore);
    assert.equal(await wallet(owner), walletBefore);
  });

  await t.test('existing equipment is read consistently and switching preserves ownership and ledger', async () => {
    const rows = await equippedRows(legacyUser);
    assert.deepEqual(rows.map(row => row.itemId), [armor.itemId]);
    const current = await inventory(legacyUser);
    assert.deepEqual(current.equipped, [equippedItem(armor)]);
    const catalog = data(await request('/shop/costumes?size=100', { user: legacyUser }));
    assert.deepEqual(catalog.items.filter(item => item.equipped).map(item => item.itemId), [armor.itemId]);
    assert.equal(data(await request(`/shop/costumes/${robe.itemId}`, { user: legacyUser })).equipped, false);
    assert.equal(data(await request(`/shop/costumes/${armor.itemId}`, { user: legacyUser })).equipped, true);
    assert.deepEqual(data(await request('/users/me', { user: legacyUser })).equippedCostumes.map(row => row.itemId), [armor.itemId]);
    assert.equal((await request(`/inventory/${snapshotItem.itemId}/equip`, { method: 'PUT', user: legacyUser })).status, 403);
    assert.deepEqual(await equippedRows(legacyUser), rows);
    data(await equip(legacyUser, robe));
    assert.deepEqual((await equippedRows(legacyUser)).map(row => row.itemId), [robe.itemId]);
    assert.deepEqual((await inventory(legacyUser)).equipped, [equippedItem(robe)]);
    assert.equal(await repo(E.UserCostume).countBy({ userId: legacyUser.userId }), 2);
    const purchase = await repo(E.UserCostume).findOneByOrFail({ userId: legacyUser.userId, itemId: robe.itemId });
    assert.equal(purchase.coinLedgerId, legacyLedger.coinLedgerId);
    const ledger = await repo(E.CoinLedger).findOneByOrFail({ coinLedgerId: purchase.coinLedgerId });
    assert.deepEqual([ledger.amount, ledger.balanceBefore, ledger.balanceAfter, await wallet(legacyUser)], [-30, 100, 70, 70]);
  });

  await t.test('concurrent equips leave exactly one SQL row and an equip failure preserves it', async () => {
    for (const response of await Promise.all([equip(buyer, robe), equip(buyer, armor)])) data(response);
    const rows = await equippedRows(buyer);
    assert.equal(rows.length, 1);
    assert.deepEqual((await inventory(buyer)).equipped, [equippedItem(rows[0])]);
    assert.deepEqual((await equippedRows(owner)).map(row => row.itemId), [armor.itemId]);

    const next = rows[0].itemId === robe.itemId ? armor : robe;
    const subscriber = { listenTo: () => E.UserEquippedCostume, async afterInsert(event) {
      if (event.entity.userId === buyer.userId && event.entity.itemId === next.itemId) {
        const [updated] = await event.manager.getRepository(E.UserEquippedCostume).findBy({ userId: buyer.userId });
        assert.equal(updated.itemId, next.itemId);
        await event.queryRunner.query('SELECT 1 / 0');
      }
    } };
    db.subscribers.push(subscriber);
    try { assert.equal((await equip(buyer, next)).status, 503); }
    finally { db.subscribers.splice(db.subscribers.indexOf(subscriber), 1); }
    assert.deepEqual(await equippedRows(buyer), rows);
    assert.deepEqual(data(await equip(buyer, next)), equippedItem(next));
  });

  await t.test('catalog list and detail agree with the current authenticated user’s outfit', async () => {
    const list = data(await request('/shop/costumes?size=100'));
    for (const alias of ['OUTFIT', 'TOP', 'BOTTOM']) {
      assert.deepEqual(data(await request(`/shop/costumes?category=${alias}&size=100`)), list);
    }
    assert.ok(list.items.every(item => item.category === 'OUTFIT' && item.isOnSale));
    assert.deepEqual([list.page, list.size], [1, 100]);
    assert.equal(list.items.some(item => item.itemId === offSale.itemId), false);
    const fromList = list.items.find(item => item.itemId === robe.itemId);
    const detail = data(await request(`/shop/costumes/${robe.itemId}`));
    assert.deepEqual(fromList, detail);
    assert.deepEqual([detail.owned, detail.equipped], [true, false]);
    assert.equal(data(await request(`/shop/costumes/${armor.itemId}`)).equipped, true);
    assert.equal(data(await request(`/shop/costumes/${armor.itemId}`, { user: rollbackUser })).equipped, false);
  });

  await t.test('an inventory read uses one snapshot even when a new item is bought and equipped mid-read', async () => {
    let reached, resume;
    const firstRead = new Promise(resolve => { reached = resolve; });
    const barrier = new Promise(resolve => { resume = resolve; });
    const subscriber = { listenTo: () => E.UserCostume, async afterLoad(row) {
      if (row.userId === snapshotUser.userId && row.itemId === offSale.itemId) { reached(); await barrier; }
    } };
    db.subscribers.push(subscriber);
    const pending = inventory(snapshotUser);
    try {
      await Promise.race([firstRead, pending.then(() => assert.fail('inventory query did not reach the read barrier'))]);
      data(await buy(snapshotUser, snapshotItem, 'snapshot'), 201);
      data(await equip(snapshotUser, snapshotItem));
    } finally {
      resume();
      db.subscribers.splice(db.subscribers.indexOf(subscriber), 1);
    }
    const snapshot = await pending;
    assert.deepEqual(snapshot.items.map(row => row.itemId), [offSale.itemId]);
    assert.deepEqual(snapshot.equipped, []);
    assert.deepEqual((await inventory(snapshotUser)).equipped, [equippedItem(snapshotItem)]);
  });

  await t.test('catalog, purchase and equip routes retain their authenticated Swagger contract', async () => {
    const spec = await (await fetch(`${origin}/api-docs.json`)).json();
    for (const [route, method] of [['/inventory', 'get'], ['/inventory/{itemId}/equip', 'put'],
      ['/shop/costumes', 'get'], ['/shop/costumes/{itemId}', 'get'], ['/shop/purchases', 'post']]) {
      assert.deepEqual(spec.paths[`/api/v1${route}`][method].security, [{ bearerAuth: [] }]);
    }
    const purchase = spec.paths['/api/v1/shop/purchases'].post;
    assert.deepEqual(purchase.requestBody.content['application/json'].schema.required, ['itemId', 'requestId']);
    assert.equal(spec.paths['/api/v1/inventory/{itemId}/equip'].put.requestBody, undefined);
    const schema = (operation, status) => operation.responses[status].content['application/json'].schema.properties.data;
    const shop = spec.paths['/api/v1/shop/costumes'].get;
    const filter = shop.parameters.find(parameter => parameter.name === 'category');
    assert.equal(filter.deprecated, true);
    assert.deepEqual(filter.schema.enum, ['OUTFIT', 'TOP', 'BOTTOM']);
    assert.equal(schema(shop, 200).properties.items.items.$ref, '#/components/schemas/ShopCostumeItem');
    for (const name of ['ShopCostumeItem', 'EquippedCostume']) {
      assert.deepEqual(spec.components.schemas[name].properties.category.enum, ['OUTFIT']);
    }
    assert.equal(schema(spec.paths['/api/v1/inventory'].get, 200).properties.equipped.maxItems, 1);
    assert.equal(spec.components.schemas.MyPage.properties.equippedCostumes.maxItems, 1);
    assert.deepEqual(spec.components.schemas.MyPage.properties.equippedCostumes.items.properties.category.enum, ['OUTFIT']);
    assert.deepEqual(schema(purchase, 201).required, ['purchaseId', 'itemId', 'coinBalance']);
  });
});
