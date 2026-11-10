const test = require('node:test');
const assert = require('node:assert/strict');
const { questionKey, fingerprint } = require('../src/common/utils/ai-idempotency.util');
const repository = require('../src/modules/questions/question-generation-request.repository');
const schema = require('../src/modules/questions/question-generation.schema');
const { input } = require('./fixtures/question-generation');

test('question storage key is namespaced, deterministic and fits varchar(100)', () => {
  const key = questionKey('a'.repeat(100));
  assert.equal(key.length, 77);
  assert.match(key, /^QUESTION_GEN:[0-9a-f]{64}$/);
  assert.equal(key, questionKey('a'.repeat(100)));
  assert.notEqual(key, questionKey('b'.repeat(100)));
  for (const bad of [undefined, null, '', 'a'.repeat(101), 'has space', ' padded', '한글', 'line\nbreak', ['key']]) {
    assert.throws(() => questionKey(bad), { code: 'VALIDATION_ERROR' });
  }
});

test('fingerprint ignores property order and normalized whitespace, but includes all request fields', () => {
  const original = input();
  const changedOrder = { learningObjectives: original.learningObjectives, questionCount: 1,
    difficulty: original.difficulty, topic: ' 인플레이션 ', conceptId: original.conceptId.toUpperCase() };
  const digest = fingerprint(schema.request(original));
  assert.equal(digest, fingerprint(schema.request(changedOrder)));
  for (const patch of [{ conceptId: '22345678-1234-4234-8234-123456789abc' }, { topic: '금리' },
    { difficulty: 'HARD' }, { questionCount: 3 }, { learningObjectives: ['다른 학습 목표'] }]) {
    assert.notEqual(digest, fingerprint(schema.request({ ...original, ...patch })));
  }
});

test('replay rejects a different request type before reading or exposing its response', () => {
  const jobs = repository({});
  assert.throws(() => jobs.replay({ requestType: 'TUTOR', status: 'SUCCEEDED' }, 'hash'), { code: 'IDEMPOTENCY_NAMESPACE_CONFLICT' });
});

test('replay returns saved response and never reconstructs a missing snapshot', () => {
  const jobs = repository({});
  const response = { httpStatus: 201, body: { success: true, data: { requestId: 'test', status: 'COMPLETED', questions: [] } } };
  const job = { requestType: 'QUESTION_GEN', status: 'SUCCEEDED', knowledgeScope: {
    idempotency: { version: 1, requestFingerprint: 'hash', response } } };
  assert.deepEqual(jobs.replay(job, 'hash'), response);
  assert.throws(() => jobs.replay(job, 'another-hash'), { code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' });
  job.status = 'RESERVED';
  assert.throws(() => jobs.replay(job, 'hash'), { code: 'QUESTION_GENERATION_IN_PROGRESS' });
  job.status = 'FAILED';
  assert.throws(() => jobs.replay(job, 'hash'), { code: 'SERVICE_UNAVAILABLE' });
  job.knowledgeScope.idempotency.response = { httpStatus: 503, body: { success: false, code: 'QUESTION_GENERATION_FAILED' } };
  assert.equal(jobs.replay(job, 'hash').httpStatus, 503);
  delete job.knowledgeScope.idempotency.response;
  assert.throws(() => jobs.replay(job, 'hash'), { code: 'SERVICE_UNAVAILABLE' });
});
