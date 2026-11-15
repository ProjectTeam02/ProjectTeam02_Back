const assert = require('node:assert/strict');
const test = require('node:test');
const app = require('../src/app');
const listenTestServer = require('./helpers/listen-test-server');

function mountPrefix(regexp) {
  const source = regexp.source;
  if (!source.includes('(?=')) return '';
  return source.slice(1, source.indexOf('(?='))
    .replace(/\\\/\?$/, '')
    .replace(/\\\//g, '/');
}

function normalize(prefix, path) {
  const value = `${prefix}/${path}`.replace(/\/+/g, '/');
  return value.replace(/\/$/, '') || '/';
}

function openApiPath(path) {
  return path.replace(/:([^/]+)/g, '{$1}');
}

function operation(spec, method, path) {
  return spec.paths?.[path]?.[method.toLowerCase()];
}

function parameter(operationValue, name, location) {
  return operationValue?.parameters?.find(item => item.name === name && item.in === location);
}

function requestSchema(spec, operationValue) {
  const schema = operationValue?.requestBody?.content?.['application/json']?.schema;
  if (schema?.$ref?.startsWith('#/components/schemas/')) {
    return spec.components?.schemas?.[schema.$ref.split('/').pop()];
  }
  return schema;
}

function registeredOperations() {
  const result = new Set();
  function walk(stack, prefix = '') {
    for (const layer of stack || []) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          const path = normalize(prefix, layer.route.path);
          if (path.startsWith('/api/v1/')) result.add(`${method.toUpperCase()} ${openApiPath(path)}`);
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack, normalize(prefix, mountPrefix(layer.regexp)));
      }
    }
  }
  walk(app._router.stack);
  return result;
}

test('런타임 OpenAPI가 /api/v1 등록 라우터 전체를 포함한다', async t => {
  const server = await listenTestServer(app);
  t.after(async () => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api-docs.json`);
  assert.equal(response.status, 200);
  const spec = await response.json();
  const documented = new Set();
  for (const [path, operations] of Object.entries(spec.paths || {})) {
    for (const method of Object.keys(operations)) {
      if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
        documented.add(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  const missing = [...registeredOperations()].filter(operation => !documented.has(operation)).sort();
  assert.deepEqual(missing, []);
});

test('대표 P0~P2 API의 Swagger 입력 위치와 필수 필드가 실제 DTO 계약과 일치한다', async t => {
  const server = await listenTestServer(app);
  t.after(async () => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api-docs.json`);
  assert.equal(response.status, 200);
  const spec = await response.json();

  const boss = operation(spec, 'GET', '/api/v1/bosses/{bossId}');
  assert.ok(parameter(boss, 'bossId', 'path'));
  assert.equal(boss.requestBody, undefined);

  const bossStart = operation(spec, 'POST', '/api/v1/bosses/{bossId}/attempts');
  assert.ok(parameter(bossStart, 'bossId', 'path'));
  const bossStartSchema = requestSchema(spec, bossStart);
  assert.deepEqual(bossStartSchema.required, ['mode']);
  assert.deepEqual(bossStartSchema.properties.mode.enum, ['START', 'RETRY']);

  const reviewItems = operation(spec, 'GET', '/api/v1/reviews/items');
  for (const name of ['source', 'conceptId', 'topicId', 'page', 'size', 'limit']) assert.ok(parameter(reviewItems, name, 'query'));

  const answer = operation(spec, 'POST', '/api/v1/attempts/{attemptId}/answers');
  assert.ok(parameter(answer, 'attemptId', 'path'));
  assert.deepEqual(requestSchema(spec, answer).required, ['questionId', 'choiceId', 'submissionId']);

  const profile = operation(spec, 'PATCH', '/api/v1/users/me');
  const profileSchema = requestSchema(spec, profile);
  assert.deepEqual(profileSchema.required, ['nickname']);
  assert.deepEqual(Object.keys(profileSchema.properties), ['nickname']);

  const purchase = operation(spec, 'POST', '/api/v1/shop/purchases');
  assert.deepEqual(requestSchema(spec, purchase).required, ['itemId', 'requestId']);
  assert.ok(parameter(purchase, 'itemId', 'path') === undefined);

  for (const current of [boss, bossStart, reviewItems, answer, profile, purchase]) {
    assert.deepEqual(current.security, [{ bearerAuth: [] }]);
    for (const status of [401, 404, 409, 422, 503]) assert.ok(current.responses[status], `${status} response is missing`);
  }
  for (const current of [boss, bossStart, reviewItems, profile, purchase]) assert.ok(current.responses[403], '403 response is missing');
});
