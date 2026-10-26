const prismaDefault = require('../../config/prisma');
const AppError = require('../../common/errors/AppError');

function publicQuiz(quiz) {
  return { id: quiz.id, title: quiz.title, explanation: quiz.explanation, difficulty: quiz.difficulty, conceptId: quiz.conceptId, choices: quiz.choices.map(({ id, label, content }) => ({ id, label, content })) };
}

function service(db = prismaDefault) {
  return {
    async generate(query = {}) {
      const quiz = await db.quiz.findFirst({ where: { status: 'APPROVED', ...(query.conceptId ? { conceptId: query.conceptId } : {}) }, include: { choices: true }, orderBy: { createdAt: 'asc' } });
      if (!quiz) throw AppError.notFound('승인된 문제가 없습니다.');
      return publicQuiz(quiz);
    },
    async submit(userId, quizId, { choiceId, attemptId, idempotencyKey }) {
      const quiz = await db.quiz.findUnique({ where: { id: quizId }, include: { choices: true } });
      if (!quiz || quiz.status === 'DISABLED') throw AppError.notFound('문제를 찾을 수 없습니다.');
      const choice = quiz.choices.find((item) => item.id === choiceId);
      if (!choice) throw AppError.validation('해당 문제의 선택지가 아닙니다.');
      try {
        return await db.$transaction(async (tx) => {
          let attempt;
          if (attemptId) {
            attempt = await tx.quizAttempt.findFirst({ where: { id: attemptId, userId, quizId } });
            if (!attempt) throw AppError.notFound('시도 기록을 찾을 수 없습니다.');
            if (attempt.status === 'SUBMITTED') throw AppError.conflict('이미 제출한 문제입니다.');
          } else if (idempotencyKey) {
            attempt = await tx.quizAttempt.findFirst({ where: { userId, quizId, idempotencyKey }, include: { submissions: true } });
            if (attempt?.status === 'SUBMITTED') {
              const previous = attempt.submissions[0];
              if (previous?.choiceId !== choiceId) throw AppError.conflict('Idempotency-Key가 다른 답안에 이미 사용되었습니다.');
              return { attemptId: attempt.id, quizId, choiceId: previous.choiceId, isCorrect: previous.isCorrect, score: attempt.score, explanation: quiz.explanation, duplicate: true };
            }
          }
          if (!attempt) {
            attempt = await tx.quizAttempt.create({ data: { userId, quizId, idempotencyKey } });
          }
          const isCorrect = choice.isCorrect;
          const updated = await tx.quizAttempt.update({ where: { id: attempt.id }, data: { status: 'SUBMITTED', score: isCorrect ? 100 : 0, submittedAt: new Date(), submissions: { create: { choiceId, isCorrect } } }, include: { submissions: true } });
          return { attemptId: updated.id, quizId, choiceId, isCorrect, score: updated.score, explanation: quiz.explanation };
        });
      } catch (error) {
        if (error?.code === 'P2002') throw AppError.conflict('이미 처리된 제출입니다.');
        throw error;
      }
    },
  };
}

module.exports = service;
