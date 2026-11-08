const assert = require('node:assert/strict');
const test = require('node:test');
const { transition } = require('../src/modules/quizzes/normal-stage.service');
const quizService = require('../src/modules/quizzes/quiz.service');
const { Question, QuestionChoice } = require('@leren/database');

function play(answers) {
  const attempt = { initialHp: 2, finalHp: null, submittedCount: 0, correctCount: 0,
    maxQuestionCount: 3, requiredCorrectCount: 2 };
  return answers.map(correct => {
    const step = transition(attempt, correct);
    Object.assign(attempt, { finalHp: step.hpAfter, submittedCount: step.submittedCount,
      correctCount: step.correctCount });
    return step;
  });
}

test('normal Stage correct/correct passes immediately at HP zero', () => {
  assert.deepEqual(play([true, true]).map(({ hpBefore, hpAfter, status }) => [hpBefore, hpAfter, status]),
    [[2, 1, 'IN_PROGRESS'], [1, 0, 'PASSED']]);
});

test('normal Stage wrong/correct/wrong fails after three answers', () => {
  assert.deepEqual(play([false, true, false]).map(({ hpAfter, status }) => [hpAfter, status]),
    [[2, 'IN_PROGRESS'], [1, 'IN_PROGRESS'], [1, 'FAILED']]);
});

test('normal Stage wrong/correct/correct passes on the third answer', () => {
  assert.deepEqual(play([false, true, true]).map(({ hpAfter, status }) => [hpAfter, status]),
    [[2, 'IN_PROGRESS'], [1, 'IN_PROGRESS'], [0, 'PASSED']]);
});

test('three wrong answers leave HP unchanged and never negative', () => {
  assert.deepEqual(play([false, false, false]).map(({ hpAfter, status }) => [hpAfter, status]),
    [[2, 'IN_PROGRESS'], [2, 'IN_PROGRESS'], [2, 'FAILED']]);
});

test('legacy approved-question lookup keeps its field but does not reveal explanation or answer', async () => {
  const manager = { getRepository(entity) {
    if (entity === Question) return { findOne: async () => ({
      questionId: 'q1', questionText: '문항', explanation: '비공개 해설', difficulty: 'BEGINNER', conceptId: 'c1',
    }) };
    if (entity === QuestionChoice) return { find: async () => [
      { choiceId: 'a1', baseOrder: 1, choiceText: '선택지', isCorrect: true },
    ] };
    throw new Error('unexpected repository');
  } };
  const data = await quizService({ manager, getRepository: entity => manager.getRepository(entity) }).generate();
  assert.equal(data.explanation, null);
  assert.equal('isCorrect' in data.choices[0], false);
});
