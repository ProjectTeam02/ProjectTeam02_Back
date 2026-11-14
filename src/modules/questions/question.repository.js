/** Generated-question persistence using the existing TypeORM entities only. */
const { randomUUID } = require('node:crypto');
const { Concept, Question, QuestionChoice } = require('@leren/database');
const AppError = require('../../common/errors/AppError');

// #97 DB 제약 위반 → 422 (입력 검증을 통과했는데 DB 규칙에 걸린 경우, 503으로 숨기지 않음)
const QUESTION_CONSTRAINTS = new Set(['uq_question_choices_one_correct', 'chk_choices_choice_text',
  'chk_questions_question_text', 'chk_questions_explanation', 'chk_questions_ai_sources']);
function constraintViolation(error) {
  const code = error?.driverError?.code ?? error?.code;
  const constraint = error?.driverError?.constraint ?? error?.constraint;
  return ['23505', '23514'].includes(code) && QUESTION_CONSTRAINTS.has(constraint) ? constraint : null;
}

async function saveDraft(manager, input, options = {}) {
  try {
    return await insertDraft(manager, input, options);
  } catch (error) {
    const constraint = constraintViolation(error);
    if (constraint) throw AppError.validation(`문제 저장 규칙을 위반했습니다 (${constraint}).`);
    throw error;
  }
}

async function insertDraft(manager, input, { status = 'GENERATED', generationRequestId = null } = {}) {
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
    questionCategory: input.questionCategory ?? null,
    learningObjective: input.learningObjective ?? null,
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
