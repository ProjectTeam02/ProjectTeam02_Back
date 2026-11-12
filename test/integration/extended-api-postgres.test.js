const assert = require('node:assert/strict');
const test = require('node:test');
const { randomBytes, randomUUID } = require('node:crypto');
const path = require('node:path');
const listenTestServer = require('../helpers/listen-test-server');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('P0~P2 확장 API는 실제 Express·PostgreSQL 성공 경로를 사용한다', { skip: !config, timeout: 120000 }, async t => {
  const options = JSON.parse(config);
  const { AppDataSource: db, User, UserSession, AccountToken, Topic, Stage, Concept, Question,
    QuestionChoice, StageQuestion, LearningAttempt, UserStageProgress, ReviewItem, ReviewMission,
    Costume, UserCostume, UserWallet, CharacterClass } = require('@leren/database');
  const env = require('../../src/config/env');
  const previous = { ...db.options };
  const secrets = { jwtAccessSecret: env.jwtAccessSecret, jwtRefreshSecret: env.jwtRefreshSecret };
  const { issueAccessToken, hashToken } = require('../../src/common/utils/token.util');
  const { hashPassword } = require('../../src/common/utils/password.util');
  let server;

  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db.isInitialized) await db.destroy();
    db.setOptions(previous);
    Object.assign(env, secrets);
  });

  db.setOptions({ host: '127.0.0.1', port: options.port, username: options.username || 'app_user',
    password: options.password || 'app_local', database: options.database || 'leren_it', ssl: false,
    synchronize: false, migrationsRun: false, logging: false, migrations: [path.resolve(__dirname, '../../database/dist/migrations/*.js')],
    extra: { options: '-c search_path=app,public' } });
  await db.initialize();
  env.jwtAccessSecret = randomBytes(32).toString('hex');
  env.jwtRefreshSecret = randomBytes(32).toString('hex');

  const suffix = randomBytes(4).toString('hex');
  const users = db.getRepository(User);
  const user = await users.save({ email: `extended-${suffix}@example.com`, passwordHash: hashPassword('old-password-123'), nickname: `확장${suffix}` });
  const session = await db.getRepository(UserSession).save({ userId: user.userId, refreshTokenHash: randomBytes(32).toString('hex'),
    loginMethod: 'EMAIL', expiresAt: new Date(Date.now() + 3600000) });
  const token = issueAccessToken(user, session.sessionId);
  const otherUser = await users.save({ nickname: `타사용자${suffix}` });
  const otherSession = await db.getRepository(UserSession).save({ userId: otherUser.userId, refreshTokenHash: randomBytes(32).toString('hex'),
    loginMethod: 'EMAIL', expiresAt: new Date(Date.now() + 3600000) });
  const otherToken = issueAccessToken(otherUser, otherSession.sessionId);

  const topic = await db.getRepository(Topic).save({ topicCode: `EXT-${suffix}`, topicNo: 100 + (parseInt(suffix, 16) % 10000), title: '확장 테스트 주제', status: 'PUBLISHED' });
  const concept = await db.getRepository(Concept).save({ conceptCode: `EXT-C-${suffix}`, topicId: topic.topicId, version: 1,
    title: '확장 테스트 개념', status: 'PUBLISHED' });
  const questionRepo = db.getRepository(Question);
  const choiceRepo = db.getRepository(QuestionChoice);
  const stageQuestionRepo = db.getRepository(StageQuestion);
  const questions = [];
  for (let index = 1; index <= 5; index += 1) {
    const question = await questionRepo.save({ questionCode: `EXT-Q-${suffix}-${index}`, conceptId: concept.conceptId,
      questionText: `테스트 문항 ${index}`, explanation: '테스트 해설', generatedBy: 'MANUAL', status: 'PUBLISHED' });
    const choices = await choiceRepo.save([1, 2, 3, 4].map(baseOrder => ({ questionId: question.questionId, baseOrder,
      choiceText: `선택지 ${baseOrder}`, isCorrect: baseOrder === 1 })));
    questions.push({ question, choices });
  }
  const normal = await db.getRepository(Stage).save({ topicId: topic.topicId, stageCode: `EXT-N-${suffix}`, stageNo: 1,
    stageType: 'NORMAL', title: '일반 테스트', maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2,
    rewardTotalExp: 10, rewardEconomyExp: 5, rewardCoin: 5, status: 'PUBLISHED' });
  const boss = await db.getRepository(Stage).save({ topicId: topic.topicId, stageCode: `EXT-B-${suffix}`, stageNo: 2,
    stageType: 'BOSS', title: '보스 테스트', maxQuestionCount: 5, requiredCorrectCount: 4, initialMonsterHp: 4, status: 'PUBLISHED' });
  for (let index = 0; index < 5; index += 1) {
    await stageQuestionRepo.save({ stageId: boss.stageId, questionId: questions[index].question.questionId, questionOrder: index + 1 });
    if (index < 3) await stageQuestionRepo.save({ stageId: normal.stageId, questionId: questions[index].question.questionId, questionOrder: index + 1 });
  }
  await db.getRepository(UserStageProgress).save({ userId: user.userId, stageId: normal.stageId, progressStatus: 'PASSED', firstPassedAt: new Date() });
  await db.getRepository(LearningAttempt).save({ userId: user.userId, stageId: normal.stageId, attemptNo: 1,
    attemptType: 'PLAY', mode: 'START', status: 'FAILED', endReason: 'QUESTIONS_EXHAUSTED', maxQuestionCount: 3,
    requiredCorrectCount: 2, initialHp: 2, finalHp: 2, submittedCount: 3, correctCount: 0, endedAt: new Date() });
  const reviewItem = await db.getRepository(ReviewItem).save({ userId: user.userId, questionCode: questions[0].question.questionCode,
    latestQuestionId: questions[0].question.questionId, conceptCode: concept.conceptCode, sourceStageId: normal.stageId,
    firstReason: 'WRONG', wrongCount: 1, isBookmarked: true });
  const mission = await db.getRepository(ReviewMission).save({ userId: user.userId, conceptCode: concept.conceptCode,
    firstRegisteredAt: new Date(), dueDate: new Date().toISOString().slice(0, 10), status: 'AVAILABLE', targetQuestionCount: 1 });
  let classes = await db.getRepository(CharacterClass).findOneBy({ classCode: 'MAGE' });
  if (!classes) classes = await db.getRepository(CharacterClass).save({ classCode: 'MAGE', name: '마법사', isActive: true, sortOrder: 1 });
  const ownedCostume = await db.getRepository(Costume).save({ costumeCode: `EXT-OWN-${suffix}`, name: '보유 코스튬', category: 'TOP', isOnSale: false, isDefault: false });
  const saleCostume = await db.getRepository(Costume).save({ costumeCode: `EXT-SALE-${suffix}`, name: '판매 코스튬', category: 'BOTTOM', priceCoin: 10, isOnSale: true, isDefault: false });
  await db.getRepository(UserCostume).save({ userId: user.userId, itemId: ownedCostume.itemId, acquireType: 'DEFAULT' });
  await db.getRepository(UserWallet).save({ userId: user.userId, coinBalance: 100, version: 0 });

  server = await listenTestServer(require('../../src/app'));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, { method = 'GET', body, auth = true, query = '', requestToken = token } = {}) {
    const requestHeaders = auth ? { authorization: `Bearer ${requestToken}` } : {};
    const headers = body === undefined ? requestHeaders : { 'content-type': 'application/json', ...requestHeaders };
    const response = await fetch(base + route + query, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  function ok(result, status = 200) { assert.equal(result.status, status, JSON.stringify(result.body)); assert.equal(result.body.success, true); return result.body.data; }

  const invalidStart = await request(`/api/v1/bosses/${boss.stageId}/attempts`, { method: 'POST', body: { mode: 'INVALID' } });
  assert.equal(invalidStart.status, 422);
  const invalidFilter = await request('/api/v1/reviews/items?source=ALL');
  assert.equal(invalidFilter.status, 422);
  const invalidReset = await request('/api/v1/auth/password-reset/request', { method: 'POST', body: { email: user.email, extra: true }, auth: false });
  assert.equal(invalidReset.status, 422);
  const otherMission = await request(`/api/v1/reviews/missions/${mission.missionId}`, { requestToken: otherToken });
  assert.equal(otherMission.status, 404);

  ok(await request(`/api/v1/bosses/${boss.stageId}`));
  ok(await request(`/api/v1/bosses/${boss.stageId}/attempts`, { method: 'POST', body: { mode: 'START' } }), 201);
  ok(await request('/api/v1/reviews/items'));
  ok(await request(`/api/v1/questions/${questions[0].question.questionId}/bookmark`, { method: 'PUT' }));
  ok(await request(`/api/v1/questions/${questions[0].question.questionId}/bookmark`, { method: 'DELETE' }));
  ok(await request('/api/v1/users/me/reward-ledger'));
  ok(await request('/api/v1/topics/tree'));
  ok(await request(`/api/v1/topics/${topic.topicId}`));

  ok(await request('/api/v1/auth/password-reset/request', { method: 'POST', body: { email: user.email }, auth: false }));
  const resetToken = `reset-${suffix}`;
  await db.getRepository(AccountToken).save({ userId: user.userId, tokenType: 'PASSWORD_RESET', tokenHash: hashToken(resetToken),
    targetEmail: user.email, expiresAt: new Date(Date.now() + 1800000) });
  ok(await request('/api/v1/auth/password-reset/confirm', { method: 'POST', body: { resetToken, newPassword: 'new-password-123' }, auth: false }));
  const reusedReset = await request('/api/v1/auth/password-reset/confirm', { method: 'POST', body: { resetToken, newPassword: 'new-password-123' }, auth: false });
  assert.equal(reusedReset.status, 401);
  ok(await request('/api/v1/home/summary'));
  ok(await request('/api/v1/mypage/summary'));
  ok(await request('/api/v1/learning/progress/active'));
  ok(await request(`/api/v1/learning/progress/${normal.stageId}`, { method: 'PUT', body: { contentPosition: 1 } }));
  const normalAttempt = ok(await request(`/api/v1/stages/${normal.stageId}/attempts`, {
    method: 'POST', body: { mode: 'RETRY' },
  }), 201);
  assert.match(normalAttempt.attemptId, /^[0-9a-f-]{36}$/i);
  assert.equal(normalAttempt.stageId, normal.stageId);
  assert.equal(normalAttempt.status, 'IN_PROGRESS');
  assert.equal(normalAttempt.mode, 'RETRY');
  assert.equal(normalAttempt.attemptNo, 2);
  assert.equal(normalAttempt.maxQuestionCount, 3);
  assert.equal(normalAttempt.submittedCount, 0);
  assert.equal(normalAttempt.correctCount, 0);
  assert.equal(normalAttempt.hp, 2);
  assert.equal(normalAttempt.resumed, false);
  assert.equal(normalAttempt.currentQuestion.choices.length, 4);
  assert.equal(typeof normalAttempt.currentQuestion.id, 'string');
  assert.equal(typeof normalAttempt.currentQuestion.title, 'string');
  assert.equal('explanation' in normalAttempt.currentQuestion, false);
  assert.equal(normalAttempt.currentQuestion.choices.some(choice => 'isCorrect' in choice), false);
  const resumedRelearn = ok(await request(`/api/v1/stages/${normal.stageId}/relearn`, { method: 'POST' }), 200);
  assert.equal(resumedRelearn.attemptId, normalAttempt.attemptId);
  assert.equal(resumedRelearn.resumed, true);
  const currentQuestion = ok(await request(`/api/v1/attempts/${normalAttempt.attemptId}/current-question`));
  assert.equal(currentQuestion.attemptId, normalAttempt.attemptId);
  assert.equal(currentQuestion.status, 'IN_PROGRESS');
  assert.equal(currentQuestion.hp, 2);
  assert.equal(currentQuestion.submittedCount, 0);
  assert.equal(currentQuestion.correctCount, 0);
  assert.equal(currentQuestion.currentQuestion.id, normalAttempt.currentQuestion.id);
  assert.equal(currentQuestion.currentQuestion.explanation, undefined);
  assert.equal(currentQuestion.currentQuestion.choices.every(choice => typeof choice.id === 'string'
    && typeof choice.label === 'string' && typeof choice.content === 'string'), true);
  const firstAnswer = ok(await request(`/api/v1/attempts/${normalAttempt.attemptId}/answers`, { method: 'POST', body: {
    questionId: currentQuestion.currentQuestion.id, choiceId: questions[0].choices[0].choiceId, submissionId: randomUUID(),
  } }), 201);
  assert.equal(firstAnswer.attemptId, normalAttempt.attemptId);
  assert.equal(firstAnswer.quizId, currentQuestion.currentQuestion.id);
  assert.equal(typeof firstAnswer.choiceId, 'string');
  assert.equal(typeof firstAnswer.isCorrect, 'boolean');
  assert.equal(typeof firstAnswer.score, 'number');
  assert.equal(firstAnswer.hpBefore, 2);
  assert.equal(firstAnswer.hpAfter, 1);
  assert.equal(firstAnswer.submittedCount, 1);
  assert.equal(firstAnswer.correctCount, 1);
  assert.equal(firstAnswer.status, 'IN_PROGRESS');
  assert.equal(firstAnswer.explanation, '테스트 해설');
  const secondQuestion = firstAnswer.nextQuestion;
  assert.equal(secondQuestion.id, questions[1].question.questionId);
  assert.equal('explanation' in secondQuestion, false);
  const secondAnswer = ok(await request(`/api/v1/attempts/${normalAttempt.attemptId}/answers`, { method: 'POST', body: {
    questionId: secondQuestion.id, choiceId: questions[1].choices[0].choiceId, submissionId: randomUUID(),
  } }), 201);
  assert.equal(secondAnswer.attemptId, normalAttempt.attemptId);
  assert.equal(secondAnswer.quizId, secondQuestion.id);
  assert.equal(typeof secondAnswer.isCorrect, 'boolean');
  assert.equal(secondAnswer.score, 100);
  assert.equal(secondAnswer.hpBefore, 1);
  assert.equal(secondAnswer.hpAfter, 0);
  assert.equal(secondAnswer.submittedCount, 2);
  assert.equal(secondAnswer.correctCount, 2);
  assert.equal(secondAnswer.status, 'PASSED');
  const normalDetails = ok(await request(`/api/v1/attempts/${normalAttempt.attemptId}`));
  assert.equal(normalDetails.attemptId, normalAttempt.attemptId);
  assert.equal(normalDetails.stageId, normal.stageId);
  assert.equal(normalDetails.status, 'PASSED');
  assert.equal(normalDetails.passed, true);
  assert.equal(Array.isArray(normalDetails.answers), true);
  assert.equal(normalDetails.answers.length, 2);
  assert.equal(Array.isArray(normalDetails.wrongQuestionIds), true);
  assert.equal(typeof normalDetails.passHistory, 'object');
  assert.equal(typeof normalDetails.reward.granted, 'boolean');
  const otherUserAttempt = await request(`/api/v1/attempts/${normalAttempt.attemptId}`, { requestToken: otherToken });
  assert.equal(otherUserAttempt.status, 404);
  ok(await request('/api/v1/growth/me'));
  ok(await request('/api/v1/statistics/overall'));
  ok(await request('/api/v1/statistics/concepts'));
  ok(await request('/api/v1/reviews/due', { query: `?date=${new Date().toISOString().slice(0, 10)}` }));
  ok(await request(`/api/v1/reviews/missions/${mission.missionId}`));
  const reviewAttempt = ok(await request(`/api/v1/reviews/missions/${mission.missionId}/attempts`, { method: 'POST' }), 201);
  const reviewAnswer = reviewAttempt.answers[0];
  const reviewAnswerResult = ok(await request(`/api/v1/review-attempts/${reviewAttempt.reviewAttemptId}/answers`, { method: 'POST', body: {
    questionId: reviewAnswer.questionId, choiceId: questions[0].choices[0].choiceId, submissionId: reviewAnswer.submissionId,
  } }));
  const duplicateReviewAnswer = ok(await request(`/api/v1/review-attempts/${reviewAttempt.reviewAttemptId}/answers`, { method: 'POST', body: {
    questionId: reviewAnswer.questionId, choiceId: questions[0].choices[0].choiceId, submissionId: reviewAnswer.submissionId,
  } }));
  assert.equal(duplicateReviewAnswer.result.duplicate, true);
  assert.equal(duplicateReviewAnswer.submittedCount, reviewAnswerResult.submittedCount);
  ok(await request(`/api/v1/review-attempts/${reviewAttempt.reviewAttemptId}`));

  ok(await request('/api/v1/users/me', { method: 'PATCH', body: { nickname: `변경${suffix}` } }));
  ok(await request('/api/v1/users/me/notification-settings'));
  ok(await request('/api/v1/users/me/character/class', { method: 'PATCH', body: { classId: classes.classId } }));
  ok(await request('/api/v1/inventory'));
  ok(await request(`/api/v1/inventory/${ownedCostume.itemId}/equip`, { method: 'PUT' }));
  ok(await request('/api/v1/shop/costumes'));
  ok(await request(`/api/v1/shop/costumes/${saleCostume.itemId}`));
  const purchase = ok(await request('/api/v1/shop/purchases', { method: 'POST', body: { itemId: saleCostume.itemId, requestId: `purchase-${suffix}` } }), 201);
  const duplicatePurchase = ok(await request('/api/v1/shop/purchases', { method: 'POST', body: { itemId: saleCostume.itemId, requestId: `purchase-${suffix}` } }), 201);
  assert.equal(duplicatePurchase.duplicate, true);
  assert.equal(duplicatePurchase.coinBalance, purchase.coinBalance);
   // 같은 문항 북마크 동시 요청은 모두 200, review_items는 1행
  const bookmarkTarget = questions[2].question;
  const concurrentBookmarks = await Promise.all([1, 2, 3, 4, 5].map(() => request(`/api/v1/questions/${bookmarkTarget.questionId}/bookmark`, { method: 'PUT' })));
  assert.deepEqual(concurrentBookmarks.map(result => result.status), [200, 200, 200, 200, 200]);
  assert.equal(await db.getRepository(ReviewItem).countBy({ userId: user.userId, questionCode: bookmarkTarget.questionCode }), 1);

  // 다른 사용자가 이미 사용된 requestId로 구매하면 503이 아니라 409
  await db.getRepository(UserWallet).save({ userId: otherUser.userId, coinBalance: 100, version: 0 });
  const otherUserSameRequestId = await request('/api/v1/shop/purchases', { method: 'POST', requestToken: otherToken,
    body: { itemId: saleCostume.itemId, requestId: `purchase-${suffix}` } });
  assert.equal(otherUserSameRequestId.status, 409, JSON.stringify(otherUserSameRequestId.body));

});
