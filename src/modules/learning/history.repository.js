const { LearningAttempt, QuestionSubmission } = require('@leren/database');
const { In } = require('typeorm');

module.exports = function repository(manager) {
  const attempts = manager.getRepository(LearningAttempt);
  const submissions = manager.getRepository(QuestionSubmission);
  return {
    list: (userId, { status, skip, take }) => attempts.findAndCount({
      where: { userId, ...(status ? { status } : {}) },
      relations: { stage: { topic: true } },
      order: { startedAt: 'DESC', attemptId: 'DESC' }, skip, take,
    }),
    ownAttempt: (userId, attemptId) => attempts.findOne({
      where: { userId, attemptId }, relations: { stage: { topic: true } },
    }),
    // Only IDs from the authenticated user's current page may be passed here.
    countsFor: attemptIds => attemptIds.length ? submissions.find({
      where: { attemptId: In(attemptIds) }, select: { attemptId: true, isCorrect: true },
    }) : Promise.resolve([]),
    detailsFor: attemptId => submissions.find({
      where: { attemptId },
      relations: { question: { concept: true }, choice: true },
      order: { sequenceNo: 'ASC', submissionId: 'ASC' },
    }),
  };
};
