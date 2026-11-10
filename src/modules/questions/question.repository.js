/** Generated-question persistence using the existing TypeORM entities only. */
const { randomUUID } = require('node:crypto');
const { Concept, Question, QuestionChoice } = require('@leren/database');
const AppError = require('../../common/errors/AppError');

async function saveDraft(manager, input, { status = 'GENERATED', generationRequestId = null } = {}) {
  const concept = await manager.getRepository(Concept).findOneBy({ conceptId: input.conceptId });
  if (!concept) throw AppError.notFound('해당 경제 개념을 찾을 수 없습니다.');

  const questionRepo = manager.getRepository(Question);
  // question_code is limited to 30 characters and unique with version.
  const questionCode = `Q${randomUUID().replace(/-/g, '').slice(0, 29)}`;
  const question = await questionRepo.save(questionRepo.create({
    questionCode,
    version: 1,
    supersedesQuestionId: null,
    conceptId: input.conceptId,
    questionType: 'MULTIPLE_CHOICE',
    questionText: input.questionText,
    explanation: input.explanation,
    keyPoint: input.keyPoint,
    difficulty: input.difficulty,
    generatedBy: 'AI',
    generationRequestId,
    sourceDocumentIds: input.sourceDocumentIds,
    status,
    reviewComment: null,
    reviewedBy: null,
    reviewedAt: null,
    publishedAt: null,
  }));
  const choicesRepo = manager.getRepository(QuestionChoice);
  await choicesRepo.save(input.choices.map((choice) => choicesRepo.create({
    questionId: question.questionId,
    baseOrder: choice.baseOrder,
    choiceText: choice.choiceText,
    isCorrect: choice.isCorrect,
    feedbackText: choice.feedbackText,
  })));
  return {
    questionId: question.questionId,
    questionCode,
    conceptId: input.conceptId,
    status,
    choiceCount: input.choices.length,
    sourceDocumentIds: input.sourceDocumentIds,
  };
}

function repository(dataSource) {
  return {
    async saveGeneratedDraft(input) {
      return dataSource.transaction(manager => saveDraft(manager, input));
    },
  };
}

module.exports = repository;
module.exports.saveDraft = saveDraft;
