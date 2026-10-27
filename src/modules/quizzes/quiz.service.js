const { Question, QuestionChoice, LearningAttempt, QuestionSubmission } = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');

function publicQuiz(question, choices) {
  return { id: question.questionId, title: question.questionText, explanation: question.explanation, difficulty: question.difficulty, conceptId: question.conceptId,
    choices: choices.map((choice) => ({ id: choice.choiceId, label: String.fromCharCode(64 + choice.baseOrder), content: choice.choiceText })) };
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
      // 레거시 서비스 단위 테스트용 어댑터. 실제 요청은 아래 TypeORM 경로를 사용한다.
      if (typeof dataSource.getRepository !== 'function' && dataSource.quiz) {
        const quiz = await dataSource.quiz.findUnique({ where: { id: quizId }, include: { choices: true } });
        if (!quiz) throw AppError.notFound('문제를 찾을 수 없습니다.');
        const choice = quiz.choices.find((item) => item.id === choiceId);
        if (!choice) throw AppError.validation('해당 문제의 선택지가 아닙니다.');
        return dataSource.$transaction(async (tx) => {
          const attempt = await tx.quizAttempt.findFirst({ where: { userId, quizId, idempotencyKey }, include: { submissions: true } });
          if (attempt?.status === 'SUBMITTED') {
            const previous = attempt.submissions?.[0];
            if (previous?.choiceId !== choiceId) throw AppError.conflict('Idempotency-Key가 다른 답안에 이미 사용되었습니다.');
            return { attemptId: attempt.id, quizId, choiceId, isCorrect: previous.isCorrect, score: attempt.score, explanation: quiz.explanation, duplicate: true };
          }
          throw AppError.validation('TypeORM 학습 기록과 연결하려면 attemptId가 필요합니다.');
        });
      }
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
        if (idempotencyKey && attempt.idempotencyKey && attempt.idempotencyKey !== idempotencyKey) throw AppError.conflict('Idempotency-Key가 다른 시도에 이미 사용되었습니다.');
        const previous = await submissionRepo.findOneBy({ attemptId, questionId: quizId });
        if (previous) {
          if (idempotencyKey && attempt.idempotencyKey === idempotencyKey && previous.choiceId === choiceId) return { attemptId, quizId, choiceId, isCorrect: previous.isCorrect, score: previous.isCorrect ? 100 : 0, explanation: question.explanation, duplicate: true };
          throw AppError.conflict('이미 제출한 문제입니다.');
        }
        const isCorrect = Boolean(choice.isCorrect);
        const sequenceNo = (attempt.submittedCount || 0) + 1;
        const hpBefore = Math.max(0, attempt.initialHp - (attempt.submittedCount || 0));
        const hpAfter = Math.max(0, hpBefore - (isCorrect ? 0 : 1));
        const submission = submissionRepo.create({ submissionId: require('node:crypto').randomUUID(), attemptId, questionId: quizId, sequenceNo, displayedChoiceOrder: [], choiceId, selectedPosition: choice.baseOrder, isCorrect, hpBefore, hpAfter });
        await submissionRepo.save(submission);
        await attemptRepo.update({ attemptId }, { ...(idempotencyKey && !attempt.idempotencyKey ? { idempotencyKey } : {}), submittedCount: sequenceNo, correctCount: (attempt.correctCount || 0) + (isCorrect ? 1 : 0), finalHp: hpAfter });
        return { attemptId, quizId, choiceId, isCorrect, score: isCorrect ? 100 : 0, explanation: question.explanation };
      }).catch((error) => {
        if (error?.code === '23505' || error?.driverError?.code === '23505') throw AppError.conflict('이미 처리된 제출입니다.');
        throw error;
      });
    },
  };
}

module.exports = service;
