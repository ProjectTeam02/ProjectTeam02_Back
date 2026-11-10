const assert = require('node:assert/strict');
const test = require('node:test');
const { characterClass } = require('../src/modules/users/user.schema');
const listenTestServer = require('./helpers/listen-test-server');

const listPath = '/api/v1/character-classes';
const selectPath = '/api/v1/users/me/character-class';

test('onboarding accepts only a single uppercase classCode field', () => {
  assert.deepEqual(characterClass({ body: { classCode: 'WARRIOR' } }), { body: { classCode: 'WARRIOR' } });
  for (const body of [null, [], {}, { classCode: 'warrior' }, { classCode: 1 },
    { classCode: 'A'.repeat(31) }, { classCode: 'WARRIOR', userId: 'other-user' }]) {
    assert.throws(() => characterClass({ body }), { statusCode: 422 });
  }
});

test('onboarding routes enforce JWT and publish matching Swagger operations', async t => {
  const server = await listenTestServer(require('../src/app'));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + listPath)).status, 401);
  assert.equal((await fetch(base + selectPath, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"classCode":"WARRIOR"}',
  })).status, 401);

  const spec = await (await fetch(base + '/api-docs.json')).json();
  const list = spec.paths[listPath].get;
  const select = spec.paths[selectPath].patch;
  assert.deepEqual(list.security, [{ bearerAuth: [] }]);
  assert.deepEqual(select.security, list.security);
  assert.deepEqual(Object.keys(select.responses), ['200', '401', '404', '409', '422', '503']);
  assert.equal(select.requestBody.content['application/json'].schema.additionalProperties, false);
  assert.equal(spec.components.schemas.CharacterClass.properties.imageKey.nullable, true);
});
