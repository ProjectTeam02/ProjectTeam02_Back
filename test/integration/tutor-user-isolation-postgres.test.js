const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const express = require('express');
const test = require('node:test');
const { In } = require('typeorm');
const listenTestServer = require('../helpers/listen-test-server');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('Tutor HTTP user isolation with PostgreSQL and a loopback FastAPI mock', { skip: !config, timeout: 120000 }, async t => {
  const options = JSON.parse(config);
  const E = require('@leren/database');
  const db = E.AppDataSource;
  const env = require('../../src/config/env');
  const { issueAccessToken } = require('../../src/common/utils/token.util');
  const previousDb = { ...db.options };
  const previousEnv = { ...env };
  const servers = [];
  t.after(async () => {
    for (const server of servers.reverse()) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    if (db.isInitialized) await db.destroy();
    db.setOptions(previousDb);
    Object.assign(env, previousEnv);
  });
  db.setOptions({
    host: '127.0.0.1', port: options.port, database: options.database || 'leren_it',
    username: options.username || 'app_user', password: options.password || 'app_local',
    ssl: false, synchronize: false, migrationsRun: false, logging: false,
  });
  await db.initialize();

  const received = [];
  const mock = express();
  mock.use(express.json());
  mock.post('/internal/v1/tutor/answer', (req, res) => {
    const body = req.body;
    received.push(body);
    if (body.question === 'upstream-422') return res.status(422).json({ detail: 'mock rejection detail' });
    if (body.question === 'upstream-timeout') return;
    const response = {
      requestId: body.requestId,
      answer: `mock: ${body.question}`,
      groundingStatus: 'INSUFFICIENT',
      sources: [],
      usage: { latencyMs: 1, cacheHit: false, retrievalStrategy: 'mock' },
    };
    if (body.question === 'upstream-invalid') response.requestId = randomUUID();
    return res.json(response);
  });
  const ai = await listenTestServer(mock);
  servers.push(ai);
  Object.assign(env, {
    fastapiBaseUrl: `http://127.0.0.1:${ai.address().port}`, fastapiInternalToken: null,
    fastapiTimeoutMs: 2000, tutorPersonalizationEnabled: true,
    jwtAccessSecret: randomBytes(32).toString('hex'),
  });
  const backend = await listenTestServer(require('../../src/app'));
  servers.push(backend);
  const baseUrl = `http://127.0.0.1:${backend.address().port}/api/v1/tutor`;

  const suffix = randomUUID().slice(0, 8);
  const save = (entity, row) => db.getRepository(entity).save(row);
  const makeUser = async label => {
    const user = await save(E.User, { nickname: `BE06-${label}-${suffix}` });
    const session = await save(E.UserSession, {
      userId: user.userId, loginMethod: 'EMAIL', expiresAt: new Date(Date.now() + 3600000),
      refreshTokenHash: randomBytes(32).toString('hex'),
    });
    return { id: user.userId, token: issueAccessToken(user, session.sessionId) };
  };
  const [owner, other, empty] = await Promise.all(['A', 'B', 'empty'].map(makeUser));
  const topic = await save(E.Topic, {
    topicCode: `BE06-${suffix}`, topicNo: 32000 + parseInt(suffix, 16) % 700,
    status: 'PUBLISHED', title: 'BE-06',
  });
  const conceptCode = `BE06-C-${suffix}`;
  const documentIds = [`be06-approved-${suffix}`, `be06-pending-${suffix}`];
  const concept = await save(E.Concept, {
    topicId: topic.topicId, conceptCode, status: 'PUBLISHED', title: '물가', sourceDocumentIds: documentIds,
  });
  const question = await save(E.Question, {
    conceptId: concept.conceptId, questionCode: `BE06-Q-${suffix}`, status: 'PUBLISHED',
    generatedBy: 'MANUAL', questionText: '물가 문항', explanation: '테스트 해설',
  });
  const choices = await save(E.QuestionChoice, [1, 2].map(baseOrder => ({
    questionId: question.questionId, baseOrder, choiceText: `보기 ${baseOrder}`, isCorrect: baseOrder === 1,
  })));

  async function learn(user, stageNo, isCorrect, studiedAt) {
    const stage = await save(E.Stage, {
      topicId: topic.topicId, stageNo, stageCode: `BE06-S${stageNo}-${suffix}`, stageType: 'NORMAL',
      status: 'PUBLISHED', title: `Stage ${stageNo}`, maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2,
      rewardTotalExp: 0, rewardEconomyExp: 0, rewardCoin: 0,
    });
    const attempt = await save(E.LearningAttempt, {
      userId: user.id, stageId: stage.stageId, attemptNo: 1, attemptType: 'PLAY', mode: 'START',
      initialHp: 2, requiredCorrectCount: 2, maxQuestionCount: 3, submittedCount: 1, correctCount: Number(isCorrect),
    });
    const choice = choices[isCorrect ? 0 : 1];
    const submission = await save(E.QuestionSubmission, {
      submissionId: randomUUID(), attemptId: attempt.attemptId, questionId: question.questionId,
      sequenceNo: 1, choiceId: choice.choiceId,
      selectedPosition: choice.baseOrder, displayedChoiceOrder: choices.map(row => row.choiceId), isCorrect,
      hpBefore: 2, hpAfter: isCorrect ? 1 : 2,
    });
    await db.query('UPDATE learning.question_submissions SET submitted_at = $1 WHERE submission_id = $2', [studiedAt, submission.submissionId]);
    await save(E.UserStageProgress, { userId: user.id, stageId: stage.stageId, progressStatus: 'IN_PROGRESS' });
    return { stageId: stage.stageId, attemptId: attempt.attemptId, submissionId: submission.submissionId, isCorrect, studiedAt };
  }
  owner.learning = await learn(owner, 1, true, '2026-11-20T01:00:00.000Z');
  other.learning = await learn(other, 2, false, '2026-11-20T02:00:00.000Z');
  owner.hypothesis = 'OWN_A';
  other.hypothesis = 'OWN_B';
  for (const [user, foreign] of [[owner, other], [other, owner]]) {
    await save(E.MisconceptionHypothesis, {
      userId: user.id, conceptCode, hypothesisType: user.hypothesis, source: 'RULE',
      evidenceSubmissionIds: [user.learning.submissionId, foreign.learning.submissionId],
    });
  }

  async function request(path, user, body) {
    const headers = user ? { Authorization: `Bearer ${user.token}` } : {};
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(baseUrl + path, {
      method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  for (const user of [owner, other, empty]) {
    const created = await request('/conversations', user, { entryPoint: 'CONCEPT' });
    assert.equal(created.status, 201);
    user.room = created.body.data.conversationId;
  }
  const ask = (user, text, extra = {}) => request('/messages', user, {
    conversationId: user.room, question: text, clientMessageId: text, ...extra,
  });
  const requests = db.getRepository(E.AiRequest);
  const messages = db.getRepository(E.AiMessage);
  const observedWrites = async () => ({
    calls: received.length,
    requests: await requests.countBy({ userId: In([owner.id, other.id]) }),
    messages: await messages.countBy({ conversationId: In([owner.room, other.room]) }),
  });

  await t.test('only the signed-in learner data and own conversation history reach FastAPI', async () => {
    for (const [user, foreign] of [[other, owner], [owner, other]]) {
      const { attemptId, stageId, submissionId, isCorrect, studiedAt } = user.learning;
      const result = await ask(user, `${user.hypothesis}-question`, { context: { conceptCode, attemptId } });
      assert.equal(result.status, 201);
      assert.equal(result.body.data.assistantMessage.status, 'COMPLETED');
      const sent = received.at(-1);
      assert.equal(sent.userId, user.id);
      assert.equal(sent.conversationId, user.room);
      assert.deepEqual(sent.context, { conceptCode, attemptId });
      assert.deepEqual(sent.personalizedContext, {
        learnerProfile: { currentStageId: stageId, conceptCode, accuracyRate: Number(isCorrect),
          recentIncorrectCount: Number(!isCorrect), lastStudiedAt: studiedAt },
        misconceptionHypotheses: [{ conceptCode, hypothesisType: user.hypothesis, status: 'UNCONFIRMED', evidenceIds: [submissionId] }],
        diagnosisEvidence: [{ evidenceId: submissionId, evidenceType: 'QUESTION_SUBMISSION', questionId: question.questionId }],
        recentAssessments: [{ assessmentId: submissionId, questionId: question.questionId, conceptCode, isCorrect, assessedAt: studiedAt }],
      });
      const sentBody = JSON.stringify(sent);
      for (const privateValue of [foreign.id, foreign.room, foreign.learning.attemptId, foreign.hypothesis, ...documentIds]) {
        assert.equal(sentBody.includes(privateValue), false);
      }
    }
    const followUp = await ask(owner, 'follow-up', { context: { conceptCode } });
    assert.equal(followUp.status, 201);
    const history = received.at(-1).history;
    assert.deepEqual(history.map(({ role, content }) => [role, content]),
      [['USER', 'OWN_A-question'], ['ASSISTANT', 'mock: OWN_A-question']]);
    const stored = await request(`/conversations/${owner.room}/messages`, owner);
    assert.equal(stored.status, 200);
    assert.deepEqual(stored.body.data.items.map(row => row.content),
      ['OWN_A-question', 'mock: OWN_A-question', 'follow-up', 'mock: follow-up']);
  });

  await t.test('foreign rooms and attempts are rejected before any AI request or reservation', async () => {
    const before = await observedWrites();
    assert.equal((await request('/conversations', null)).status, 401);
    const list = await request('/conversations', owner);
    assert.deepEqual(list.body.data.items.map(room => room.conversationId), [owner.room]);
    const foreignRoom = await request(`/conversations/${other.room}/messages`, owner);
    const missingRoom = await request(`/conversations/${randomUUID()}/messages`, owner);
    assert.equal(foreignRoom.status, 404);
    assert.deepEqual(foreignRoom, missingRoom);
    assert.equal((await ask(owner, 'foreign-room', { conversationId: other.room })).status, 404);
    const foreignAttempt = await ask(owner, 'foreign-attempt', { context: { conceptCode, attemptId: other.learning.attemptId } });
    assert.equal(foreignAttempt.status, 404);
    assert.deepEqual(foreignAttempt, await ask(owner, 'missing-attempt', { context: { conceptCode, attemptId: randomUUID() } }));
    assert.deepEqual(await observedWrites(), before);
  });

  await t.test('invalid UUID and unknown concept code fail at the public boundary', async () => {
    const before = await observedWrites();
    const invalid = await ask(owner, 'invalid-uuid', { context: { attemptId: 'invalid' } });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.code, 'VALIDATION_ERROR');
    const unknownCode = `BE06-unknown-${suffix}`;
    const unknown = await ask(owner, 'unknown-code', { context: { conceptCode: unknownCode } });
    assert.equal(unknown.status, 422);
    assert.deepEqual(unknown.body.details.unknownConceptCodes, [unknownCode]);
    assert.deepEqual(await observedWrites(), before);
  });

  await t.test('a learner without records can use the original request shape', async () => {
    const before = received.length;
    for (const [text, extra] of [
      ['empty-omitted', { clientMessageId: undefined }],
      ['empty-null', { context: null, knowledgeScope: null }],
      ['empty-known', { context: { conceptCode } }],
    ]) {
      assert.equal((await ask(empty, text, extra)).status, 201);
      const sent = received.at(-1);
      assert.equal(sent.question, text);
      assert.deepEqual(sent.context, extra.context ?? null);
      assert.equal(sent.knowledgeScope, null);
      assert.equal(Object.hasOwn(sent, 'personalizedContext'), false);
    }
    assert.equal(received.length, before + 3);
  });

  await t.test('required FastAPI failures return 503 and persist failed rows without charging quota', async () => {
    const before = (await request('/usage', owner)).body.data;
    for (const [text, apiMessage] of [
      ['upstream-422', 'AI 서버 요청에 실패했습니다.'],
      ['upstream-timeout', '튜터가 바쁩니다.'],
      ['upstream-invalid', 'AI 서버 응답 형식이 올바르지 않습니다.'],
    ]) {
      const result = await ask(owner, text);
      assert.equal(result.status, 503);
      assert.equal(received.at(-1).question, text);
      const { requestId } = received.at(-1);
      assert.equal(result.body.code, 'SERVICE_UNAVAILABLE');
      assert.equal(result.body.message, apiMessage);
      assert.equal((await requests.findOneByOrFail({ requestId })).status, 'FAILED');
      const failed = await messages.findBy({ requestId });
      assert.deepEqual(failed.map(row => row.status), ['FAILED', 'FAILED']);
      assert.equal(failed.find(row => row.role === 'ASSISTANT').content, '');
    }
    assert.deepEqual((await request('/usage', owner)).body.data, before);
    assert.equal((await ask(owner, 'after-upstream-failure')).status, 201);
    assert.equal(received.at(-1).history.some(row => row.content.startsWith('upstream-')), false);
  });
});
