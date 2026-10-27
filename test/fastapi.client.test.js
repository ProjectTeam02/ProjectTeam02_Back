const test = require('node:test');
const assert = require('node:assert/strict');

const FastApiClient = require('../src/clients/fastapi.client');

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
});

test('FastApiClient forwards answer requests and parses the contract', async () => {
  global.fetch = async (url, options) => {
    assert.match(url, /internal\/v1\/tutor\/answer$/);
    assert.equal(options.headers['content-type'], 'application/json');
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        requestId: 'request-1',
        answer: '기준금리는 정책금리입니다.',
      }),
    };
  };

  const client = new FastApiClient({ baseUrl: 'http://fastapi.test', timeoutMs: 50 });
  const result = await client.answer({ requestId: 'request-1', question: '기준금리란?' });

  assert.equal(result.requestId, 'request-1');
  assert.equal(result.answer, '기준금리는 정책금리입니다.');
});

test('FastApiClient converts an upstream failure to a service-unavailable error', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 504,
    text: async () => JSON.stringify({ detail: 'upstream timeout' }),
  });

  const client = new FastApiClient({ baseUrl: 'http://fastapi.test', timeoutMs: 50 });

  await assert.rejects(
    () => client.answer({ requestId: 'request-2', question: '질문' }),
    (error) => error.code === 'SERVICE_UNAVAILABLE' && error.statusCode === 503,
  );
});

test('FastApiClient reports a disconnected health dependency on network failure', async () => {
  global.fetch = async () => {
    throw new Error('connection refused');
  };

  const client = new FastApiClient({ baseUrl: 'http://fastapi.test', timeoutMs: 50 });
  const result = await client.health();

  assert.deepEqual(result, { status: 'DISCONNECTED' });
});
