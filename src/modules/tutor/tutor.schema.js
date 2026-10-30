/**
 * AI Tutor 요청값 검증
 * 백엔드 작업: API 입력 데이터의 유효성 규칙을 관리
 * 주의: 기존 필드명과 오류 응답 형식을 유지한다.
 */
const crypto = require('node:crypto');
const AppError = require('../../common/errors/AppError');

function string(value, name, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw AppError.validation(`${name}이(가) 올바르지 않습니다.`);
  return value.trim();
}

function uuid(value, name) {
  if (!value || !crypto.randomUUID || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw AppError.validation(`${name}이(가) 올바른 UUID가 아닙니다.`);
  }
  return string(value, name, 100);
}

function message({ body }) {
  const conversationId = uuid(body.conversationId, 'conversationId');
  const question = string(body.question, 'question');
  const modelTier = body.modelTier || 'BASIC';
  if (!['BASIC', 'ADVANCED'].includes(modelTier)) throw AppError.validation('modelTier가 올바르지 않습니다.');
  return { body: { conversationId, question, modelTier, clientMessageId: body.clientMessageId ? string(body.clientMessageId, 'clientMessageId', 200) : null, context: body.context || null, knowledgeScope: body.knowledgeScope || null } };
}

function conversation({ body }) {
  return { body: { entryPoint: body.entryPoint ? string(body.entryPoint, 'entryPoint', 100) : null, contextTopicId: body.contextTopicId || null, contextStageId: body.contextStageId || null, contextConceptId: body.contextConceptId || null } };
}

module.exports = { message, conversation };
