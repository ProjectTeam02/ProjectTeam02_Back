/**
 * P0~P2 확장 API 응답 DTO.
 * 엔티티를 그대로 반환하지 않고 공개 계약에 필요한 필드만 명시적으로 변환한다.
 */
const { iso } = require('../../../common/dto/fields');

function choice(row) {
  if (!row) return null;
  return { choiceId: row.choiceId, label: String.fromCharCode(64 + row.baseOrder), content: row.choiceText };
}

function question(row, choices = []) {
  if (!row) return null;
  return {
    questionId: row.questionId,
    questionCode: row.questionCode,
    question: row.questionText,
    difficulty: row.difficulty,
    conceptId: row.conceptId,
    choices: choices.map(choice),
  };
}

function stage(row) {
  if (!row) return null;
  return {
    stageId: row.stageId,
    stageCode: row.stageCode,
    stageNo: row.stageNo,
    stageType: row.stageType,
    title: row.title,
    description: row.description,
    estimatedMinMinutes: row.estimatedMinMinutes,
    estimatedMaxMinutes: row.estimatedMaxMinutes,
    maxQuestionCount: row.maxQuestionCount,
    requiredCorrectCount: row.requiredCorrectCount,
    initialMonsterHp: row.initialMonsterHp,
    monsterName: row.monsterName,
    monsterImageKey: row.monsterImageKey,
    topicId: row.topicId,
  };
}

function mission(row) {
  if (!row) return null;
  return {
    missionId: row.missionId,
    conceptCode: row.conceptCode,
    firstRegisteredAt: row.firstRegisteredAt,
    dueDate: row.dueDate,
    status: row.status,
    targetQuestionCount: row.targetQuestionCount,
    notifiedAt: row.notifiedAt,
    completedAt: row.completedAt,
  };
}

function growth(row, userId) {
  return row ? {
    userId: row.userId || userId,
    totalExp: row.totalExp,
    totalLevel: row.totalLevel,
    economyExp: row.economyExp,
    economyLevel: row.economyLevel,
    lastLevelUpAt: iso(row.lastLevelUpAt),
  } : { userId, totalExp: 0, totalLevel: 1, economyExp: 0, economyLevel: 1, lastLevelUpAt: null };
}

function wallet(row, userId) {
  return row ? { userId: row.userId || userId, coinBalance: row.coinBalance, version: row.version } : { userId, coinBalance: 0, version: 0 };
}

function costume(row, owned = false, equipped = false) {
  if (!row) return null;
  return {
    itemId: row.itemId,
    costumeCode: row.costumeCode,
    name: row.name,
    description: row.description,
    flavorText: row.flavorText,
    category: row.category,
    priceCoin: row.priceCoin,
    imageKey: row.imageKey,
    thumbnailKey: row.thumbnailKey,
    isOnSale: row.isOnSale,
    owned,
    equipped,
  };
}

function reviewItem(item, questionRow, choices) {
  if (!item) return null;
  return {
    reviewItemId: item.reviewItemId,
    questionId: questionRow?.questionId,
    questionCode: item.questionCode,
    conceptCode: item.conceptCode,
    sourceStageId: item.sourceStageId,
    firstReason: item.firstReason,
    wrongCount: item.wrongCount,
    isBookmarked: item.isBookmarked,
    question: question(questionRow, choices),
  };
}

function reviewAttempt(attempt, submissions = []) {
  return {
    reviewAttemptId: attempt.reviewAttemptId,
    missionId: attempt.missionId,
    status: attempt.status,
    reviewType: attempt.reviewType,
    entryPoint: attempt.entryPoint,
    conceptCode: attempt.conceptCode,
    questionCount: attempt.questionCount,
    submittedCount: attempt.submittedCount,
    correctCount: attempt.correctCount,
    startedAt: iso(attempt.startedAt),
    completedAt: iso(attempt.completedAt),
    answers: submissions.map(row => ({
      submissionId: row.submissionId,
      questionId: row.questionId,
      sequenceNo: row.sequenceNo,
      choiceId: row.choiceId,
      isCorrect: row.isCorrect,
      explanation: row.submittedAt ? row.question?.explanation : null,
    })),
  };
}

function progress(row, stageRow) {
  return {
    userId: row.userId,
    stageId: row.stageId,
    stage: stage(stageRow || row.stage),
    progressStatus: row.progressStatus,
    contentPosition: row.contentPosition,
    startedAt: iso(row.startedAt),
    contentPositionUpdatedAt: iso(row.contentPositionUpdatedAt),
  };
}

function updated(row) {
  return {
    userId: row.userId,
    stageId: row.stageId,
    progressStatus: row.progressStatus,
    contentPosition: row.contentPosition,
    contentPositionUpdatedAt: iso(row.contentPositionUpdatedAt),
    startedAt: iso(row.startedAt),
  };
}

function rewardCoin(row) {
  return { type: 'COIN', id: row.coinLedgerId, amount: row.amount, balanceAfter: row.balanceAfter,
    reason: row.reason, refId: row.refId, createdAt: iso(row.createdAt) };
}

function rewardExp(row) {
  return { type: 'EXP', id: row.expLedgerId, totalExpAmount: row.totalExpAmount,
    economyExpAmount: row.economyExpAmount, sourceStageId: row.sourceStageId, createdAt: iso(row.createdAt) };
}

function statisticsOverall(attempts) {
  return {
    attempts: attempts.length,
    passedAttempts: attempts.filter(row => row.status === 'PASSED').length,
    failedAttempts: attempts.filter(row => row.status === 'FAILED').length,
    completedStages: new Set(attempts.filter(row => row.status === 'PASSED').map(row => row.stageId)).size,
  };
}

function conceptStatistics(concepts, submissions, query = {}) {
  const rows = concepts.filter(concept => !query.topicId || concept.topicId === query.topicId).map(concept => {
    const mine = submissions.filter(row => row.question?.conceptId === concept.conceptId);
    const correct = mine.filter(row => row.isCorrect).length;
    return { conceptId: concept.conceptId, title: concept.title, attempts: mine.length, correct,
      accuracy: mine.length ? correct / mine.length : 0 };
  });
  if (query.sort === 'accuracy') rows.sort((a, b) => b.accuracy - a.accuracy);
  else if (query.sort === 'attempts') rows.sort((a, b) => b.attempts - a.attempts);
  const limit = query.limit === undefined ? rows.length : query.limit;
  return { items: rows.slice(0, limit), sort: query.sort || 'title' };
}

module.exports = {
  choice, question, stage, mission, growth, wallet, costume, reviewItem, reviewAttempt,
  progress, updated, rewardCoin, rewardExp, statisticsOverall, conceptStatistics,
};
