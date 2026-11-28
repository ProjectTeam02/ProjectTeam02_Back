const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const express = require('express');
const test = require('node:test');
const listen = require('../helpers/listen-test-server');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('Tutor metadata over Express, PostgreSQL and mock FastAPI', { skip: !config, timeout: 120000 }, async t => {
  const E = require('@leren/database');
  const db = E.AppDataSource;
  const env = require('../../src/config/env');
  const { issueAccessToken } = require('../../src/common/utils/token.util');
  const options = JSON.parse(config);
  const oldOptions = { ...db.options };
  const oldEnv = { ...env };
  const servers = [];
  t.after(async () => {
    for (const server of servers.reverse()) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    if (db.isInitialized) await db.destroy();
    db.setOptions(oldOptions);
    Object.assign(env, oldEnv);
  });
  db.setOptions({ host: '127.0.0.1', port: options.port, database: options.database || 'leren_it',
    username: options.username || 'app_user', password: options.password || 'app_local',
    ssl: false, synchronize: false, migrationsRun: false, logging: false });
  await db.initialize();

  const suffix = randomUUID().slice(0, 8);
  const save = (entity, row) => db.getRepository(entity).save(row);
  async function learner(label) {
    const user = await save(E.User, { nickname: `TM-${label}-${suffix}` });
    const session = await save(E.UserSession, { userId: user.userId, loginMethod: 'EMAIL',
      expiresAt: new Date(Date.now() + 3600000), refreshTokenHash: randomBytes(32).toString('hex') });
    return { userId: user.userId, sessionId: session.sessionId, user };
  }
  const [owner, outsider] = await Promise.all([learner('own'), learner('other')]);
  const topic = await save(E.Topic, { topicCode: `TM-${suffix}`, topicNo: 10000 + parseInt(suffix, 16) % 17000, title: 'Topic', status: 'PUBLISHED' });
  const makeConcept = label => save(E.Concept, { topicId: topic.topicId, conceptCode: `TM-${label}-${suffix}`, title: label, status: 'PUBLISHED' });
  const [concept, otherConcept] = await Promise.all([makeConcept('same'), makeConcept('other')]);
  const stage = await save(E.Stage, { topicId: topic.topicId, stageNo: 1, stageCode: `TM-S-${suffix}`, stageType: 'NORMAL',
    status: 'PUBLISHED', title: 'Stage', maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2,
    rewardTotalExp: 0, rewardEconomyExp: 0, rewardCoin: 0 });
  async function makeQuestion(label) {
    const question = await save(E.Question, { conceptId: concept.conceptId, questionCode: `TM-${label}-${suffix}`,
      status: 'PUBLISHED', generatedBy: 'MANUAL', questionText: label, explanation: `explanation-${label}-${suffix}` });
    const choices = await save(E.QuestionChoice, [1, 2, 3, 4].map(baseOrder => ({
      questionId: question.questionId, baseOrder, choiceText: `choice-${baseOrder}-${suffix}`, isCorrect: baseOrder === 1 })));
    return { question, choices };
  }
  const [prior, current, foreign] = await Promise.all(['prior', 'current', 'foreign'].map(makeQuestion));
  await save(E.StageQuestion, [prior, current, foreign].map(({ question }, index) => ({ stageId: stage.stageId, questionId: question.questionId, questionOrder: index + 1 })));
  async function attemptWithWrongAnswer(learner, item) {
    const attempt = await save(E.LearningAttempt, { userId: learner.userId, stageId: stage.stageId, attemptNo: 1,
      attemptType: 'PLAY', mode: 'START', initialHp: 2, requiredCorrectCount: 2, maxQuestionCount: 3, submittedCount: 1, correctCount: 0 });
    const submission = await save(E.QuestionSubmission, { submissionId: randomUUID(), attemptId: attempt.attemptId,
      questionId: item.question.questionId, sequenceNo: 1, choiceId: item.choices[1].choiceId, isCorrect: false,
      selectedPosition: 2, displayedChoiceOrder: item.choices.map(choice => choice.choiceId), hpBefore: 2, hpAfter: 2 });
    return { attemptId: attempt.attemptId, submissionId: submission.submissionId };
  }
  const own = await attemptWithWrongAnswer(owner, prior);
  const other = await attemptWithWrongAnswer(outsider, foreign);
  await save(E.MisconceptionHypothesis, { userId: owner.userId, conceptCode: concept.conceptCode,
    hypothesisType: 'CAUSAL_ERROR', source: 'RULE', evidenceSubmissionIds: [own.submissionId, other.submissionId, own.submissionId] });

  const requested = [];
  let reply = () => ({});
  const mock = express();
  mock.use(express.json());
  mock.post('/internal/v1/tutor/answer', async (req, res, next) => {
    try {
      requested.push(req.body);
      res.json({ requestId: req.body.requestId, answer: 'Safe mock explanation', groundingStatus: 'INSUFFICIENT', sources: [],
        usage: { latencyMs: 2, cacheHit: false, retrievalStrategy: 'mock' }, ...await reply(req.body) });
    } catch (error) { next(error); }
  });
  const mockServer = await listen(mock);
  servers.push(mockServer);
  Object.assign(env, { fastapiBaseUrl: `http://127.0.0.1:${mockServer.address().port}`, fastapiInternalToken: null,
    tutorPersonalizationEnabled: true, tutorMetadataEnabled: true, jwtAccessSecret: randomBytes(32).toString('hex'), aiDailyLimit: 80 });
  const token = issueAccessToken(owner.user, owner.sessionId);
  const server = await listen(require('../../src/app'));
  servers.push(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/tutor`;
  async function http(path, body) {
    const res = await fetch(baseUrl + path, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, ...(await res.json()) };
  }
  const { data: room } = await http('/conversations', { entryPoint: 'QUIZ' });
  const context = { stageId: stage.stageId, attemptId: own.attemptId, questionId: current.question.questionId, conceptCode: concept.conceptCode };
  const ask = (key, customContext = context) => http('/messages', {
    conversationId: room.conversationId, question: key, clientMessageId: key, context: customContext });
  const diagnosis = { misconceptionType: 'UNCERTAIN', confidence: 0, evidenceQuestionIds: [prior.question.questionId], needsFollowup: true, reasoningSummary: 'Needs follow-up' };
  const tutoringMeta = { schemaVersion: '1.0', conceptCode: concept.conceptCode, diagnosis,
    strategy: { strategyId: 'DIAGNOSTIC_CHECK_V1', strategyVersion: '1.0' } };
  const action = { ...context, type: 'SOLVE_QUESTION', reason: 'Current question', priority: 'LOW' };

  await t.test('legacy and new assistant messages coexist; replay and history return the saved metadata', async () => {
    const legacy = await ask('legacy');
    assert.equal(legacy.status, 201);
    assert.equal(Object.hasOwn(legacy.data.assistantMessage, 'tutoringMeta'), false);
    reply = () => ({ tutoringMeta, proposedAction: action });
    const sent = await ask('new-metadata');
    assert.equal(sent.status, 201, JSON.stringify(sent));
    assert.deepEqual(requested.at(-1).eligibleQuestionCandidates, [context]);
    assert.deepEqual(requested.at(-1).personalizedContext.diagnosisEvidence, [{ evidenceId: own.submissionId,
      questionId: prior.question.questionId, evidenceType: 'QUESTION_SUBMISSION' }]);
    assert.equal(Object.hasOwn(requested.at(-1).personalizedContext.misconceptionHypotheses[0], 'observationCount'), false);
    assert.equal(JSON.stringify(requested.at(-1)).includes(other.submissionId), false);
    assert.deepEqual(sent.data.assistantMessage.tutoringMeta, tutoringMeta);
    assert.deepEqual(sent.data.assistantMessage.proposedAction, action);
    assert.equal(Object.hasOwn(sent.data.userMessage, 'tutoringMeta'), false);
    const stored = await db.getRepository(E.AiMessage).findOneByOrFail({ messageId: sent.data.assistantMessage.messageId });
    assert.deepEqual(stored.tutoringMeta, tutoringMeta);
    assert.deepEqual(stored.proposedAction, action);
    assert.equal((await db.getRepository(E.AiMessage).findOneByOrFail({ messageId: legacy.data.assistantMessage.messageId })).proposedAction, null);
    const calls = requested.length;
    const replay = await ask('new-metadata');
    assert.equal(replay.data.duplicate, true);
    assert.equal(replay.data.quota, null);
    assert.equal(requested.length, calls);
    assert.deepEqual(replay.data.assistantMessage, sent.data.assistantMessage);
    const messages = await http(`/conversations/${room.conversationId}/messages`);
    assert.deepEqual(messages.data.items.filter(row => row.role === 'ASSISTANT'), [legacy.data.assistantMessage, sent.data.assistantMessage]);
    const flagsOffService = require('../../src/modules/tutor/tutor.service')(db, { answer: async body => {
      assert.equal(Object.hasOwn(body, 'eligibleQuestionCandidates'), false);
      return { requestId: body.requestId, answer: 'Old backend path', groundingStatus: 'INSUFFICIENT',
        usage: { latencyMs: 1, cacheHit: false, retrievalStrategy: 'mock' }, tutoringMeta, proposedAction: action };
    } }, { metadataEnabled: false });
    const oldShape = await flagsOffService.sendMessage(owner.userId, { conversationId: room.conversationId,
      question: 'flag-off', modelTier: 'BASIC', context }, null);
    assert.equal(Object.hasOwn(oldShape.assistantMessage, 'tutoringMeta'), false);
    const flagOffHistory = await flagsOffService.messages(owner.userId, room.conversationId, { page: 1, pageSize: 10, skip: 0, take: 10 });
    assert.ok(flagOffHistory.items.every(row => !Object.hasOwn(row, 'tutoringMeta') && !Object.hasOwn(row, 'proposedAction')));
  });

  await t.test('mismatched contexts and non-public content do not produce candidates; historical questions still work', async () => {
    reply = () => ({});
    assert.equal((await ask('foreign', { ...context, attemptId: other.attemptId })).status, 404);
    for (const [label, unsafe] of [
      ['historical', { ...context, questionId: prior.question.questionId }],
      ['mismatched-stage', { ...context, stageId: randomUUID() }],
      ['mismatched-concept', { ...context, conceptCode: otherConcept.conceptCode }],
    ]) {
      assert.equal((await ask(label, unsafe)).status, 201);
      assert.deepEqual(requested.at(-1).eligibleQuestionCandidates, []);
    }
    assert.equal((await ask('future-slot', { ...context, questionId: foreign.question.questionId })).status, 404);
    for (const [label, entity, id, hiddenStatus] of [
      ['stage', E.Stage, stage.stageId, E.PublishStatus.Draft], ['topic', E.Topic, topic.topicId, E.PublishStatus.Draft],
      ['concept', E.Concept, concept.conceptId, E.ConceptStatus.Draft], ['question', E.Question, current.question.questionId, E.QuestionStatus.Retired],
    ]) {
      const repo = db.getRepository(entity);
      await repo.update(id, { status: hiddenStatus });
      try {
        assert.equal((await ask(`draft-${label}`, { attemptId: own.attemptId })).status, 201);
        assert.deepEqual(requested.at(-1).eligibleQuestionCandidates, []);
      } finally {
        await repo.update(id, { status: 'PUBLISHED' });
      }
    }
  });

  await t.test('invalid AI metadata or a changed attempt fails without saving an answer or charging usage', async () => {
    const before = (await http('/usage')).data;
    const abandon = require('../../src/modules/quizzes/attempt-abandon.service')(db);
    for (const [label, answer] of [
      ['question', () => ({ proposedAction: { ...action, questionId: foreign.question.questionId } })],
      ['stage', () => ({ proposedAction: { ...action, stageId: randomUUID() } })],
      ['attempt', () => ({ proposedAction: { ...action, attemptId: other.attemptId } })],
      ['concept', () => ({ proposedAction: { ...action, conceptCode: otherConcept.conceptCode } })],
      ['evidence', () => ({ tutoringMeta: { ...tutoringMeta, diagnosis: { ...diagnosis, evidenceQuestionIds: [foreign.question.questionId] } } })],
      ['confidence', () => ({ tutoringMeta: { ...tutoringMeta, diagnosis: { ...diagnosis, confidence: 0.8 } } })],
      ['changed-publication', async () => {
        await db.getRepository(E.Question).update(current.question.questionId, { status: E.QuestionStatus.Retired });
        return { proposedAction: action };
      }],
      ['changed-attempt', async () => {
        await abandon(owner.userId, own.attemptId);
        return { proposedAction: action };
      }],
    ]) {
      reply = answer;
      const result = await ask(`invalid-${label}`);
      assert.equal(result.status, 503, JSON.stringify(result));
      const { requestId } = requested.at(-1);
      assert.equal((await db.getRepository(E.AiRequest).findOneByOrFail({ requestId })).status, 'FAILED');
      const failed = await db.getRepository(E.AiMessage).findOneByOrFail({ requestId, role: 'ASSISTANT' });
      assert.deepEqual([failed.status, failed.content, failed.tutoringMeta, failed.proposedAction], ['FAILED', '', null, null]);
      if (label === 'changed-publication') {
        const questions = db.getRepository(E.Question);
        assert.equal((await questions.findOneByOrFail({ questionId: current.question.questionId })).status, E.QuestionStatus.Retired);
        await questions.update(current.question.questionId, { status: 'PUBLISHED' });
      }
    }
    assert.deepEqual((await http('/usage')).data, before);
    assert.equal((await db.getRepository(E.LearningAttempt).findOneByOrFail({ attemptId: own.attemptId })).status, 'ABANDONED');
    reply = () => ({});
    assert.equal((await ask('ended-with-history', { ...context, questionId: prior.question.questionId })).status, 201);
    assert.deepEqual(requested.at(-1).eligibleQuestionCandidates, []);
  });
});
