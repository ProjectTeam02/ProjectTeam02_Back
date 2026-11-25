const test = require('node:test');
const assert = require('node:assert/strict');
const { Question, QuestionChoice } = require('@leren/database');
const { assertEligibleTutorQuestion } = require('../src/modules/tutor/eligibleQuestion');

const ID = '11111111-1111-4111-8111-111111111111';

function fakeManager({
  status = 'PUBLISHED',
  conceptStatus = 'PUBLISHED',
  topicStatus = 'PUBLISHED',
  correctFlags = [true, false, false, false],
  missing = false,
} = {}) {
  return {
    getRepository(entity) {
      if (entity === Question) {
        return {
          async findOne({ where }) {
            if (missing || status !== where.status || where.questionId !== ID) return null;
            return {
              questionId: ID,
              status,
              concept: {
                status: conceptStatus,
                topic: { status: topicStatus },
              },
            };
          },
        };
      }
      if (entity === QuestionChoice) {
        return {
          async find() {
            return correctFlags.map(isCorrect => ({ isCorrect }));
          },
        };
      }
      throw new Error('Unexpected repository');
    },
  };
}

async function expectNotFound(manager, questionId = ID) {
  await assert.rejects(
    () => assertEligibleTutorQuestion(manager, questionId),
    error => error.statusCode === 404,
  );
}

test('공개 문항과 정상 선택지 구성이면 허용한다', async () => {
  const question = await assertEligibleTutorQuestion(fakeManager(), ID);
  assert.equal(question.questionId, ID);
});

test('존재하지 않는 문항은 거부한다', async () => {
  await expectNotFound(fakeManager({ missing: true }));
});

test('미승인 문항은 거부한다', async () => {
  await expectNotFound(fakeManager({ status: 'REVIEW_PENDING' }));
});

test('비공개 개념과 주제는 거부한다', async () => {
  await expectNotFound(fakeManager({ conceptStatus: 'DRAFT' }));
  await expectNotFound(fakeManager({ topicStatus: 'DRAFT' }));
});

test('선택지가 4개가 아니거나 정답이 1개가 아니면 거부한다', async () => {
  await expectNotFound(fakeManager({ correctFlags: [true, false, false] }));
  await expectNotFound(fakeManager({ correctFlags: [true, true, false, false] }));
});

test('올바르지 않은 문항 ID는 거부한다', async () => {
  await expectNotFound(fakeManager(), 'invalid-id');
});
