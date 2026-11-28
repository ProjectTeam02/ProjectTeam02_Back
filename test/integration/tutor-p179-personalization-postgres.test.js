/**
 * #179 Verified Context·취약도·개인화 조회 — 실제 PostgreSQL + Express
 * 확인: verifiedContext SQL이 실제 스키마(license_review_status 컬럼·relation_review_status enum)에서 동작,
 *       출처/라이선스 미승인 → BLOCKED, 미승인 선수 관계는 제외(개념은 VERIFIED),
 *       GET /api/v1/tutor/personalization 인증 필수·본인 데이터만·userId 지정 불가,
 *       복습 제출이 재평가로 집계되고 재평가 후보는 본인이 풀지 않은 공개 문항만
 * 문서 적재는 ai 스키마 소유자(ai_user)로 한다 (app_user는 SELECT만 가능).
 */
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const test = require('node:test');
const listenTestServer = require('../helpers/listen-test-server');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('#179 verified context and personalization against PostgreSQL', { skip: !config, timeout: 120000 }, async t => {
  const options = JSON.parse(config);
  const E = require('@leren/database');
  const { Client } = require('pg');
  const db = E.AppDataSource;
  const env = require('../../src/config/env');
  const { issueAccessToken } = require('../../src/common/utils/token.util');
  const previousDb = { ...db.options };
  const previousEnv = { ...env };
  const servers = [];
  const ai = new Client({ host: '127.0.0.1', port: options.port, database: options.database || 'leren_it',
    user: options.aiUsername || 'ai_user', password: options.aiPassword || 'ai_local' });
  t.after(async () => {
    for (const server of servers.reverse()) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await ai.end().catch(() => {});
    if (db.isInitialized) await db.destroy();
    db.setOptions(previousDb);
    Object.assign(env, previousEnv);
  });
  db.setOptions({ host: '127.0.0.1', port: options.port, database: options.database || 'leren_it',
    username: options.username || 'app_user', password: options.password || 'app_local',
    ssl: false, synchronize: false, migrationsRun: false, logging: false });
  await db.initialize();
  await ai.connect();
  Object.assign(env, { jwtAccessSecret: randomBytes(32).toString('hex') });

  const { verifiedContext } = require('../../src/modules/tutor/verified-context.repository');
  const tutorService = require('../../src/modules/tutor/tutor.service');
  const suffix = randomUUID().slice(0, 8);
  const save = (entity, row) => db.getRepository(entity).save(row);
  const makeUser = async label => {
    const user = await save(E.User, { nickname: `P179-${label}-${suffix}` });
    const session = await save(E.UserSession, { userId: user.userId, loginMethod: 'EMAIL',
      expiresAt: new Date(Date.now() + 3600000), refreshTokenHash: randomBytes(32).toString('hex') });
    return { id: user.userId, token: issueAccessToken(user, session.sessionId) };
  };
  const [owner, other, reviewer] = await Promise.all(['owner', 'other', 'reviewer'].map(makeUser));

  const doc = async (documentId, reviewStatus, licenseReviewStatus) => ai.query(`
    INSERT INTO ai.rag_documents (document_id, source_id, title, source, version, review_status, license_review_status, content_hash, metadata_json)
    VALUES ($1, $1, $2, 'test', 'v1', $3, $4, $5, $6)`, [documentId, `문서 ${documentId}`, reviewStatus, licenseReviewStatus,
    createHash('sha256').update(documentId).digest('hex'), JSON.stringify({ license_review_status: 'approved' })]);
  const docs = { ok: `p179-ok-${suffix}`, pendingLicense: `p179-lic-${suffix}`, pendingReview: `p179-rev-${suffix}` };
  await doc(docs.ok, 'approved', 'APPROVED');
  await doc(docs.pendingLicense, 'approved', 'PENDING'); // metadata_json에 approved가 있어도 컬럼이 기준
  await doc(docs.pendingReview, 'PENDING', 'APPROVED');

  const topic = await save(E.Topic, { topicCode: `P179-${suffix}`, topicNo: 32700 + parseInt(suffix, 16) % 60, status: 'PUBLISHED', title: 'P179' });
  const code = name => `P179${name}-${suffix}`;
  const reviewed = { reviewedBy: reviewer.id, reviewedAt: new Date() };
  const concept = (name, sourceDocumentIds, extra = reviewed) => save(E.Concept, { topicId: topic.topicId, conceptCode: code(name), status: 'PUBLISHED',
    title: `개념 ${name}`, sourceDocumentIds, ...extra });
  const A = await concept('A', [docs.ok]);
  await concept('L', [docs.pendingLicense]);
  await concept('R', [docs.pendingReview]);
  await concept('H', [docs.ok], {});            // 검수 기록 없음
  await concept('P', [docs.ok]);
  await concept('Q', [docs.ok]);
  await save(E.ConceptPrerequisite, { conceptCode: code('A'), prerequisiteConceptCode: code('P'), displayOrder: 1, reviewStatus: 'APPROVED', ...reviewed });
  await save(E.ConceptPrerequisite, { conceptCode: code('A'), prerequisiteConceptCode: code('Q'), displayOrder: 2, reviewStatus: 'PENDING', reviewedAt: null });

  await t.test('verifiedContext: 승인 출처·라이선스만 VERIFIED, 미승인 선수 관계는 제외', async () => {
    const ok = await verifiedContext(db.manager, { conceptCode: code('A') });
    assert.equal(ok.verificationStatus, 'VERIFIED');
    assert.deepEqual(ok.sourceDocumentIds, [docs.ok]);
    assert.equal(ok.sources[0].licenseReviewStatus, 'APPROVED');
    assert.deepEqual(ok.prerequisiteConcepts.map(n => n.conceptCode), [code('P')]);
    assert.deepEqual(ok.blockingReasons, []);
    const byId = await verifiedContext(db.manager, { conceptId: A.conceptId });
    assert.equal(byId.conceptCode, code('A'));

    const license = await verifiedContext(db.manager, { conceptCode: code('L') });
    assert.equal(license.verificationStatus, 'BLOCKED');
    assert.ok(license.blockingReasons.includes(`LICENSE_REVIEW_NOT_APPROVED:${docs.pendingLicense}`));
    assert.deepEqual(license.sourceDocumentIds, []);
    const review = await verifiedContext(db.manager, { conceptCode: code('R') });
    assert.ok(review.blockingReasons.includes(`SOURCE_REVIEW_NOT_APPROVED:${docs.pendingReview}`));
    assert.deepEqual((await verifiedContext(db.manager, { conceptCode: code('H') })).blockingReasons, ['CONCEPT_REVIEW_HISTORY_MISSING']);
    assert.deepEqual((await verifiedContext(db.manager, { conceptCode: `none-${suffix}` })).blockingReasons, ['CONCEPT_NOT_PUBLISHED']);
  });

  // 학습 기록: owner는 A 2문항 중 1문항 오답 + 복습 오답 1건, other는 전부 정답
  const questions = [];
  for (let i = 0; i < 3; i += 1) {
    const q = await save(E.Question, { conceptId: A.conceptId, questionCode: `P179-Q${i}-${suffix}`, status: 'PUBLISHED',
      generatedBy: 'MANUAL', questionText: `문항 ${i}`, explanation: '해설' });
    q.choices = await save(E.QuestionChoice, [1, 2].map(baseOrder => ({ questionId: q.questionId, baseOrder, choiceText: `보기 ${baseOrder}`, isCorrect: baseOrder === 1 })));
    questions.push(q);
  }
  const stage = await save(E.Stage, { topicId: topic.topicId, stageNo: 1, stageCode: `P179-S-${suffix}`, stageType: 'NORMAL', status: 'PUBLISHED',
    title: 'Stage', maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2, rewardTotalExp: 0, rewardEconomyExp: 0, rewardCoin: 0 });
  const attemptNo = {};
  async function submit(user, q, correct, at) {
    attemptNo[user.id] = (attemptNo[user.id] || 0) + 1;
    const attempt = await save(E.LearningAttempt, { userId: user.id, stageId: stage.stageId, attemptNo: attemptNo[user.id], attemptType: 'PLAY', mode: 'START',
      status: 'PASSED', endReason: 'MONSTER_DEFEATED', finalHp: 0, endedAt: at, initialHp: 2, requiredCorrectCount: 2, maxQuestionCount: 3, submittedCount: 1, correctCount: Number(correct) });
    const choice = q.choices[correct ? 0 : 1];
    const row = await save(E.QuestionSubmission, { submissionId: randomUUID(), attemptId: attempt.attemptId, questionId: q.questionId, sequenceNo: 1,
      choiceId: choice.choiceId, selectedPosition: choice.baseOrder, displayedChoiceOrder: q.choices.map(c => c.choiceId), isCorrect: correct, hpBefore: 2, hpAfter: 1 });
    await db.query('UPDATE learning.question_submissions SET submitted_at = $1 WHERE submission_id = $2', [at, row.submissionId]);
  }
  const now = Date.now();
  await submit(owner, questions[0], true, new Date(now - 3600000));
  await submit(owner, questions[1], false, new Date(now - 3000000));
  await submit(other, questions[0], true, new Date(now - 3600000));
  await submit(other, questions[1], true, new Date(now - 3000000));
  // 복습(재평가) 제출 1건 (오답) — 본인 것만
  const q1 = questions[1];
  const item = await save(E.ReviewItem, { userId: owner.id, questionCode: q1.questionCode, latestQuestionId: q1.questionId,
    conceptCode: code('A'), firstReason: 'WRONG', wrongCount: 1, isBookmarked: false });
  const reviewAt = new Date(now - 600000);
  const reviewAttempt = await save(E.ReviewAttempt, { userId: owner.id, reviewType: 'RECOMMENDED', entryPoint: 'REVIEW_NOTE', conceptCode: code('A'),
    status: 'COMPLETED', questionCount: 1, submittedCount: 1, correctCount: 0, completedAt: reviewAt });
  await save(E.ReviewSubmission, { reviewAttemptId: reviewAttempt.reviewAttemptId, reviewItemId: item.reviewItemId, questionId: q1.questionId,
    sequenceNo: 1, displayedChoiceOrder: q1.choices.map(c => c.choiceId), choiceId: q1.choices[1].choiceId, isCorrect: false, submittedAt: reviewAt });

  const app = require('../../src/app');
  const backend = await listenTestServer(app);
  servers.push(backend);
  const baseUrl = `http://127.0.0.1:${backend.address().port}/api/v1/tutor`;
  const get = async (path, user) => {
    const response = await fetch(baseUrl + path, { headers: user ? { Authorization: `Bearer ${user.token}` } : {} });
    return { status: response.status, body: await response.json() };
  };

  await t.test('GET /tutor/personalization: 인증 필수, userId 지정 불가, 본인 기록만', async () => {
    assert.equal((await get(`/personalization?conceptCode=${code('A')}`)).status, 401);
    assert.equal((await get(`/personalization?conceptCode=${code('A')}&userId=${other.id}`, owner)).status, 422);

    const mine = (await get(`/personalization?conceptCode=${code('A')}`, owner)).body.data;
    const theirs = (await get(`/personalization?conceptCode=${code('A')}`, other)).body.data;
    const lp = mine.personalizedContext.learnerProfile;
    assert.equal(lp.conceptCode, code('A'));
    assert.equal(lp.weaknessComponents.errorRate, 0.6667); // 학습 2건 중 1 오답 + 복습 1 오답 = 2/3
    assert.equal(theirs.personalizedContext.learnerProfile.weaknessComponents.errorRate, 0);
    assert.ok(lp.weaknessScore > theirs.personalizedContext.learnerProfile.weaknessScore);
    assert.equal(lp.weaknessComponents.reassessmentFailure, 1);
    assert.equal(JSON.stringify(mine).includes(other.id), false);
    // 재평가 후보: 공개 문항 중 본인이 아직 풀지 않은 것만 (questions[2])
    assert.deepEqual(mine.reassessmentQuestions.map(q => q.questionId), [questions[2].questionId]);
    assert.equal(mine.recommendation.conceptCode, code('A'));
    assert.equal(mine.recommendation.action, 'REASSESS_APPROVED_QUESTIONS');
  });

  await t.test('플래그를 켜면 튜터 요청에 verifiedContext가 실리고, 끄면 빠진다', async () => {
    const sent = [];
    const aiClient = { answer: async body => { sent.push(body); return {
      requestId: body.requestId, answer: 'ok', groundingStatus: 'INSUFFICIENT', sources: [],
      usage: { latencyMs: 1, cacheHit: false, retrievalStrategy: 'mock' } }; } };
    for (const [enabled, concept] of [[true, code('A')], [true, code('L')], [false, code('A')]]) {
      const service = tutorService(db, aiClient, { personalizationEnabled: true, verifiedContextEnabled: enabled });
      const conversation = await service.createConversation(owner.id, { entryPoint: 'CONCEPT' });
      await service.sendMessage(owner.id, { conversationId: conversation.conversationId, question: `q-${enabled}-${concept}`, modelTier: 'BASIC',
        clientMessageId: `p179-${enabled}-${concept}`, context: { conceptCode: concept }, knowledgeScope: null }, null);
    }
    assert.equal(sent[0].verifiedContext.verificationStatus, 'VERIFIED');
    assert.equal(sent[1].verifiedContext.verificationStatus, 'BLOCKED');
    assert.equal('verifiedContext' in sent[2], false);
    assert.equal(sent[0].userId, owner.id);
  });
});
