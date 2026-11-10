const assert = require('node:assert/strict');
const test = require('node:test');

const schema = require('../src/modules/quizzes/quiz.schema');
const attemptDto = require('../src/modules/quizzes/dto/attemptResponse.dto');
const resultDto = require('../src/modules/quizzes/dto/quizResultResponse.dto');
const submitDto = require('../src/modules/quizzes/dto/submitAnswerResponse.dto');

const isValidation = error => error.statusCode === 422 && error.code === 'VALIDATION_ERROR';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('quiz submit request requires attemptId and choiceId and rejects unknown fields', () => {
  const parsed = schema.submit({ params: { id: id(1) }, body: { attemptId: id(2), choiceId: id(3) }, headers: { 'idempotency-key': 'k-1' } });
  assert.deepEqual(parsed, { params: { id: id(1) }, body: { attemptId: id(2), choiceId: id(3), idempotencyKey: 'k-1' } });
  assert.equal(schema.submit({ params: { id: id(1) }, body: { attemptId: id(2), choiceId: id(3) }, headers: {} }).body.idempotencyKey, null);
  assert.throws(() => schema.submit({ params: { id: id(1) }, body: { choiceId: id(3) }, headers: {} }), isValidation);
  assert.throws(() => schema.submit({ params: { id: id(1) }, body: { attemptId: id(2), choiceId: id(3), score: 100 }, headers: {} }), isValidation);
  assert.throws(() => schema.submit({ params: { id: id(1) }, body: { attemptId: id(2), choiceId: id(3) }, headers: { 'idempotency-key': 'k'.repeat(201) } }), isValidation);
});

test('quiz start, attempt and legacy generate requests', () => {
  assert.deepEqual(schema.start({ params: { stageId: id(1) }, body: {} }), { params: { stageId: id(1) } });
  assert.deepEqual(schema.startNew({ params: { stageId: id(1) }, body: { mode: 'RETRY' } }), {
    params: { stageId: id(1) }, body: { mode: 'RETRY' },
  });
  assert.throws(() => schema.startNew({ params: { stageId: id(1) }, body: {} }), isValidation);
  assert.throws(() => schema.startNew({ params: { stageId: id(1) }, body: { mode: 'CONTINUE' } }), isValidation);
  assert.throws(() => schema.start({ params: { stageId: id(1) }, body: { mode: 'RETRY' } }), isValidation);
  assert.throws(() => schema.attempt({ params: { attemptId: id(1) }, query: { page: '1' } }), isValidation);
  assert.deepEqual(schema.generate({ query: {} }), { query: {} });
  assert.deepEqual(schema.generate({ query: { conceptId: id(4) } }), { query: { conceptId: id(4) } });
  assert.throws(() => schema.generate({ query: { conceptId: 'ECO-01' } }), isValidation);
});

test('new answer request requires path attemptId and app-generated submissionId', () => {
  assert.deepEqual(schema.newAnswer({ params: { attemptId: id(6) }, body: {
    questionId: id(7), choiceId: id(8), submissionId: id(9),
  } }), { params: { attemptId: id(6) }, body: { questionId: id(7), choiceId: id(8), submissionId: id(9) } });
  assert.throws(() => schema.newAnswer({ params: { attemptId: id(6) }, body: {
    questionId: id(7), choiceId: id(8),
  } }), isValidation);
  assert.throws(() => schema.newAnswer({ params: { attemptId: id(6) }, body: {
    questionId: id(7), choiceId: id(8), submissionId: id(9), score: 100,
  } }), isValidation);
});

const attempt = {
  attemptId: id(10), userId: id(99), stageId: id(11), status: 'IN_PROGRESS', mode: 'START', attemptNo: 1,
  attemptType: 'PLAY', maxQuestionCount: 3, requiredCorrectCount: 2, initialHp: 2, finalHp: null,
  submittedCount: 0, correctCount: 0, endReason: null, endedAt: null, resultSavedAt: null,
  rewardGranted: false, isFirstPass: false,
};
const question = { questionId: id(20), questionText: '기회비용은?', explanation: '해설', difficulty: 'BEGINNER', conceptId: id(21), status: 'PUBLISHED' };
const choices = [1, 2, 3, 4].map(n => ({ choiceId: id(30 + n), baseOrder: n, choiceText: `선택지 ${n}`, isCorrect: n === 2 }));

test('quiz attempt response keeps the PR #51 field set and hides answers before submission', () => {
  const data = attemptDto.started(attempt, attemptDto.question(question, choices), false);
  assert.deepEqual(Object.keys(data), ['attemptId', 'stageId', 'status', 'mode', 'attemptNo', 'maxQuestionCount',
    'submittedCount', 'correctCount', 'hp', 'endReason', 'endedAt', 'rewardGranted', 'currentQuestion', 'resumed']);
  assert.equal(data.hp, 2);
  assert.equal('userId' in data, false);
  assert.deepEqual(data.currentQuestion.choices[1], { id: id(32), label: 'B', content: '선택지 2' });
  assert.equal(JSON.stringify(data.currentQuestion).includes('isCorrect'), false);
  assert.equal(JSON.stringify(data.currentQuestion).includes('해설'), false);
  const legacy = attemptDto.legacyQuestion(question, choices);
  assert.deepEqual(Object.keys(legacy), ['id', 'title', 'explanation', 'difficulty', 'conceptId', 'choices']);
  assert.equal(legacy.explanation, null);
});

test('quiz result and submit responses keep existing fields', () => {
  const endedAt = new Date('2026-11-08T12:00:00.000Z');
  const result = resultDto.result({ ...attempt, status: 'PASSED', finalHp: 0, submittedCount: 2, correctCount: 2, endReason: 'MONSTER_DEFEATED', endedAt, rewardGranted: true });
  assert.equal(result.hp, 0);
  assert.equal(result.endedAt, endedAt.toISOString());
  assert.equal('currentQuestion' in result, false);

  const submitted = submitDto.submitted({ attemptId: id(10), questionId: id(20), choiceId: id(32), isCorrect: true, explanation: '해설',
    hpBefore: 1, hpAfter: 0, submittedCount: 2, correctCount: 2, status: 'PASSED', endReason: 'MONSTER_DEFEATED', rewardGranted: true });
  assert.deepEqual(Object.keys(submitted), ['attemptId', 'quizId', 'choiceId', 'isCorrect', 'score', 'explanation', 'hpBefore', 'hpAfter',
    'submittedCount', 'correctCount', 'status', 'endReason', 'rewardGranted']);
  assert.equal(submitted.score, 100);
  const duplicate = submitDto.submitted({ attemptId: id(10), questionId: id(20), choiceId: id(31), isCorrect: false, explanation: undefined,
    hpBefore: 2, hpAfter: 2, submittedCount: 3, correctCount: 1, status: 'FAILED', rewardGranted: false, duplicate: true });
  assert.equal(duplicate.endReason, 'QUESTIONS_EXHAUSTED');
  assert.equal(duplicate.explanation, null);
  assert.equal(duplicate.duplicate, true);
});
