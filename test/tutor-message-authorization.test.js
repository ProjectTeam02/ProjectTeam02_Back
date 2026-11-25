const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  Question, QuestionChoice, LearningAttempt, Stage,
  StageQuestion, QuestionSubmission, AiRequest,
} = require('@leren/database');
const tutorService = require('../src/modules/tutor/tutor.service');
const { fakeDataSource, aiAnswer } = require('./helpers/tutor-fakes');

async function setup({ published = true, owned = true, assigned = true, withAttempt = true } = {}) {
  const userId = crypto.randomUUID();
  const attemptId = crypto.randomUUID();
  const questionId = crypto.randomUUID();
  const stageId = crypto.randomUUID();
  const dataSource = fakeDataSource();
  const originalRepository = dataSource.manager.getRepository.bind(dataSource.manager);
  let aiCalls = 0;

  dataSource.manager.getRepository = entity => {
    if (entity === Question) return {
      async findOne({ where }) {
        if (!published || where.questionId !== questionId || where.status !== 'PUBLISHED') return null;
        return {
          questionId, status: 'PUBLISHED',
          concept: { status: 'PUBLISHED', topic: { status: 'PUBLISHED' } },
        };
      },
    };
    if (entity === QuestionChoice) return {
      async find() {
        return [true, false, false, false].map(isCorrect => ({ isCorrect }));
      },
    };
    if (entity === LearningAttempt) {
      const attempt = {
        attemptId, userId, stageId, status: 'IN_PROGRESS',
        submittedCount: 0, maxQuestionCount: 3,
      };
      return {
        async existsBy(where) {
          return owned && where.attemptId === attemptId && where.userId === userId;
        },
        async findOneBy(where) {
          return owned && where.attemptId === attemptId && where.userId === userId ? attempt : null;
        },
      };
    }
    if (entity === QuestionSubmission) return {
      async existsBy() { return false; },
    };
    if (entity === Stage) return {
      async findOneBy(where) {
        return where.stageId === stageId ? { stageId, stageType: 'NORMAL' } : null;
      },
    };
    if (entity === StageQuestion) return {
      async existsBy(where) {
        return assigned && where.stageId === stageId
          && where.questionOrder === 1 && where.questionId === questionId;
      },
    };
    return originalRepository(entity);
  };

  const service = tutorService(dataSource, {
    async answer(body) {
      aiCalls += 1;
      return aiAnswer(body.requestId);
    },
  });
  const conversation = await service.createConversation(userId, { entryPoint: 'QUIZ' });

  return {
    send: () => service.sendMessage(userId, {
      conversationId: conversation.conversationId,
      question: '이 문항을 설명해 줘',
      modelTier: 'BASIC',
      context: { questionId, ...(withAttempt ? { attemptId } : {}) },
      knowledgeScope: null,
    }, null),
    aiCalls: () => aiCalls,
    requests: () => dataSource.tables.get(AiRequest).length,
  };
}

test('미공개 문항은 AI 호출과 사용량 차감 전에 거부한다', async () => {
  const app = await setup({ published: false, withAttempt: false });
  await assert.rejects(app.send(), error => error.statusCode === 404);
  assert.equal(app.aiCalls(), 0);
  assert.equal(app.requests(), 0);
});

test('다른 사용자 응시의 문항은 차단한다', async () => {
  const app = await setup({ owned: false });
  await assert.rejects(app.send(), error => error.statusCode === 404);
  assert.equal(app.aiCalls(), 0);
  assert.equal(app.requests(), 0);
});

test('현재 응시에 배정되지 않은 문항은 차단한다', async () => {
  const app = await setup({ assigned: false });
  await assert.rejects(app.send(), error => error.statusCode === 404);
  assert.equal(app.aiCalls(), 0);
  assert.equal(app.requests(), 0);
});

test('본인 응시의 현재 공개 문항은 AI 답변까지 성공한다', async () => {
  const app = await setup();
  const result = await app.send();
  assert.equal(result.assistantMessage.status, 'COMPLETED');
  assert.equal(app.aiCalls(), 1);
});
