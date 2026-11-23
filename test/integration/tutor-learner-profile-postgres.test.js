/**
 * BE-04 학습자 프로필(learnerProfile) 집계 — 실제 PostgreSQL
 * 확인: 개념별 정답률·최근 10개 중 오답 수·마지막 학습 시각·현재 Stage, 개념 버전 무관 집계, 다른 사용자 기록 격리,
 *       기록이 없으면 null, 튜터 서비스가 AI 서버로 personalizedContext.learnerProfile을 보내는지
 */
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const test = require('node:test');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('tutor learner profile against isolated PostgreSQL', { skip: !config, timeout: 120000 }, async t => {
  const options = JSON.parse(config);
  const E = require('@leren/database');
  const db = E.AppDataSource;
  const previous = { ...db.options };
  t.after(async () => {
    if (db.isInitialized) await db.destroy();
    db.setOptions(previous);
  });
  db.setOptions({ host: '127.0.0.1', port: options.port, database: options.database || 'leren_it',
    username: options.username || 'app_user', password: options.password || 'app_local',
    ssl: false, synchronize: false, migrationsRun: false, logging: false });
  await db.initialize();

  const { buildLearnerProfile, RECENT_WINDOW } = require('../../src/modules/tutor/personalization/learnerProfile');
  const tutorService = require('../../src/modules/tutor/tutor.service');
  const suffix = randomBytes(4).toString('hex');
  const save = (classType, row) => db.getRepository(classType).save(row);

  const owner = await save(E.User, { nickname: `프로필-${suffix}` });
  const other = await save(E.User, { nickname: `다른사람-${suffix}` });
  const empty = await save(E.User, { nickname: `기록없음-${suffix}` });
  const topic = await save(E.Topic, { topicCode: `LP-${suffix}`, topicNo: 24000 + (parseInt(suffix.slice(0, 4), 16) % 4000), status: 'PUBLISHED', title: '프로필' });
  const stage = await save(E.Stage, { topicId: topic.topicId, stageCode: `LP-S-${suffix}`, stageNo: 1, stageType: 'NORMAL', status: 'PUBLISHED',
    title: '물가', maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2, rewardTotalExp: 0, rewardEconomyExp: 0, rewardCoin: 0 });

  const codeX = `LPX-${suffix}`;
  const codeY = `LPY-${suffix}`;
  const xV1 = await save(E.Concept, { topicId: topic.topicId, conceptCode: codeX, version: 1, title: '물가상승률', status: 'PUBLISHED' });
  const xV2 = await save(E.Concept, { topicId: topic.topicId, conceptCode: codeX, version: 2, title: '물가상승률 v2', status: 'PUBLISHED', supersedesConceptId: xV1.conceptId });
  const y = await save(E.Concept, { topicId: topic.topicId, conceptCode: codeY, title: '구매력', status: 'PUBLISHED' });

  async function question(concept, n) {
    const q = await save(E.Question, { conceptId: concept.conceptId, questionCode: `LP-Q-${n}-${suffix}`, status: 'PUBLISHED',
      generatedBy: 'MANUAL', questionText: `${concept.title} 문항`, explanation: '해설' });
    const choices = await save(E.QuestionChoice, [1, 2].map(baseOrder => ({ questionId: q.questionId, baseOrder, choiceText: `보기 ${baseOrder}`, isCorrect: baseOrder === 1 })));
    return { ...q, choices };
  }
  const qV1 = await question(xV1, 1);
  const qV2 = await question(xV2, 2);

  let attemptNo = { [owner.userId]: 0, [other.userId]: 0 };
  async function submit(user, q, correct, at) {
    attemptNo[user.userId] += 1;
    const attempt = await save(E.LearningAttempt, { userId: user.userId, stageId: stage.stageId, attemptNo: attemptNo[user.userId], attemptType: 'PLAY',
      mode: 'START', status: 'PASSED', endReason: 'MONSTER_DEFEATED', initialHp: 2, finalHp: 0, requiredCorrectCount: 2, maxQuestionCount: 3,
      submittedCount: 1, correctCount: correct ? 1 : 0, endedAt: at });
    const choice = q.choices[correct ? 0 : 1];
    const row = await save(E.QuestionSubmission, { submissionId: randomUUID(), attemptId: attempt.attemptId, questionId: q.questionId, sequenceNo: 1,
      choiceId: choice.choiceId, selectedPosition: choice.baseOrder, displayedChoiceOrder: q.choices.map(c => c.choiceId), isCorrect: correct, hpBefore: 2, hpAfter: 1 });
    await db.query('UPDATE learning.question_submissions SET submitted_at = $1 WHERE submission_id = $2', [at, row.submissionId]);
  }

  // owner: 개념 X에 12번 제출 (오래된 순 오답 3 → 정답 9), v1·v2 문항을 번갈아 → 정답률 9/12, 최근 10개 중 오답 1
  const base = Date.parse('2026-11-01T00:00:00Z');
  for (let i = 0; i < 12; i += 1) await submit(owner, i % 2 ? qV2 : qV1, i >= 3, new Date(base + i * 3600000));
  // other: 같은 개념 X에 오답 5개 (owner 집계에 섞이면 안 됨)
  for (let i = 0; i < 5; i += 1) await submit(other, qV1, false, new Date(base + (20 + i) * 3600000));
  await save(E.UserStageProgress, { userId: owner.userId, stageId: stage.stageId, progressStatus: 'IN_PROGRESS', startedAt: new Date(base) });
  const lastAt = new Date(base + 11 * 3600000).toISOString();

  await t.test('개념 코드 기준: 정답률·최근 오답·마지막 학습 시각·현재 Stage', async () => {
    assert.equal(RECENT_WINDOW, 10);
    const profile = await buildLearnerProfile(db.manager, owner.userId, { context: { conceptCode: codeX } });
    assert.deepEqual({ ...profile, lastStudiedAt: new Date(profile.lastStudiedAt).toISOString() },
      { currentStageId: stage.stageId, conceptCode: codeX, accuracyRate: 0.75, recentIncorrectCount: 1, lastStudiedAt: lastAt });
  });

  await t.test('conceptId(다른 버전)·knowledgeScope 1개로도 같은 개념으로 집계', async () => {
    const byId = await buildLearnerProfile(db.manager, owner.userId, { context: { conceptId: xV2.conceptId } });
    const byScope = await buildLearnerProfile(db.manager, owner.userId, { knowledgeScope: { conceptCodes: [codeX] } });
    assert.equal(byId.accuracyRate, 0.75);
    assert.equal(byScope.accuracyRate, 0.75);
  });

  await t.test('대상 개념이 없거나 기록이 없으면 개념 통계를 만들지 않는다', async () => {
    const many = await buildLearnerProfile(db.manager, owner.userId, { knowledgeScope: { conceptCodes: [codeX, codeY] } });
    assert.equal('conceptCode' in many, false);
    assert.equal('accuracyRate' in many, false);
    assert.equal(new Date(many.lastStudiedAt).toISOString(), lastAt); // 전체 마지막 제출
    const unseen = await buildLearnerProfile(db.manager, owner.userId, { context: { conceptCode: codeY } });
    assert.deepEqual(unseen, { currentStageId: stage.stageId, conceptCode: codeY });
    assert.equal(await buildLearnerProfile(db.manager, empty.userId, { context: { conceptCode: codeX } }), null);
  });

  await t.test('다른 사용자 기록은 섞이지 않는다', async () => {
    const mine = await buildLearnerProfile(db.manager, other.userId, { context: { conceptCode: codeX } });
    assert.equal(mine.accuracyRate, 0);
    assert.equal(mine.recentIncorrectCount, 5);
    assert.equal('currentStageId' in mine, false);
  });

  await t.test('튜터 서비스가 learnerProfile을 AI 서버로 보낸다 (TUTOR_PERSONALIZATION_ENABLED 켬)', async () => {
    let sent;
    const aiClient = { answer: async body => { sent = body; return {
      requestId: body.requestId, answer: '물가상승률은 …', groundingStatus: 'GROUNDED', sources: [],
      usage: { modelId: 'm', embeddingModelId: 'e', inputTokens: 1, outputTokens: 1, latencyMs: 1, cacheHit: false, retrievalStrategy: 'hybrid', estimatedCost: 0, currency: 'USD' },
    }; } };
    const service = tutorService(db, aiClient, { personalizationEnabled: true });
    const conversation = await service.createConversation(owner.userId, { entryPoint: 'CONCEPT' });
    const result = await service.sendMessage(owner.userId, { conversationId: conversation.conversationId, question: '물가상승률이 뭐야?', modelTier: 'BASIC',
      clientMessageId: `lp-${suffix}`, context: { conceptCode: codeX }, knowledgeScope: null }, null);
    assert.equal(result.assistantMessage.status, 'COMPLETED');
    assert.deepEqual(sent.personalizedContext.learnerProfile, {
      conceptCode: codeX, accuracyRate: 0.75, recentIncorrectCount: 1, lastStudiedAt: lastAt, currentStageId: stage.stageId });

    const off = tutorService(db, aiClient, { personalizationEnabled: false });
    await off.sendMessage(owner.userId, { conversationId: conversation.conversationId, question: '구매력은?', modelTier: 'BASIC',
      clientMessageId: `lp-off-${suffix}`, context: { conceptCode: codeY }, knowledgeScope: null }, null);
    assert.equal('personalizedContext' in sent, false);
  });
});
