const {
  LearningAttempt, Stage, StageQuestion,
  BossAttemptQuestion, QuestionSubmission,
} = require('@leren/database');
const AppError = require('../../common/errors/AppError');
const { assertEligibleTutorQuestion } = require('./eligibleQuestion');

async function assertOwnedTutorAttemptQuestion(manager, userId, attemptId, questionId) {
  const unavailable = () => AppError.notFound('해당 응시에서 확인할 수 있는 문항이 아닙니다.');
  const repository = entity => manager.getRepository(entity);

  const attempt = await repository(LearningAttempt).findOneBy({ attemptId, userId });
  if (!attempt) throw unavailable();

  const question = await assertEligibleTutorQuestion(manager, questionId);

  const submitted = await repository(QuestionSubmission).existsBy({
    attemptId, questionId,
  });
  if (submitted) return question;

  if (attempt.status !== 'IN_PROGRESS') throw unavailable();

  const stage = await repository(Stage).findOneBy({ stageId: attempt.stageId });
  if (!stage || !['NORMAL', 'BOSS'].includes(stage.stageType)) throw unavailable();

  const questionOrder = attempt.submittedCount + 1;
  if (!Number.isSafeInteger(questionOrder) || questionOrder < 1 ||
      questionOrder > attempt.maxQuestionCount) throw unavailable();

  if (stage.stageType === 'BOSS') {
    const snapshots = repository(BossAttemptQuestion);
    const current = await snapshots.existsBy({ attemptId, questionOrder, questionId });
    if (current) return question;

    // 기존 퀴즈 서비스와 동일하게, 스냅샷이 없는 과거 응시만 Stage 배정으로 대체한다.
    if (await snapshots.existsBy({ attemptId })) throw unavailable();
  }

  const current = await repository(StageQuestion).existsBy({
    stageId: attempt.stageId, questionOrder, questionId,
  });
  if (!current) throw unavailable();

  return question;
}

module.exports = { assertOwnedTutorAttemptQuestion };
