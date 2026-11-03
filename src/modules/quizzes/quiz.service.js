const { Question, QuestionChoice, LearningAttempt, QuestionSubmission } = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');

function publicQuiz(question, choices) {
  return {
    id: question.questionId,
    title: question.questionText,
    explanation: question.explanation,
    difficulty: question.difficulty,
    conceptId: question.conceptId,
    choices: choices.map((choice) => ({ id: choice.choiceId, label: String.fromCharCode(64 + choice.baseOrder), content: choice.choiceText }))
  };
}

function service(dataSource = AppDataSource) {
  const repo = (entity, manager = dataSource.manager) => manager.getRepository(entity);
  return {
    async generate(query = {}) {
      const questionRepo = repo(Question);
      const question = await questionRepo.findOne({ where: { status: 'APPROVED', ...(query.conceptId ? { conceptId: query.conceptId } : {}) }, order: { createdAt: 'ASC' } });
      if (!question) throw AppError.notFound('승인된 문제가 없습니다.');
      const choices = await repo(QuestionChoice).find({ where: { questionId: question.questionId }, order: { baseOrder: 'ASC' } });
      return publicQuiz(question, choices);
    },
    async submit(userId, quizId, { choiceId, attemptId, idempotencyKey }) {
      if (!attemptId) throw AppError.validation('TypeORM 학습 기록과 연결하려면 attemptId가 필요합니다.');
      const question = await repo(Question).findOneBy({ questionId: quizId });
      if (!question || ['RETIRED', 'REJECTED'].includes(question.status)) throw AppError.notFound('문제를 찾을 수 없습니다.');
      const choice = await repo(QuestionChoice).findOneBy({ choiceId, questionId: quizId });
      if (!choice) throw AppError.validation('해당 문제의 선택지가 아닙니다.');
      return dataSource.transaction(async (manager) => {
        const attemptRepo = repo(LearningAttempt, manager);
        const submissionRepo = repo(QuestionSubmission, manager);
        const attempt = await attemptRepo.findOneBy({ attemptId, userId });
        if (!attempt) throw AppError.notFound('시도 기록을 찾을 수 없습니다.');
        const previous = await submissionRepo.findOneBy({ attemptId, questionId: quizId });
        if (previous) throw AppError.conflict('이미 제출한 문제입니다.');
        const isCorrect = Boolean(choice.isCorrect);
        const sequenceNo = (attempt.submittedCount || 0) + 1;
        const hpBefore = Math.max(0, attempt.initialHp - (attempt.submittedCount || 0));
        const hpAfter = Math.max(0, hpBefore - (isCorrect ? 0 : 1));
        const submission = submissionRepo.create({ submissionId: require('node:crypto').randomUUID(), attemptId, questionId: quizId, sequenceNo, displayedChoiceOrder: [], choiceId, selectedPosition: choice.baseOrder, isCorrect, hpBefore, hpAfter });
        await submissionRepo.save(submission);
        await attemptRepo.update({ attemptId }, { submittedCount: sequenceNo, correctCount: (attempt.correctCount || 0) + (isCorrect ? 1 : 0), finalHp: hpAfter });
        return { attemptId, quizId, choiceId, isCorrect, score: isCorrect ? 100 : 0, explanation: question.explanation };
      });
    },
  };
}

module.exports = service;
