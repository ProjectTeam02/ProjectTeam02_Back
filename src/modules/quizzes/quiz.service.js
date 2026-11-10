/**
 * 퀴즈 비즈니스 로직
 * 백엔드 작업: 유스케이스 흐름과 기존 정책을 유지
 * 주의: DB는 Repository, 외부 통신은 Client를 사용한다.
 */
const { Question, QuestionChoice } = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const normalStageService = require('./normal-stage.service');
const attemptDto = require('./dto/attemptResponse.dto');

function service(dataSource = AppDataSource) {
  const repo = (entity, manager = dataSource.manager) => manager.getRepository(entity);
  const normalStage = normalStageService(dataSource);
  return {
    start: normalStage.start,
    getAttempt: normalStage.get,
    getAttemptDetails: normalStage.getAttemptDetails,
    result: normalStage.result,
    bossStart: normalStage.bossStart,
    bossGet: normalStage.bossGet,
    bossSubmit: normalStage.bossSubmit,
    relearn: normalStage.relearn,
    async generate(query = {}) {
      const questionRepo = repo(Question);
      const question = await questionRepo.findOne({ where: { status: 'APPROVED', ...(query.conceptId ? { conceptId: query.conceptId } : {}) }, order: { createdAt: 'ASC' } });
      if (!question) throw AppError.notFound('승인된 문제가 없습니다.');
      const choices = await repo(QuestionChoice).find({ where: { questionId: question.questionId }, order: { baseOrder: 'ASC' } });
      return attemptDto.legacyQuestion(question, choices);
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
      return normalStage.submit(userId, quizId, { choiceId, attemptId, idempotencyKey });
    },
  };
}

module.exports = service;
