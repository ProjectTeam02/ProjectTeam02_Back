const { Question, QuestionChoice } = require('@leren/database');
const AppError = require('../../common/errors/AppError');
const { PUBLIC_QUESTION_STATUS, hasAnswerKey } = require('../quizzes/question-pool-policy');

async function assertEligibleTutorQuestion(manager, questionId) {
  const notFound = () => AppError.notFound('추천할 수 있는 공개 문항을 찾을 수 없습니다.');

  if (typeof questionId !== 'string' ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(questionId)) {
    throw notFound();
  }

  const question = await manager.getRepository(Question).findOne({
    where: { questionId, status: PUBLIC_QUESTION_STATUS },
    relations: { concept: { topic: true } },
  });

  if (!question ||
      question.concept?.status !== 'PUBLISHED' ||
      question.concept?.topic?.status !== 'PUBLISHED') {
    throw notFound();
  }

  const choices = await manager.getRepository(QuestionChoice).find({
    where: { questionId },
  });

  if (!hasAnswerKey(choices.length, choices.filter(choice => choice.isCorrect).length)) {
    throw notFound();
  }

  return question;
}

module.exports = { assertEligibleTutorQuestion };
