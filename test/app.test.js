const assert = require('node:assert/strict');
const test = require('node:test');
const app = require('../src/app');

async function withServer(fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('health endpoint reports backend process status', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.service, 'leren-backend');
    assert.equal(body.status, 'UP');
  });
});

test('Swagger JSON exposes required paths and bearer auth', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api-docs.json`);
    assert.equal(response.status, 200);
    const spec = await response.json();
    assert.equal(spec.openapi, '3.0.3');
    assert.ok(spec.paths['/api/v1/tutor/messages']);
    assert.ok(spec.paths['/api/v1/quizzes/{id}/submit']);
    assert.ok(spec.components.securitySchemes.bearerAuth);
    assert.ok(spec.tags.some((tag) => tag.name === 'AI Tutor'));
    assert.ok(spec.tags.some((tag) => tag.name === 'Notifications'));
  });
});

test('signup validates input without touching the database', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.code, 'VALIDATION_ERROR');
  });
});

test('protected routes reject missing bearer tokens', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/users/me`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.code, 'UNAUTHORIZED');
  });
});

test('unknown API routes use the JSON error contract', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.code, 'NOT_FOUND');
  });
});
