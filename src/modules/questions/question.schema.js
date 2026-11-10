/**
 * Generated-question draft validation. The AI response contract is provisional:
 * the AI team must agree to this JSON shape before the live integration.
 */
const AppError = require('../../common/errors/AppError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIFFICULTIES = new Set(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);

function requiredText(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw AppError.validation(`${field}: 1~${maxLength}자의 문자열이 필요합니다.`);
  }
  return value.trim();
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null) return null;
  return requiredText(value, field, maxLength);
}

function generatedDraft({ body }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.validation('문제 생성 결과는 JSON 객체여야 합니다.');
  }
  if (typeof body.conceptId !== 'string' || !UUID.test(body.conceptId)) {
    throw AppError.validation('유효한 conceptId(UUID)가 필요합니다.');
  }
  if (!Array.isArray(body.choices) || body.choices.length !== 4) {
    throw AppError.validation('객관식 선택지는 정확히 4개여야 합니다.');
  }

  const choices = body.choices.map((choice, index) => {
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
      throw AppError.validation(`choices[${index}]: 선택지 객체가 필요합니다.`);
    }
    if (typeof choice.isCorrect !== 'boolean') {
      throw AppError.validation(`choices[${index}].isCorrect: boolean 값이 필요합니다.`);
    }
    return {
      baseOrder: index + 1,
      choiceText: requiredText(choice.text, `choices[${index}].text`, 255),
      isCorrect: choice.isCorrect,
      feedbackText: optionalText(choice.feedbackText, `choices[${index}].feedbackText`, 255),
    };
  });
  if (choices.filter((choice) => choice.isCorrect).length !== 1) {
    throw AppError.validation('정답 선택지는 정확히 1개여야 합니다.');
  }
  const normalizedChoices = choices.map((choice) => choice.choiceText.toLocaleLowerCase('ko-KR').replace(/\s+/g, ' '));
  if (new Set(normalizedChoices).size !== 4) {
    throw AppError.validation('중복된 선택지 내용이 있습니다.');
  }

  if (!Array.isArray(body.sourceDocumentIds) || !body.sourceDocumentIds.length || body.sourceDocumentIds.length > 20) {
    throw AppError.validation('sourceDocumentIds: 근거 문서 ID가 1~20개 필요합니다.');
  }
  const sourceDocumentIds = body.sourceDocumentIds.map((value, index) =>
    requiredText(value, `sourceDocumentIds[${index}]`, 255));
  if (new Set(sourceDocumentIds).size !== sourceDocumentIds.length) {
    throw AppError.validation('중복된 근거 문서 ID가 있습니다.');
  }
  if (body.difficulty != null && !DIFFICULTIES.has(body.difficulty)) {
    throw AppError.validation('difficulty는 BEGINNER, INTERMEDIATE, ADVANCED 중 하나여야 합니다.');
  }
  return { body: {
    conceptId: body.conceptId,
    questionText: requiredText(body.questionText, 'questionText', 5000),
    explanation: requiredText(body.explanation, 'explanation', 5000),
    keyPoint: optionalText(body.keyPoint, 'keyPoint', 255),
    difficulty: body.difficulty || null,
    sourceDocumentIds,
    choices,
  } };
}

module.exports = { generatedDraft };
