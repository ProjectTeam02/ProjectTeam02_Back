
const { Concept, Question, ReviewItem } = require('@leren/database');
const AppError = require('../../common/errors/AppError');
const { createReviewMission } = require('./autoReview.repository');

async function findLocked(manager, userId, questionCode) {
  // Reuse the bookmark lock even if no review item exists.
  await manager.query(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    [`bookmark:${userId}:${questionCode}`]
  );

  return manager.getRepository(ReviewItem).findOneBy({
    userId,
    questionCode,
  });
}

function recordAnswer(item, isCorrect) {
  item.lastAnswerResult = isCorrect ? 'CORRECT' : 'WRONG';
  item.lastAnsweredAt = new Date();

  if (!isCorrect) {
    item.wrongCount += 1;
  }
}

async function collectWrongAnswer(manager, {
  userId,
  question,
  stageId,
}) {
  const items = manager.getRepository(ReviewItem);

  let item = await findLocked(
    manager,
    userId,
    question.questionCode
  );

  const latest = item && item.latestQuestionId !== question.questionId
    ? await manager.getRepository(Question).findOneBy({
        questionId: item.latestQuestionId,
      })
    : question;

  if (!item) {
    item = items.create({
      userId,
      questionCode: question.questionCode,
      firstReason: 'WRONG',
      wrongCount: 0,
    });
  }

  if (
    !item.latestQuestionId ||
    !latest ||
    latest.version < question.version
  ) {
    const concept = await manager
      .getRepository(Concept)
      .findOneBy({
        conceptId: question.conceptId,
      });

    if (!concept) {
      throw AppError.unavailable(
        '문항의 개념 정보가 없습니다.'
      );
    }

    item.latestQuestionId = question.questionId;
    item.conceptCode = concept.conceptCode;
  }

  item.sourceStageId ??= stageId;

  recordAnswer(item, false);

  await items.save(item);

  // 오답 저장과 같은 트랜잭션에서 복습 미션 발급.
  await createReviewMission(manager, {
    userId,
    conceptCode: item.conceptCode,
    firstRegisteredAt: item.lastAnsweredAt,
  });

  return item;
}

module.exports = {
  findLocked,
  recordAnswer,
  collectWrongAnswer,
};
