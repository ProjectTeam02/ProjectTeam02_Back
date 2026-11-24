/**
 * BE-05 선수 개념 관계·오개념 가설·진단 근거·최근 평가 — 실제 PostgreSQL
 * 확인: 승인(APPROVED)된 관계만, 깊이 2까지, 순환 차단, 공개되지 않은 개념 제외, 다음 개념(NEXT),
 *       REJECTED 가설 제외·상태 그대로 전달, 다른 사용자 가설·제출 기록 차단, 최근 평가 10개,
 *       튜터 서비스가 AI 계약에 맞는 personalizedContext 전체를 보내는지
 */
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const test = require('node:test');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('tutor concept graph and misconception context against isolated PostgreSQL', { skip: !config, timeout: 120000 }, async t => {
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

  const { conceptGraphContext, misconceptionContext, recentAssessments } = require('../../src/modules/tutor/personalization/conceptContext');
  const personalizedDto = require('../../src/modules/tutor/dto/aiPersonalizedContext.dto');
  const tutorService = require('../../src/modules/tutor/tutor.service');
  const suffix = randomBytes(4).toString('hex');
  const save = (classType, row) => db.getRepository(classType).save(row);
  const code = name => `${name}-${suffix}`;

  const owner = await save(E.User, { nickname: `개념맥락-${suffix}` });
  const other = await save(E.User, { nickname: `다른사람2-${suffix}` });
  const topic = await save(E.Topic, { topicCode: `CC-${suffix}`, topicNo: 28000 + (parseInt(suffix.slice(0, 4), 16) % 4000), status: 'PUBLISHED', title: '맥락' });
  const stage = await save(E.Stage, { topicId: topic.topicId, stageCode: `CC-S-${suffix}`, stageNo: 1, stageType: 'NORMAL', status: 'PUBLISHED',
    title: '금리', maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2, rewardTotalExp: 0, rewardEconomyExp: 0, rewardCoin: 0 });
  const concept = (name, title, status = 'PUBLISHED') => save(E.Concept, { topicId: topic.topicId, conceptCode: code(name), title, status });
  const A = await concept('A', '실질금리');
  await concept('B', '명목금리');
  await concept('C', '이자');
  await concept('D', '미승인 선수');
  await concept('F', '깊이3');
  await concept('N', '다음 개념');
  await concept('U', '비공개 개념', 'DRAFT');
  const edge = (from, to, status = 'APPROVED', displayOrder = 1) => save(E.ConceptPrerequisite, { conceptCode: code(from), prerequisiteConceptCode: code(to),
    displayOrder, reviewStatus: status, reviewedAt: status === 'PENDING' ? null : new Date() });
  await edge('A', 'B');                 // A ← B (깊이 1)
  await edge('B', 'C');                 // B ← C (깊이 2)
  await edge('C', 'F');                 // C ← F (깊이 3 → 제외)
  await edge('A', 'D', 'PENDING', 2);   // 미승인 → 제외
  await edge('A', 'U', 'APPROVED', 3);  // 비공개 개념 → 제외
  await edge('B', 'A');                 // 순환 (A ← B ← A)
  await edge('N', 'A');                 // 다음 개념 N (A를 선수로 둠)

  const q = await save(E.Question, { conceptId: A.conceptId, questionCode: `CC-Q-${suffix}`, status: 'PUBLISHED', generatedBy: 'MANUAL', questionText: '실질금리?', explanation: '해설' });
  const choices = await save(E.QuestionChoice, [1, 2].map(baseOrder => ({ questionId: q.questionId, baseOrder, choiceText: `보기 ${baseOrder}`, isCorrect: baseOrder === 1 })));
  const attemptNo = {};
  async function submit(user, correct, at) {
    attemptNo[user.userId] = (attemptNo[user.userId] || 0) + 1;
    const attempt = await save(E.LearningAttempt, { userId: user.userId, stageId: stage.stageId, attemptNo: attemptNo[user.userId], attemptType: 'PLAY',
      mode: 'START', status: 'PASSED', endReason: 'MONSTER_DEFEATED', initialHp: 2, finalHp: 0, requiredCorrectCount: 2, maxQuestionCount: 3,
      submittedCount: 1, correctCount: correct ? 1 : 0, endedAt: at });
    const choice = choices[correct ? 0 : 1];
    const row = await save(E.QuestionSubmission, { submissionId: randomUUID(), attemptId: attempt.attemptId, questionId: q.questionId, sequenceNo: 1,
      choiceId: choice.choiceId, selectedPosition: choice.baseOrder, displayedChoiceOrder: choices.map(c => c.choiceId), isCorrect: correct, hpBefore: 2, hpAfter: 1 });
    await db.query('UPDATE learning.question_submissions SET submitted_at = $1 WHERE submission_id = $2', [at, row.submissionId]);
    return row.submissionId;
  }
  const base = Date.parse('2026-11-10T00:00:00Z');
  const ownSubs = [];
  for (let i = 0; i < 12; i += 1) ownSubs.push(await submit(owner, i % 3 !== 0, new Date(base + i * 60000)));
  const otherSub = await submit(other, false, new Date(base + 99 * 60000));

  const hypothesis = row => save(E.MisconceptionHypothesis, { userId: owner.userId, source: 'RULE', ...row });
  await hypothesis({ conceptCode: code('A'), hypothesisType: 'NOMINAL_REAL_CONFUSION', evidenceSubmissionIds: [ownSubs[0], otherSub] });
  await hypothesis({ conceptCode: code('A'), hypothesisType: 'SIGN_REVERSED', status: 'CONFIRMED', resolvedAt: new Date(), evidenceSubmissionIds: [ownSubs[3], ownSubs[6]] });
  await hypothesis({ conceptCode: code('A'), hypothesisType: 'OLD_IDEA', status: 'REJECTED', resolvedAt: new Date() });
  await hypothesis({ conceptCode: code('B'), hypothesisType: 'OTHER_CONCEPT' });
  await save(E.MisconceptionHypothesis, { userId: other.userId, source: 'AI', conceptCode: code('A'), hypothesisType: 'OTHER_USER' });

  await t.test('선수 관계: 승인된 것만, 깊이 2까지, 순환·비공개 제외, 다음 개념은 NEXT', async () => {
    const graph = await conceptGraphContext(db.manager, code('A'));
    assert.equal(graph.currentConceptCode, code('A'));
    assert.deepEqual(graph.prerequisiteConcepts.map(n => [n.conceptCode, n.depth, n.relationshipType, n.relationReviewStatus, n.title]),
      [[code('B'), 1, 'PREREQUISITE', 'APPROVED', '명목금리'], [code('C'), 2, 'PREREQUISITE', 'APPROVED', '이자']]);
    assert.deepEqual(graph.relatedConcepts.map(n => [n.conceptCode, n.relationshipType]).sort(), [[code('B'), 'NEXT'], [code('N'), 'NEXT']]);
    assert.equal(await conceptGraphContext(db.manager, code('D')), null);   // 미승인 관계뿐인 개념
    assert.equal(await conceptGraphContext(db.manager, null), null);
  });

  await t.test('오개념 가설: REJECTED 제외, 상태 그대로, 대상 개념만, 근거는 본인 제출만', async () => {
    const { misconceptionHypotheses, diagnosisEvidence } = await misconceptionContext(db.manager, owner.userId, code('A'));
    const byType = Object.fromEntries(misconceptionHypotheses.map(h => [h.hypothesisType, h]));
    assert.deepEqual(Object.keys(byType).sort(), ['NOMINAL_REAL_CONFUSION', 'SIGN_REVERSED']);
    assert.equal(byType.NOMINAL_REAL_CONFUSION.status, 'UNCONFIRMED');
    assert.equal(byType.SIGN_REVERSED.status, 'CONFIRMED');
    assert.deepEqual(byType.NOMINAL_REAL_CONFUSION.evidenceIds, [ownSubs[0]]);           // 다른 사용자 제출 ID는 빠짐
    assert.deepEqual(diagnosisEvidence.map(e => e.evidenceId).sort(), [ownSubs[0], ownSubs[3], ownSubs[6]].sort());
    assert.ok(diagnosisEvidence.every(e => e.evidenceType === 'QUESTION_SUBMISSION' && e.questionId === q.questionId));
    const all = await misconceptionContext(db.manager, owner.userId, null);                // 대상 개념이 없으면 본인 가설 전체
    assert.equal(all.misconceptionHypotheses.some(h => h.hypothesisType === 'OTHER_CONCEPT'), true);
    assert.equal(all.misconceptionHypotheses.some(h => h.hypothesisType === 'OTHER_USER'), false);
    assert.deepEqual(await misconceptionContext(db.manager, owner.userId, code('N')), { misconceptionHypotheses: [], diagnosisEvidence: [] });
  });

  await t.test('최근 평가: 대상 개념 본인 제출 최근 10개', async () => {
    const recent = await recentAssessments(db.manager, owner.userId, code('A'));
    assert.equal(recent.length, 10);
    assert.equal(recent[0].assessmentId, ownSubs[11]);
    assert.equal(recent.some(r => r.assessmentId === otherSub), false);
    assert.deepEqual(await recentAssessments(db.manager, owner.userId, null), []);
  });

  let reviewSubmissionId;
  await t.test('최근 평가: 복습 제출 포함, 다른 사용자 및 미제출 복습 제외, 최신 10건 유지', async () => {
    const reviewItem = user => save(E.ReviewItem, {
      userId: user.userId, questionCode: q.questionCode, latestQuestionId: q.questionId,
      conceptCode: code('A'), firstReason: 'WRONG', wrongCount: 1, isBookmarked: true,
    });
    const ownItem = await reviewItem(owner);
    const otherItem = await reviewItem(other);
    const makeReview = async (user, item, submittedAt, isCorrect = false) => {
      const answered = submittedAt !== null;
      const attempt = await save(E.ReviewAttempt, {
        userId: user.userId, reviewType: 'RECOMMENDED', entryPoint: 'REVIEW_NOTE', conceptCode: code('A'),
        status: answered ? 'COMPLETED' : 'IN_PROGRESS', questionCount: 1,
        submittedCount: answered ? 1 : 0, correctCount: answered && isCorrect ? 1 : 0,
        completedAt: submittedAt,
      });
      const submission = await save(E.ReviewSubmission, {
        reviewAttemptId: attempt.reviewAttemptId, reviewItemId: item.reviewItemId,
        questionId: q.questionId, sequenceNo: 1,
        displayedChoiceOrder: choices.map(choice => choice.choiceId),
        choiceId: answered ? choices[isCorrect ? 0 : 1].choiceId : null,
        isCorrect: answered ? isCorrect : null, submittedAt,
      });
      return submission.submissionId;
    };

    reviewSubmissionId = await makeReview(owner, ownItem, new Date(base + 60 * 60000));
    const otherReviewId = await makeReview(other, otherItem, new Date(base + 70 * 60000), true);
    const pendingReviewId = await makeReview(owner, ownItem, null);

    const recent = await recentAssessments(db.manager, owner.userId, code('A'));
    assert.equal(recent.length, 10);
    assert.equal(recent[0].assessmentId, reviewSubmissionId);
    assert.equal(recent[0].isCorrect, false);
    assert.equal(recent[0].conceptCode, code('A'));
    assert.equal(recent[1].assessmentId, ownSubs[11]);
    assert.equal(recent.some(row => row.assessmentId === otherReviewId), false);
    assert.equal(recent.some(row => row.assessmentId === pendingReviewId), false);
  });

  await t.test('튜터 서비스가 AI 계약에 맞는 personalizedContext 전체를 보낸다', async () => {
    let sent;
    const aiClient = { answer: async body => { sent = body; return {
      requestId: body.requestId, answer: '실질금리는 …', groundingStatus: 'GROUNDED', sources: [],
      usage: { modelId: 'm', embeddingModelId: 'e', inputTokens: 1, outputTokens: 1, latencyMs: 1, cacheHit: false, retrievalStrategy: 'hybrid', estimatedCost: 0, currency: 'USD' },
    }; } };
    const service = tutorService(db, aiClient, { personalizationEnabled: true });
    const conversation = await service.createConversation(owner.userId, { entryPoint: 'CONCEPT' });
    await service.sendMessage(owner.userId, { conversationId: conversation.conversationId, question: '실질금리가 뭐야?', modelTier: 'BASIC',
      clientMessageId: `cc-${suffix}`, context: { conceptCode: code('A') }, knowledgeScope: null }, null);
    const pc = sent.personalizedContext;
    assert.deepEqual(Object.keys(pc).sort(), ['conceptGraphContext', 'diagnosisEvidence', 'learnerProfile', 'misconceptionHypotheses', 'recentAssessments']);
    assert.deepEqual(personalizedDto.normalize(pc), pc);        // 이미 계약 형식 (다시 정리해도 같음)
    assert.equal(pc.learnerProfile.accuracyRate, 0.6667);       // 12개 중 8개 정답
    if (process.env.TUTOR_CONTRACT_DUMP) require('node:fs').writeFileSync(process.env.TUTOR_CONTRACT_DUMP, JSON.stringify(sent));
  });
});
