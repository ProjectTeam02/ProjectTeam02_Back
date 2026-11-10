/**
 * 기존 기능에 없거나 기존 경로와 달랐던 확장 API 모음.
 * 기존 라우터를 제거하지 않고, 호환 경로를 추가해 앱의 점진적 전환을 지원한다.
 */
const crypto = require('node:crypto');
const express = require('express');
const { IsNull } = require('typeorm');
const auth = require('../../common/middleware/auth.middleware');
const asyncHandler = require('../../common/utils/asyncHandler');
const AppError = require('../../common/errors/AppError');
const { AppDataSource } = require('../../config/database');
const {
  User, UserSetting, CharacterClass, UserCharacter, Topic, Stage, Concept, ConceptSection,
  StageQuestion, Question, QuestionChoice, LearningAttempt, QuestionSubmission,
  UserStageProgress, UserGrowth, UserWallet, ExpLedger, CoinLedger,
  ReviewItem, ReviewMission, ReviewAttempt, ReviewSubmission, StudyPlan,
  Costume, UserCostume, UserEquippedCostume, AccountToken,
} = require('@leren/database');
const { hashToken } = require('../../common/utils/token.util');
const { hashPassword } = require('../../common/utils/password.util');
const passwordResetDelivery = require('../auth/password-reset.delivery');
const notificationSetting = require('../notifications/dto/notificationSetting.dto');
const calendarService = require('../calendar/calendar.service')(AppDataSource);
const quizContractService = require('../quizzes/quiz.service')(AppDataSource);

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function id(value, name) {
  if (typeof value !== 'string' || !UUID.test(value)) throw AppError.validation(`${name}이(가) 올바른 UUID가 아닙니다.`);
  return value.toLowerCase();
}

function page(query = {}) {
  const pageValue = query.page === undefined ? 1 : Number(query.page);
  const sizeValue = query.size === undefined && query.limit === undefined ? 20 : Number(query.size ?? query.limit);
  if (!Number.isInteger(pageValue) || pageValue < 1 || !Number.isInteger(sizeValue) || sizeValue < 1 || sizeValue > 100) {
    throw AppError.validation('page와 size는 1~100 범위의 양의 정수여야 합니다.');
  }
  const current = pageValue;
  const size = sizeValue;
  return { page: current, size, skip: (current - 1) * size };
}

function string(value, name, max = 255) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw AppError.validation(`${name}이(가) 올바르지 않습니다.`);
  return value.trim();
}

function data(res, value, status = 200) { return res.status(status).json({ success: true, data: value }); }
function repo(manager, entity) { return manager.getRepository(entity); }

function publicChoice(choice) {
  return { choiceId: choice.choiceId, label: String.fromCharCode(64 + choice.baseOrder), content: choice.choiceText };
}

function publicQuestion(question, choices = []) {
  return {
    questionId: question.questionId,
    questionCode: question.questionCode,
    question: question.questionText,
    difficulty: question.difficulty,
    conceptId: question.conceptId,
    choices: choices.map(publicChoice),
  };
}

function publicStage(stage) {
  return { stageId: stage.stageId, stageCode: stage.stageCode, stageNo: stage.stageNo,
    stageType: stage.stageType, title: stage.title, description: stage.description,
    estimatedMinMinutes: stage.estimatedMinMinutes, estimatedMaxMinutes: stage.estimatedMaxMinutes,
    maxQuestionCount: stage.maxQuestionCount, requiredCorrectCount: stage.requiredCorrectCount,
    initialMonsterHp: stage.initialMonsterHp, monsterName: stage.monsterName,
    monsterImageKey: stage.monsterImageKey, topicId: stage.topicId };
}

function publicMission(mission) {
  return { missionId: mission.missionId, conceptCode: mission.conceptCode,
    firstRegisteredAt: mission.firstRegisteredAt, dueDate: mission.dueDate, status: mission.status,
    targetQuestionCount: mission.targetQuestionCount, notifiedAt: mission.notifiedAt,
    completedAt: mission.completedAt };
}

function publicGrowth(growth, userId) {
  return { userId, totalExp: growth?.totalExp ?? 0, totalLevel: growth?.totalLevel ?? 1,
    economyExp: growth?.economyExp ?? 0, economyLevel: growth?.economyLevel ?? 1,
    lastLevelUpAt: growth?.lastLevelUpAt ?? null };
}

function publicWallet(wallet, userId) {
  return { userId, coinBalance: wallet?.coinBalance ?? 0, version: wallet?.version ?? 0 };
}

function parseScheduleBody(body, partial = false) {
  const result = { ...(body || {}) };
  if (result.title !== undefined && result.goal === undefined) result.goal = result.title;
  if (!partial && result.planType === undefined) result.planType = 'NEW_LEARNING';
  if (!partial && result.topicId === undefined && (result.stageId || result.conceptId)) {
    // The calendar service accepts topicId as an assertion. It is resolved below.
    result.topicId = undefined;
  }
  return result;
}

async function topicForTarget(manager, input) {
  if (input.topicId) return input.topicId;
  const targetId = input.stageId || input.conceptId;
  if (!targetId) return undefined;
  const entity = input.stageId ? Stage : Concept;
  const row = await repo(manager, entity).findOneBy(input.stageId ? { stageId: targetId } : { conceptId: targetId });
  return row?.topicId;
}

function mapPlanInput(input, topicId) {
  const mapped = parseScheduleBody(input);
  if (topicId) mapped.topicId = topicId;
  if (mapped.title !== undefined && mapped.goal === undefined) mapped.goal = mapped.title;
  return mapped;
}

async function planCreate(userId, body) {
  const input = parseScheduleBody(body);
  const topicId = await AppDataSource.transaction(manager => topicForTarget(manager, input));
  return calendarService.create(userId, mapPlanInput(input, topicId));
}

async function planUpdate(userId, planId, body) {
  const input = parseScheduleBody(body, true);
  let topicId;
  if (input.stageId || input.conceptId) topicId = await AppDataSource.transaction(manager => topicForTarget(manager, input));
  return calendarService.update(userId, id(planId, 'planId'), { ...input, ...(topicId ? { topicId } : {}) });
}

function serializeCostume(row, owned = false, equipped = false) {
  return { itemId: row.itemId, costumeCode: row.costumeCode, name: row.name, description: row.description,
    flavorText: row.flavorText, category: row.category, priceCoin: row.priceCoin, imageKey: row.imageKey,
    thumbnailKey: row.thumbnailKey, isOnSale: row.isOnSale, owned, equipped };
}

async function ownedAttempt(manager, userId, attemptId, lock = false) {
  const attempt = await repo(manager, LearningAttempt).findOne({
    where: { attemptId: id(attemptId, 'attemptId'), userId },
    ...(lock ? { lock: { mode: 'pessimistic_write' } } : {}),
  });
  if (!attempt) throw AppError.notFound('응시를 찾을 수 없습니다.');
  return attempt;
}

async function reviewItemResponse(manager, item) {
  const question = item.latestQuestion || await repo(manager, Question).findOneBy({ questionId: item.latestQuestionId });
  const choices = question ? await repo(manager, QuestionChoice).find({ where: { questionId: question.questionId }, order: { baseOrder: 'ASC' } }) : [];
  return { reviewItemId: item.reviewItemId, questionId: question?.questionId, questionCode: item.questionCode,
    conceptCode: item.conceptCode, sourceStageId: item.sourceStageId, firstReason: item.firstReason,
    wrongCount: item.wrongCount, isBookmarked: item.isBookmarked, question: question ? publicQuestion(question, choices) : null };
}

async function reviewAttemptResponse(manager, attempt) {
  const submissions = await repo(manager, ReviewSubmission).find({
    where: { reviewAttemptId: attempt.reviewAttemptId }, relations: { question: true, choice: true }, order: { sequenceNo: 'ASC' },
  });
  return { reviewAttemptId: attempt.reviewAttemptId, missionId: attempt.missionId, status: attempt.status,
    reviewType: attempt.reviewType, entryPoint: attempt.entryPoint, conceptCode: attempt.conceptCode,
    questionCount: attempt.questionCount, submittedCount: attempt.submittedCount, correctCount: attempt.correctCount,
    startedAt: attempt.startedAt, completedAt: attempt.completedAt,
    answers: submissions.map(row => ({ submissionId: row.submissionId, questionId: row.questionId,
      sequenceNo: row.sequenceNo, choiceId: row.choiceId, isCorrect: row.isCorrect,
      explanation: row.submittedAt ? row.question?.explanation : null })),
  };
}

async function createReviewAttempt(userId, missionId = null) {
  return AppDataSource.transaction(async manager => {
    let mission = null;
    if (missionId) {
      mission = await repo(manager, ReviewMission).findOne({ where: { missionId: id(missionId, 'missionId'), userId }, lock: { mode: 'pessimistic_write' } });
      if (!mission) throw AppError.notFound('복습 임무를 찾을 수 없습니다.');
      if (mission.status === 'COMPLETED') throw AppError.conflict('이미 완료한 복습 임무입니다.');
    }
    const conceptCode = mission?.conceptCode || null;
    const items = await repo(manager, ReviewItem).find({ where: { userId }, relations: { latestQuestion: true }, order: { lastAnsweredAt: 'ASC', firstRegisteredAt: 'ASC' } });
    const selected = items.filter(item => (conceptCode ? item.conceptCode === conceptCode : true) && (item.wrongCount > 0 || item.isBookmarked))
      .filter(item => item.latestQuestion || item.latestQuestionId)
      .slice(0, mission?.targetQuestionCount || 5);
    if (!selected.length) throw AppError.conflict('복습할 문항이 없습니다.');
    const attempt = await repo(manager, ReviewAttempt).save(repo(manager, ReviewAttempt).create({
      userId, missionId: mission?.missionId || null, reviewType: mission ? 'AUTO' : 'RECOMMENDED', entryPoint: mission ? 'HOME' : 'REVIEW_NOTE',
      conceptCode, status: 'IN_PROGRESS', questionCount: selected.length, submittedCount: 0, correctCount: 0,
    }));
    const submissions = repo(manager, ReviewSubmission);
    let sequenceNo = 0;
    for (const item of selected) {
      const question = item.latestQuestion || await repo(manager, Question).findOneBy({ questionId: item.latestQuestionId });
      if (!question) continue;
      const choices = await repo(manager, QuestionChoice).find({ where: { questionId: question.questionId }, order: { baseOrder: 'ASC' } });
      sequenceNo += 1;
      await submissions.save(submissions.create({ reviewAttemptId: attempt.reviewAttemptId, reviewItemId: item.reviewItemId,
        questionId: question.questionId, sequenceNo, displayedChoiceOrder: choices.map(choice => choice.choiceId),
        choiceId: null, isCorrect: null, bookmarkChecked: item.isBookmarked, submittedAt: null }));
    }
    if (!sequenceNo) throw AppError.conflict('복습할 수 있는 공개 문항이 없습니다.');
    attempt.questionCount = sequenceNo;
    await repo(manager, ReviewAttempt).save(attempt);
    if (mission) { mission.status = 'IN_PROGRESS'; await repo(manager, ReviewMission).save(mission); }
    return reviewAttemptResponse(manager, attempt);
  });
}

async function answerReview(userId, reviewAttemptId, input) {
  return AppDataSource.transaction(async manager => {
    const attempt = await repo(manager, ReviewAttempt).findOne({ where: { reviewAttemptId: id(reviewAttemptId, 'reviewAttemptId'), userId }, lock: { mode: 'pessimistic_write' } });
    if (!attempt) throw AppError.notFound('복습 응시를 찾을 수 없습니다.');
    const submissionId = id(input?.submissionId, 'submissionId');
    const questionId = id(input?.questionId, 'questionId');
    const choiceId = id(input?.choiceId, 'choiceId');
    const submission = await repo(manager, ReviewSubmission).findOne({ where: { reviewAttemptId: attempt.reviewAttemptId, submissionId, questionId }, lock: { mode: 'pessimistic_write' } });
    if (!submission) throw AppError.conflict('현재 복습 응시의 문항이 아닙니다.');
    const question = await repo(manager, Question).findOneBy({ questionId: submission.questionId });
    if (submission.submittedAt) {
      if (submission.choiceId !== choiceId) throw AppError.conflict('이미 제출한 문항입니다.');
      return { ...(await reviewAttemptResponse(manager, attempt)), result: { isCorrect: Boolean(submission.isCorrect), explanation: question?.explanation || null, duplicate: true } };
    }
    if (attempt.status !== 'IN_PROGRESS') throw AppError.conflict('종료된 복습 응시에는 제출할 수 없습니다.');
    const choice = await repo(manager, QuestionChoice).findOneBy({ questionId: submission.questionId, choiceId });
    if (!choice) throw AppError.validation('해당 문항의 선택지가 아닙니다.');
    submission.choiceId = choice.choiceId; submission.isCorrect = Boolean(choice.isCorrect); submission.submittedAt = new Date();
    await repo(manager, ReviewSubmission).save(submission);
    attempt.submittedCount += 1; if (choice.isCorrect) attempt.correctCount += 1;
    if (attempt.submittedCount >= attempt.questionCount) { attempt.status = 'COMPLETED'; attempt.completedAt = new Date(); }
    await repo(manager, ReviewAttempt).save(attempt);
    const item = await repo(manager, ReviewItem).findOneBy({ reviewItemId: submission.reviewItemId, userId });
    if (item) { item.lastAnswerResult = choice.isCorrect ? 'CORRECT' : 'WRONG'; item.lastAnsweredAt = new Date(); if (!choice.isCorrect) item.wrongCount += 1; await repo(manager, ReviewItem).save(item); }
    if (attempt.status === 'COMPLETED' && attempt.missionId) await repo(manager, ReviewMission).update({ missionId: attempt.missionId, userId }, { status: 'COMPLETED', completedAt: new Date() });
    return { ...(await reviewAttemptResponse(manager, attempt)), result: { isCorrect: Boolean(choice.isCorrect), explanation: question?.explanation || null } };
  });
}

async function upsertBookmark(userId, questionId, bookmarked, conceptId) {
  return AppDataSource.transaction(async manager => {
    const question = await repo(manager, Question).findOne({ where: { questionId: id(questionId, 'questionId') }, relations: { concept: true } });
    if (!question) throw AppError.notFound('문항을 찾을 수 없습니다.');
    const conceptCode = question.concept?.conceptCode;
    if (!conceptCode) throw AppError.unavailable('문항의 개념 정보가 없습니다.');
    let item = await repo(manager, ReviewItem).findOneBy({ userId, questionCode: question.questionCode });
    if (!item && !bookmarked) return { questionId: question.questionId, bookmarked: false, reviewItemId: null };
    if (!item) item = repo(manager, ReviewItem).create({ userId, questionCode: question.questionCode, latestQuestionId: question.questionId,
      conceptCode, firstReason: 'BOOKMARK', wrongCount: 0, isBookmarked: bookmarked, bookmarkedAt: bookmarked ? new Date() : null, unbookmarkedAt: bookmarked ? null : new Date() });
    else { item.latestQuestionId = question.questionId; item.isBookmarked = bookmarked; item.bookmarkedAt = bookmarked ? new Date() : item.bookmarkedAt; item.unbookmarkedAt = bookmarked ? null : new Date(); }
    await repo(manager, ReviewItem).save(item);
    return { questionId: question.questionId, bookmarked, reviewItemId: item.reviewItemId };
  });
}

async function passwordResetRequest(email) {
  const normalized = string(email, 'email').toLowerCase();
  return AppDataSource.transaction(async manager => {
    const user = await repo(manager, User).findOneBy({ email: normalized });
    if (user) {
      const raw = crypto.randomBytes(32).toString('base64url');
      const activeTokens = await repo(manager, AccountToken).find({ where: { userId: user.userId, tokenType: 'PASSWORD_RESET', usedAt: IsNull() } });
      for (const activeToken of activeTokens) { activeToken.usedAt = new Date(); await repo(manager, AccountToken).save(activeToken); }
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await repo(manager, AccountToken).save({ userId: user.userId, tokenType: 'PASSWORD_RESET', tokenHash: hashToken(raw), targetEmail: normalized,
        sendCount: 1, lastSentAt: new Date(), expiresAt, usedAt: null });
      await passwordResetDelivery.send({ email: normalized, token: raw, expiresAt });
    }
    return { accepted: true };
  });
}

async function passwordResetConfirm(token, newPassword) {
  const raw = string(token, 'resetToken', 4096);
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) throw AppError.validation('newPassword는 8~128자여야 합니다.');
  return AppDataSource.transaction(async manager => {
    const tokenRow = await repo(manager, AccountToken).findOne({ where: { tokenHash: hashToken(raw), tokenType: 'PASSWORD_RESET' }, lock: { mode: 'pessimistic_write' } });
    if (!tokenRow || tokenRow.usedAt || tokenRow.expiresAt <= new Date()) throw AppError.unauthorized('유효하지 않거나 만료된 재설정 토큰입니다.');
    const user = await repo(manager, User).findOneBy({ userId: tokenRow.userId });
    if (!user) throw AppError.notFound('사용자를 찾을 수 없습니다.');
    user.passwordHash = hashPassword(newPassword); user.passwordChangedAt = new Date();
    await repo(manager, User).save(user); tokenRow.usedAt = new Date(); await repo(manager, AccountToken).save(tokenRow);
    return { reset: true };
  });
}

function routes() {
  // Content tree and details
  router.get('/topics/tree', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const topics = await repo(manager, Topic).find({ where: { status: 'PUBLISHED' }, order: { topicNo: 'ASC' } });
    const stages = await repo(manager, Stage).find({ where: { status: 'PUBLISHED' }, order: { stageNo: 'ASC' } });
    return { items: topics.map(topic => ({ topicId: topic.topicId, topicCode: topic.topicCode, title: topic.title,
      description: topic.description, stages: stages.filter(stage => stage.topicId === topic.topicId).map(stage => ({ stageId: stage.stageId, stageNo: stage.stageNo, stageType: stage.stageType, title: stage.title })) })) };
  }))));
  router.get('/topics/:topicId', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const topic = await repo(manager, Topic).findOneBy({ topicId: id(req.params.topicId, 'topicId'), status: 'PUBLISHED' });
    if (!topic) throw AppError.notFound('공개된 주제를 찾을 수 없습니다.');
    const stages = await repo(manager, Stage).find({ where: { topicId: topic.topicId, status: 'PUBLISHED' }, order: { stageNo: 'ASC' } });
    return { topicId: topic.topicId, topicCode: topic.topicCode, title: topic.title, description: topic.description, stages: stages.map(publicStage) };
  }))));
  router.get('/concepts/:conceptId', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const concept = await repo(manager, Concept).findOneBy({ conceptId: id(req.params.conceptId, 'conceptId'), status: 'PUBLISHED' });
    if (!concept) throw AppError.notFound('공개된 개념을 찾을 수 없습니다.');
    const sections = await repo(manager, ConceptSection).find({ where: { conceptId: concept.conceptId }, order: { sortOrder: 'ASC' } });
    return { conceptId: concept.conceptId, conceptCode: concept.conceptCode, topicId: concept.topicId,
      version: concept.version, title: concept.title, shortDefinition: concept.shortDefinition,
      summary: concept.summary, estimatedMinutes: concept.estimatedMinutes, sections };
  }))));
  router.get('/stages/:stageId', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const stage = await repo(manager, Stage).findOne({ where: { stageId: id(req.params.stageId, 'stageId'), status: 'PUBLISHED' }, relations: { topic: true } });
    if (!stage) throw AppError.notFound('공개된 Stage를 찾을 수 없습니다.');
    return publicStage(stage);
  }))));
  router.post('/stages/:stageId/relearn', auth, asyncHandler(async (req, res) => {
    const result = await quizContractService.relearn(req.user.sub, id(req.params.stageId, 'stageId'));
    return data(res, result, result.resumed ? 200 : 201);
  }));
  router.get('/bosses/:bossId', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const stage = await repo(manager, Stage).findOne({ where: { stageId: id(req.params.bossId, 'bossId'), stageType: 'BOSS', status: 'PUBLISHED' }, relations: { topic: true } });
    if (!stage) throw AppError.notFound('공개된 Boss Stage를 찾을 수 없습니다.'); return publicStage(stage);
  }))));
  router.post('/bosses/:bossId/attempts', auth, asyncHandler(async (req, res) => {
    if (!['START', 'RETRY'].includes(req.body?.mode)) throw AppError.validation('mode는 START 또는 RETRY여야 합니다.');
    const result = await quizContractService.bossStart(req.user.sub, id(req.params.bossId, 'bossId'), req.body.mode);
    return data(res, result, result.resumed ? 200 : 201);
  }));
  router.get('/boss-attempts/:attemptId', auth, asyncHandler(async (req, res) => data(res, await quizContractService.bossGet(req.user.sub, id(req.params.attemptId, 'attemptId')))));
  router.post('/boss-attempts/:attemptId/answers', auth, asyncHandler(async (req, res) => data(res, await quizContractService.bossSubmit(req.user.sub, id(req.body?.questionId, 'questionId'), { ...req.body, attemptId: id(req.params.attemptId, 'attemptId') }), 201)));

  // Study plan aliases for the public API contract.
  router.post('/study-plans', auth, asyncHandler(async (req, res) => data(res, await planCreate(req.user.sub, req.body), 201)));
  router.patch('/study-plans/:planId', auth, asyncHandler(async (req, res) => data(res, await planUpdate(req.user.sub, req.params.planId, req.body))));
  router.delete('/study-plans/:planId', auth, asyncHandler(async (req, res) => data(res, await calendarService.remove(req.user.sub, id(req.params.planId, 'planId')))));

  // Progress and history aliases.
  router.get('/learning/progress/active', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const rows = await repo(manager, UserStageProgress).find({ where: { userId: req.user.sub, progressStatus: 'IN_PROGRESS' }, relations: { stage: true }, order: { startedAt: 'DESC' } });
    return { items: rows.map(row => ({ stageId: row.stageId, stage: row.stage ? publicStage(row.stage) : null,
      progressStatus: row.progressStatus, contentPosition: row.contentPosition, startedAt: row.startedAt })) };
  }))));
  router.put('/learning/progress/:stageId', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const stageId = id(req.params.stageId, 'stageId'); const position = Number(req.body?.contentPosition);
    if (!Number.isInteger(position) || position < 1) throw AppError.validation('contentPosition은 1 이상의 정수여야 합니다.');
    const stage = await repo(manager, Stage).findOneBy({ stageId, status: 'PUBLISHED' }); if (!stage) throw AppError.notFound('Stage를 찾을 수 없습니다.');
    if (stage.stageType === 'BOSS') throw AppError.validation('Boss Stage에는 학습 진도를 저장할 수 없습니다.');
    let progress = await repo(manager, UserStageProgress).findOneBy({ userId: req.user.sub, stageId });
    if (!progress) progress = repo(manager, UserStageProgress).create({ userId: req.user.sub, stageId, progressStatus: 'IN_PROGRESS', startedAt: new Date() });
    progress.contentPosition = position; progress.contentPositionUpdatedAt = new Date();
    await repo(manager, UserStageProgress).save(progress);
    return { userId: progress.userId, stageId: progress.stageId, progressStatus: progress.progressStatus,
      contentPosition: progress.contentPosition, contentPositionUpdatedAt: progress.contentPositionUpdatedAt,
      startedAt: progress.startedAt };
  }))));
  router.get('/learning/history/:historyId', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const attempt = await ownedAttempt(manager, req.user.sub, req.params.historyId);
    const submissions = await repo(manager, QuestionSubmission).find({ where: { attemptId: attempt.attemptId }, relations: { question: true, choice: true }, order: { sequenceNo: 'ASC' } });
    return { historyId: attempt.attemptId, attempt, answers: submissions.map(row => ({ questionId: row.questionId, choiceId: row.choiceId, isCorrect: row.isCorrect, explanation: row.question?.explanation })) };
  }))));

  // Review list, mission and answer APIs.
  router.get('/reviews/items', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const paging = page(req.query); let rows = await repo(manager, ReviewItem).find({ where: { userId: req.user.sub }, relations: { latestQuestion: { concept: true } }, order: { firstRegisteredAt: 'DESC' } });
    if (req.query.source === 'BOOKMARK') rows = rows.filter(row => row.isBookmarked); if (req.query.source === 'WRONG') rows = rows.filter(row => row.wrongCount > 0);
    if (req.query.conceptId) rows = rows.filter(row => row.latestQuestion?.conceptId === req.query.conceptId);
    if (req.query.topicId) rows = rows.filter(row => row.latestQuestion?.concept?.topicId === req.query.topicId);
    const total = rows.length; return { items: await Promise.all(rows.slice(paging.skip, paging.skip + paging.size).map(row => reviewItemResponse(manager, row))), page: paging.page, size: paging.size, total };
  }))));
  router.get('/reviews/due', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw AppError.validation('date는 YYYY-MM-DD 형식이어야 합니다.');
    const rows = await repo(manager, ReviewMission).find({ where: { userId: req.user.sub }, order: { dueDate: 'ASC' } });
    return { date, items: rows.filter(row => String(row.dueDate).slice(0, 10) <= date).map(publicMission) };
  }))));
  router.get('/reviews/missions/:missionId', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const row = await repo(manager, ReviewMission).findOneBy({ missionId: id(req.params.missionId, 'missionId'), userId: req.user.sub }); if (!row) throw AppError.notFound('복습 임무를 찾을 수 없습니다.'); return publicMission(row);
  }))));
  router.post('/reviews/missions/:missionId/attempts', auth, asyncHandler(async (req, res) => data(res, await createReviewAttempt(req.user.sub, req.params.missionId), 201)));
  router.get('/review-attempts/:reviewAttemptId', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const attempt = await repo(manager, ReviewAttempt).findOneBy({ reviewAttemptId: id(req.params.reviewAttemptId, 'reviewAttemptId'), userId: req.user.sub }); if (!attempt) throw AppError.notFound('복습 응시를 찾을 수 없습니다.'); return reviewAttemptResponse(manager, attempt);
  }))));
  router.post('/review-attempts/:reviewAttemptId/answers', auth, asyncHandler(async (req, res) => data(res, await answerReview(req.user.sub, req.params.reviewAttemptId, req.body))));
  router.put('/questions/:questionId/bookmark', auth, asyncHandler(async (req, res) => data(res, await upsertBookmark(req.user.sub, req.params.questionId, true, req.body?.conceptId))));
  router.delete('/questions/:questionId/bookmark', auth, asyncHandler(async (req, res) => data(res, await upsertBookmark(req.user.sub, req.params.questionId, false))));

  // User profile, settings and economy.
  router.patch('/users/me', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    if (Object.keys(req.body || {}).some(key => key !== 'nickname') || req.body?.nickname === undefined) throw AppError.validation('nickname만 수정할 수 있습니다.');
    const user = await repo(manager, User).findOneBy({ userId: req.user.sub }); if (!user) throw AppError.notFound('사용자를 찾을 수 없습니다.');
    user.nickname = string(req.body.nickname, 'nickname', 30); user.nicknameUpdatedAt = new Date(); await repo(manager, User).save(user); return { userId: user.userId, nickname: user.nickname };
  }))));
  router.get('/users/me/notification-settings', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    let setting = await repo(manager, UserSetting).findOneBy({ userId: req.user.sub }); if (!setting) setting = await repo(manager, UserSetting).save(repo(manager, UserSetting).create({ userId: req.user.sub })); return notificationSetting.response(setting);
  }))));
  router.patch('/users/me/notification-settings', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const body = req.body || {}; const allowed = ['reminderEnabled', 'reminderTime', 'timezone'];
    if (Object.keys(body).some(key => !allowed.includes(key)) || typeof body.reminderEnabled !== 'boolean') throw AppError.validation('알림 설정 필드가 올바르지 않습니다.');
    if (body.reminderTime !== undefined && body.reminderTime !== null && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(body.reminderTime)) throw AppError.validation('reminderTime은 HH:MM 또는 HH:MM:SS여야 합니다.');
    if (body.timezone !== undefined) {
      const timezone = string(body.timezone, 'timezone', 50);
      try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch { throw AppError.validation('timezone은 IANA 시간대여야 합니다.'); }
    }
    let setting = await repo(manager, UserSetting).findOneBy({ userId: req.user.sub }); if (!setting) setting = repo(manager, UserSetting).create({ userId: req.user.sub });
    setting.reminderEnabled = body.reminderEnabled; if (body.reminderTime !== undefined) setting.reminderTime = body.reminderTime; if (body.timezone !== undefined) setting.timezone = string(body.timezone, 'timezone', 50); await repo(manager, UserSetting).save(setting); return notificationSetting.response(setting);
  }))));
  router.put('/users/me/character/class', auth, asyncHandler(async (req, res) => data(res, await changeClass(req.user.sub, req.body?.classId), 200)));
  router.patch('/users/me/character/class', auth, asyncHandler(async (req, res) => data(res, await changeClass(req.user.sub, req.body?.classId), 200)));
  router.get('/inventory', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const owned = await repo(manager, UserCostume).find({ where: { userId: req.user.sub }, relations: { costume: true } }); const equipped = await repo(manager, UserEquippedCostume).findBy({ userId: req.user.sub });
    return { items: owned.map(row => serializeCostume(row.costume, true, equipped.some(item => item.itemId === row.itemId))), equipped: equipped.map(row => ({ category: row.category, itemId: row.itemId })) };
  }))));
  router.put('/inventory/:itemId/equip', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const itemId = id(req.params.itemId, 'itemId'); const owned = await repo(manager, UserCostume).findOne({ where: { userId: req.user.sub, itemId }, relations: { costume: true } }); if (!owned?.costume) throw AppError.forbidden('보유하지 않은 코스튬입니다.');
    await repo(manager, UserEquippedCostume).upsert({ userId: req.user.sub, category: owned.costume.category, itemId, equippedAt: new Date() }, ['userId', 'category']); return { category: owned.costume.category, itemId };
  }))));
  router.get('/shop/costumes', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const p = page(req.query); const all = await repo(manager, Costume).find({ where: { isOnSale: true }, order: { sortOrder: 'ASC', itemId: 'ASC' } }); const rows = req.query.category ? all.filter(row => row.category === req.query.category) : all; const owned = await repo(manager, UserCostume).findBy({ userId: req.user.sub });
    return { items: rows.slice(p.skip, p.skip + p.size).map(row => serializeCostume(row, owned.some(item => item.itemId === row.itemId))), page: p.page, size: p.size, total: rows.length };
  }))));
  router.get('/shop/costumes/:itemId', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const row = await repo(manager, Costume).findOneBy({ itemId: id(req.params.itemId, 'itemId'), isOnSale: true }); if (!row) throw AppError.notFound('판매 중인 코스튬을 찾을 수 없습니다.'); const owned = await repo(manager, UserCostume).findOneBy({ userId: req.user.sub, itemId: row.itemId }); return serializeCostume(row, Boolean(owned));
  }))));
  router.post('/shop/purchases', auth, asyncHandler(async (req, res) => data(res, await purchase(req.user.sub, req.body), 201)));

  // Password reset, growth, reward ledger, home and statistics.
  router.post('/auth/password-reset/request', asyncHandler(async (req, res) => data(res, await passwordResetRequest(req.body?.email))));
  router.post('/auth/password-reset/confirm', asyncHandler(async (req, res) => data(res, await passwordResetConfirm(req.body?.resetToken, req.body?.newPassword))));
  router.get('/growth/me', auth, asyncHandler(async (req, res) => data(
    res,
    await AppDataSource.transaction(async manager => publicGrowth(
      await repo(manager, UserGrowth).findOneBy({ userId: req.user.sub }), req.user.sub,
    )),
  )));
  router.get('/users/me/reward-ledger', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const p = page(req.query);
    const [coins, exp] = await Promise.all([
      repo(manager, CoinLedger).find({ where: { userId: req.user.sub, transactionType: 'EARN', reason: 'STAGE_FIRST_CLEAR' }, order: { createdAt: 'DESC' } }),
      repo(manager, ExpLedger).find({ where: { userId: req.user.sub }, order: { createdAt: 'DESC' } }),
    ]);
    const items = [...coins.map(row => ({ type: 'COIN', id: row.coinLedgerId, amount: row.amount, balanceAfter: row.balanceAfter, reason: row.reason, refId: row.refId, createdAt: row.createdAt })), ...exp.map(row => ({ type: 'EXP', id: row.expLedgerId, totalExpAmount: row.totalExpAmount, economyExpAmount: row.economyExpAmount, sourceStageId: row.sourceStageId, createdAt: row.createdAt }))].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { items: items.slice(p.skip, p.skip + p.size), page: p.page, size: p.size, total: items.length };
  }))));
  router.get('/home/summary', auth, asyncHandler(async (req, res) => data(res, await summary(req.user.sub))));
  router.get('/mypage/summary', auth, asyncHandler(async (req, res) => data(res, await summary(req.user.sub))));
  router.get('/statistics/overall', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const attempts = await repo(manager, LearningAttempt).findBy({ userId: req.user.sub });
    if ((req.query.from && !/^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) || (req.query.to && !/^\d{4}-\d{2}-\d{2}$/.test(req.query.to))) throw AppError.validation('from과 to는 YYYY-MM-DD 형식이어야 합니다.');
    const from = req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : null;
    const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : null;
    const filtered = attempts.filter(row => (!from || row.startedAt >= from) && (!to || row.startedAt <= to));
    return { attempts: filtered.length, passedAttempts: filtered.filter(row => row.status === 'PASSED').length, failedAttempts: filtered.filter(row => row.status === 'FAILED').length, completedStages: new Set(filtered.filter(row => row.status === 'PASSED').map(row => row.stageId)).size };
  }))));
  router.get('/statistics/concepts', auth, asyncHandler(async (req, res) => data(res, await AppDataSource.transaction(async manager => {
    const concepts = await repo(manager, Concept).find({ where: { status: 'PUBLISHED' }, order: { title: 'ASC' } });
    const submissions = await repo(manager, QuestionSubmission).find({ where: { attempt: { userId: req.user.sub } }, relations: { attempt: true, question: true } });
    let rows = concepts.filter(concept => !req.query.topicId || concept.topicId === req.query.topicId).map(concept => { const mine = submissions.filter(row => row.question?.conceptId === concept.conceptId); return { conceptId: concept.conceptId, title: concept.title, attempts: mine.length, correct: mine.filter(row => row.isCorrect).length, accuracy: mine.length ? mine.filter(row => row.isCorrect).length / mine.length : 0 }; });
    if (req.query.sort === 'accuracy') rows.sort((a, b) => b.accuracy - a.accuracy); else if (req.query.sort === 'attempts') rows.sort((a, b) => b.attempts - a.attempts);
    const limit = req.query.limit === undefined ? rows.length : Math.min(100, Math.max(1, Number(req.query.limit))); if (!Number.isInteger(limit)) throw AppError.validation('limit은 정수여야 합니다.');
    return { items: rows.slice(0, limit), sort: req.query.sort || 'title' };
  }))));
  return router;
}

async function changeClass(userId, classId) {
  return AppDataSource.transaction(async manager => {
    const classRow = await repo(manager, CharacterClass).findOneBy({ classId: id(classId, 'classId') }); if (!classRow) throw AppError.notFound('직업을 찾을 수 없습니다.');
    let character = await repo(manager, UserCharacter).findOneBy({ userId }); if (!character) character = repo(manager, UserCharacter).create({ userId, classId: classRow.classId, firstSelectedAt: new Date() }); else { character.classId = classRow.classId; character.classChangedAt = new Date(); }
    await repo(manager, UserCharacter).save(character); return { userId, classId: classRow.classId, classCode: classRow.classCode };
  });
}

async function purchase(userId, body) {
  const itemId = id(body?.itemId, 'itemId'); const requestId = string(body?.requestId, 'requestId', 100);
  return AppDataSource.transaction(async manager => {
    const user = await repo(manager, User).findOne({ where: { userId }, lock: { mode: 'pessimistic_write' } });
    if (!user) throw AppError.notFound('사용자를 찾을 수 없습니다.');
    const existing = await repo(manager, CoinLedger).findOneBy({ userId, requestId });
    if (existing) {
      if (existing.refId !== itemId) throw AppError.conflict('requestId가 다른 상품 구매에 이미 사용되었습니다.');
      return { purchaseId: existing.coinLedgerId, itemId, duplicate: true, coinBalance: existing.balanceAfter };
    }
    const costume = await repo(manager, Costume).findOneBy({ itemId, isOnSale: true }); if (!costume || costume.priceCoin === null) throw AppError.notFound('판매 중인 코스튬을 찾을 수 없습니다.');
    if (await repo(manager, UserCostume).findOneBy({ userId, itemId })) throw AppError.conflict('이미 보유한 코스튬입니다.');
    const walletRepo = repo(manager, UserWallet); let wallet = await walletRepo.findOne({ where: { userId }, lock: { mode: 'pessimistic_write' } }); if (!wallet) wallet = await walletRepo.save(walletRepo.create({ userId }));
    if (wallet.coinBalance < costume.priceCoin) throw AppError.conflict('코인이 부족합니다.');
    const before = wallet.coinBalance; wallet.coinBalance -= costume.priceCoin; wallet.version += 1; await walletRepo.save(wallet);
    const ledger = await repo(manager, CoinLedger).save({ userId, transactionType: 'SPEND', reason: 'COSTUME_PURCHASE', amount: -costume.priceCoin, balanceBefore: before, balanceAfter: wallet.coinBalance, refType: 'COSTUME', refId: itemId, requestId });
    await repo(manager, UserCostume).save({ userId, itemId, acquireType: 'PURCHASE', coinLedgerId: ledger.coinLedgerId }); return { purchaseId: ledger.coinLedgerId, itemId, coinBalance: wallet.coinBalance };
  });
}

async function summary(userId) {
  return AppDataSource.transaction(async manager => {
    const [user, growth, wallet, progress] = await Promise.all([
      repo(manager, User).findOneBy({ userId }), repo(manager, UserGrowth).findOneBy({ userId }), repo(manager, UserWallet).findOneBy({ userId }),
      repo(manager, UserStageProgress).find({ where: { userId }, relations: { stage: true }, order: { startedAt: 'DESC' } }),
    ]);
    if (!user) throw AppError.notFound('사용자를 찾을 수 없습니다.');
    return { user: { userId: user.userId, nickname: user.nickname }, growth: publicGrowth(growth, userId),
      wallet: publicWallet(wallet, userId), activeStages: progress.filter(row => row.progressStatus === 'IN_PROGRESS').slice(0, 3).map(row => ({
        stageId: row.stageId, stage: row.stage ? publicStage(row.stage) : null, progressStatus: row.progressStatus,
        contentPosition: row.contentPosition, startedAt: row.startedAt,
      })), passedStageCount: progress.filter(row => row.progressStatus === 'PASSED').length };
  });
}

module.exports = routes();
