const assert = require('node:assert/strict');
const test = require('node:test');
const app = require('../src/app');
const listenTestServer = require('./helpers/listen-test-server');

const uuid = '123e4567-e89b-42d3-a456-426614174000';

const p0 = [
  ['GET', `/api/v1/bosses/${uuid}`],
  ['POST', `/api/v1/bosses/${uuid}/attempts`],
  ['GET', '/api/v1/reviews/items'],
  ['PUT', `/api/v1/questions/${uuid}/bookmark`],
  ['DELETE', `/api/v1/questions/${uuid}/bookmark`],
  ['GET', '/api/v1/users/me/reward-ledger'],
  ['GET', '/api/v1/topics/tree'],
  ['GET', `/api/v1/topics/${uuid}`],
];

const p1 = [
  ['POST', '/api/v1/auth/password-reset/request', {}],
  ['POST', '/api/v1/auth/password-reset/confirm', {}],
  ['GET', '/api/v1/home/summary'],
  ['GET', '/api/v1/mypage/summary'],
  ['GET', '/api/v1/learning/progress/active'],
  ['PUT', `/api/v1/learning/progress/${uuid}`],
  ['POST', `/api/v1/stages/${uuid}/relearn`],
  ['GET', '/api/v1/growth/me'],
  ['GET', '/api/v1/statistics/overall'],
  ['GET', '/api/v1/statistics/concepts'],
  ['GET', '/api/v1/reviews/due'],
  ['GET', `/api/v1/reviews/missions/${uuid}`],
  ['POST', `/api/v1/reviews/missions/${uuid}/attempts`],
  ['POST', `/api/v1/review-attempts/${uuid}/answers`],
  ['GET', `/api/v1/review-attempts/${uuid}`],
];

const p2 = [
  ['PATCH', '/api/v1/users/me'],
  ['GET', '/api/v1/users/me/notification-settings'],
  ['PATCH', '/api/v1/users/me/character/class'],
  ['GET', '/api/v1/inventory'],
  ['PUT', `/api/v1/inventory/${uuid}/equip`],
  ['GET', '/api/v1/shop/costumes'],
  ['GET', `/api/v1/shop/costumes/${uuid}`],
  ['POST', '/api/v1/shop/purchases'],
];

const protectedRequests = [...p0, ...p1.filter(([, path]) => !path.includes('/password-reset/')), ...p2];

async function withServer(callback) {
  const server = await listenTestServer(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await callback(base); } finally { await new Promise(resolve => server.close(resolve)); }
}

async function request(base, method, path, body) {
  return fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function openApiPath(path) {
  if (path.includes('/bosses/')) return path.replace(uuid, '{bossId}');
  if (path.includes('/reviews/missions/')) return path.replace(uuid, '{missionId}');
  if (path.includes('/review-attempts/')) return path.replace(uuid, '{reviewAttemptId}');
  if (path.includes('/topics/')) return path.replace(uuid, '{topicId}');
  if (path.includes('/questions/')) return path.replace(uuid, '{questionId}');
  if (path.includes('/inventory/')) return path.replace(uuid, '{itemId}');
  if (path.includes('/shop/costumes/')) return path.replace(uuid, '{itemId}');
  if (path.includes('/learning/progress/')) return path.replace(uuid, '{stageId}');
  if (path.includes('/stages/')) return path.replace(uuid, '{stageId}');
  return path;
}

for (const [priority, requests] of [['P0', p0], ['P1', p1], ['P2', p2]]) {
  test(`${priority} 확장 API는 Express 진입점과 Swagger에 연결된다`, async () => {
    await withServer(async base => {
      const spec = await (await fetch(`${base}/api-docs.json`)).json();
      for (const [method, path, body] of requests) {
        assert.ok(spec.paths[openApiPath(path)], `${priority} Swagger 누락: ${method} ${path}`);
        const response = await request(base, method, path, body);
        const expected = path.includes('/password-reset/') ? 422 : 401;
        assert.equal(response.status, expected, `${priority} HTTP 상태 불일치: ${method} ${path}`);
        const payload = await response.json();
        assert.equal(payload.success, false);
        assert.ok(['UNAUTHORIZED', 'VALIDATION_ERROR'].includes(payload.code));
      }
    });
  });
}

test('확장 API의 보호 라우트는 모두 Bearer 인증을 요구한다', async () => {
  await withServer(async base => {
    for (const [method, path] of protectedRequests) {
      const response = await request(base, method, path, method === 'POST' || method === 'PUT' || method === 'PATCH' ? {} : undefined);
      assert.equal(response.status, 401, `${method} ${path}`);
    }
  });
});
