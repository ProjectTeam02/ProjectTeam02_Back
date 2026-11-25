const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LearningAttempt, Stage, StageQuestion, BossAttemptQuestion,
  QuestionSubmission, Question, QuestionChoice,
} = require('@leren/database');
const { assertOwnedTutorAttemptQuestion } = require('../src/modules/tutor/attemptQuestion');

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ATTEMPT = '33333333-3333-4333-8333-333333333333';
const STAGE = '44444444-4444-4444-8444-444444444444';
const QUESTION = '55555555-5555-4555-8555-555555555555';

function fakeManager({
  owner = USER,
  attemptStatus = 'IN_PROGRESS',
  stageType = 'NORMAL',
  submittedCount = 0,
  submitted = false,
  questionStatus = 'PUBLISHED',
  stageMappings = [{ stageId: STAGE, questionOrder: 1, questionId: QUESTION }],
  bossMappings = [],
} = {}) {
  const attempt = {
    attemptId: ATTEMPT, userId: owner, stageId: STAGE,
    status: attemptStatus, submittedCount, maxQuestionCount: 3,
  };
  const stage = { stageId: STAGE, stageType };
  const matches = (row, where) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  return {
    getRepository(entity) {
      if (entity === LearningAttempt) {
        return { async findOneBy(where) {
          return matches(attempt, where) ? attempt : null;
        } };
      }
      if (entity === Question) {
        return { async findOne({ where }) {
          if (where.questionId !== QUESTION || questionStatus !== where.status) return null;
          return {
            questionId: QUESTION,
            status: questionStatus,
            concept: { status: 'PUBLISHED', topic: { status: 'PUBLISHED' } },
          };
        } };
      }
      if (entity === QuestionChoice) {
        return { async find() {
          return [true, false, false, false].map(isCorrect => ({ isCorrect }));
        } };
      }
      if (entity === QuestionSubmission) {
        return { async existsBy(where) {
          return submitted && matches({ attemptId: ATTEMPT, questionId: QUESTION }, where);
        } };
      }
      if (entity === Stage) {
        return { async findOneBy(where) {
          return matches(stage, where) ? stage : null;
        } };
      }
      if (entity === StageQuestion) {
        return { async existsBy(where) {
          return stageMappings.some(row => matches(row, where));
        } };
      }
      if (entity === BossAttemptQuestion) {
        return { async existsBy(where) {
          return bossMappings.some(row => matches(row, where));
        } };
      }
      throw new Error('Unexpected repository');
    },
  };
}

const check = (manager, userId = USER) =>
  assertOwnedTutorAttemptQuestion(manager, userId, ATTEMPT, QUESTION);

async function rejected(manager, userId = USER) {
  await assert.rejects(() => check(manager, userId), error => error.statusCode === 404);
}

test('본인 일반 응시의 현재 문항은 허용한다', async () => {
  const question = await check(fakeManager());
  assert.equal(question.questionId, QUESTION);
});

test('본인이 이미 제출한 문항은 완료된 응시에서도 확인할 수 있다', async () => {
  const question = await check(fakeManager({ submitted: true, attemptStatus: 'PASSED' }));
  assert.equal(question.questionId, QUESTION);
});

test('다른 사용자의 응시 접근을 차단한다', async () => {
  await rejected(fakeManager({ owner: OTHER }));
});

test('현재 풀 차례가 아닌 미래 문항을 차단한다', async () => {
  await rejected(fakeManager({
    stageMappings: [{ stageId: STAGE, questionOrder: 2, questionId: QUESTION }],
  }));
});

test('완료된 응시에서 미제출 문항 접근을 차단한다', async () => {
  await rejected(fakeManager({ attemptStatus: 'FAILED' }));
});

test('보스 응시의 현재 스냅샷 문항은 허용한다', async () => {
  const question = await check(fakeManager({
    stageType: 'BOSS',
    bossMappings: [{ attemptId: ATTEMPT, questionOrder: 1, questionId: QUESTION }],
  }));
  assert.equal(question.questionId, QUESTION);
});

test('보스 스냅샷이 있으면 일반 스테이지 문항으로 우회할 수 없다', async () => {
  await rejected(fakeManager({
    stageType: 'BOSS',
    bossMappings: [{ attemptId: ATTEMPT, questionOrder: 2, questionId: QUESTION }],
  }));
});

test('스냅샷이 없는 과거 보스 응시는 기존 Stage 배정으로 확인한다', async () => {
  const question = await check(fakeManager({ stageType: 'BOSS' }));
  assert.equal(question.questionId, QUESTION);
});

test('미공개 문항은 본인 응시에서도 차단한다', async () => {
  await rejected(fakeManager({ questionStatus: 'REVIEW_PENDING' }));
});
