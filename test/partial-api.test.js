const assert = require('node:assert/strict');
const test = require('node:test');

const AppError = require('../src/common/errors/AppError');
const quotaService = require('../src/modules/tutor/quota.service');
const quizService = require('../src/modules/quizzes/quiz.service');
const quizSchema = require('../src/modules/quizzes/quiz.schema');

test('quota reservation creates the request in the same transaction', async () => {
  let created;
  const tx = {
    aiRequest: {
      count: async () => 0,
      create: async ({ data }) => { created = data; return data; },
    },
  };
  const db = { $transaction: async (callback) => callback(tx) };
  const result = await quotaService(db).reserve('user-1', {
    requestId: 'request-1', userId: 'user-1', requestType: 'TUTOR', status: 'RESERVED',
  });

  assert.equal(result.remaining, 19);
  assert.equal(created.requestId, 'request-1');
});

test('quota reservation rejects a full daily quota', async () => {
  const db = {
    $transaction: async (callback) => callback({
      aiRequest: { count: async () => 20, create: async () => { throw new Error('not called'); } },
    }),
  };

  await assert.rejects(
    () => quotaService(db).reserve('user-1', { requestId: 'request-2' }),
    (error) => error instanceof AppError && error.statusCode === 429 && error.code === 'RATE_LIMITED',
  );
});

test('quiz idempotency returns the original result for the same answer', async () => {
  const quiz = { id: 'quiz-1', explanation: '설명', status: 'APPROVED', choices: [{ id: 'choice-1', isCorrect: true }] };
  const db = {
    quiz: { findUnique: async () => quiz },
    $transaction: async (callback) => callback({
      quizAttempt: {
        findFirst: async () => ({ id: 'attempt-1', status: 'SUBMITTED', score: 100, submissions: [{ choiceId: 'choice-1', isCorrect: true }] }),
        create: async () => { throw new Error('duplicate attempt must not be created'); },
      },
    }),
  };

  const result = await quizService(db).submit('user-1', 'quiz-1', { choiceId: 'choice-1', idempotencyKey: 'same-key' });
  assert.equal(result.duplicate, true);
  assert.equal(result.score, 100);
});

test('quiz idempotency rejects reuse with a different answer', async () => {
  const db = {
    quiz: { findUnique: async () => ({ id: 'quiz-1', explanation: '설명', status: 'APPROVED', choices: [{ id: 'choice-2', isCorrect: false }] }) },
    $transaction: async (callback) => callback({
      quizAttempt: {
        findFirst: async () => ({ id: 'attempt-1', status: 'SUBMITTED', score: 100, submissions: [{ choiceId: 'choice-1', isCorrect: true }] }),
      },
    }),
  };

  await assert.rejects(
    () => quizService(db).submit('user-1', 'quiz-1', { choiceId: 'choice-2', idempotencyKey: 'same-key' }),
    (error) => error instanceof AppError && error.statusCode === 409,
  );
});

test('quiz submission schema validates route and answer UUIDs', () => {
  const result = quizSchema.submit({
    params: { id: '123e4567-e89b-12d3-a456-426614174000' },
    body: { choiceId: '123e4567-e89b-12d3-a456-426614174001' },
    headers: { 'idempotency-key': 'request-1' },
  });
  assert.equal(result.body.idempotencyKey, 'request-1');
  assert.throws(() => quizSchema.submit({ params: { id: 'bad' }, body: {}, headers: {} }), /UUID/);
});
