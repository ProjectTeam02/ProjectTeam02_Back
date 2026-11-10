/**
 * AI 튜터 요청 데이터 형식 파일
 * 대상: POST /tutor/conversations, GET /tutor/conversations, GET /tutor/conversations/:id/messages,
 *       POST /tutor/messages
 * 백엔드 작업: 앱 요청값을 검사·정규화해서 Service에 넘긴다.
 * 주의: 허용하지 않은 필드는 거절한다(422). context·knowledgeScope는 AI 서버 계약
 *       (ProjectTeam02_AI app/schemas/tutor.py TutorLearningContext·TutorKnowledgeScope)과 같은 키만 받는다.
 *
 * 대화방 생성 Body (모두 선택)
 *   entryPoint        'NAV' | 'CONCEPT' | 'QUIZ' | 'RESULT' | 'REVIEW'   (DB enum ai_entry_point)
 *   contextTopicId    uuid
 *   contextStageId    uuid
 *   contextConceptId  uuid
 *
 * 질문 전송 Body
 *   conversationId    uuid (필수)
 *   question          string 1~4000자 (필수, AI 서버 제한)
 *   modelTier         'BASIC' | 'ADVANCED' (기본 BASIC)
 *   clientMessageId   string 1~100자 (ai_messages.client_message_id varchar(100))
 *   context           { entryPoint?, topicId?, stageId?, conceptId?, conceptCode?, questionId?, attemptId? }
 *   knowledgeScope    { conceptCodes: string[] (최대 100개, 중복 불가, 각 1~30자) }
 * 질문 전송 Header
 *   Idempotency-Key   string 1~100자 (clientMessageId가 없으면 이 값을 clientMessageId로 저장하므로 DB 길이와 같게)
 *
 * 목록 Query
 *   page      1 이상 (기본 1)
 *   pageSize  1~100 (기본 20)
 */
const AppError = require('../../../common/errors/AppError');
const f = require('../../../common/dto/fields');

const LIMITS = Object.freeze({
  question: 4000,
  clientMessageId: 100,
  idempotencyKey: 100,
  conceptCode: 30,
  conceptCodes: 100,
});
const ENTRY_POINTS = ['NAV', 'CONCEPT', 'QUIZ', 'RESULT', 'REVIEW'];
const MODEL_TIERS = ['BASIC', 'ADVANCED'];

function parseConversation(body) {
  const value = f.onlyKeys(f.object(body, 'body'), ['entryPoint', 'contextTopicId', 'contextStageId', 'contextConceptId', 'stageId', 'conceptId'], 'body');
  return {
    entryPoint: value.entryPoint === undefined || value.entryPoint === null ? null : f.oneOf(value.entryPoint, ENTRY_POINTS, 'entryPoint'),
    contextTopicId: f.optionalUuid(value.contextTopicId, 'contextTopicId'),
    contextStageId: f.optionalUuid(value.contextStageId || value.stageId, 'stageId'),
    contextConceptId: f.optionalUuid(value.contextConceptId || value.conceptId, 'conceptId'),
  };
}

function parseContext(value) {
  if (value === undefined || value === null) return null;
  const context = f.onlyKeys(f.object(value, 'context'), ['entryPoint', 'topicId', 'stageId', 'conceptId', 'conceptCode', 'questionId', 'attemptId'], 'context');
  const parsed = {
    entryPoint: context.entryPoint === undefined || context.entryPoint === null ? null : f.oneOf(context.entryPoint, ENTRY_POINTS, 'context.entryPoint'),
    topicId: f.optionalUuid(context.topicId, 'context.topicId'),
    stageId: f.optionalUuid(context.stageId, 'context.stageId'),
    conceptId: f.optionalUuid(context.conceptId, 'context.conceptId'),
    conceptCode: f.optionalString(context.conceptCode, 'context.conceptCode', LIMITS.conceptCode),
    questionId: f.optionalUuid(context.questionId, 'context.questionId'),
    attemptId: f.optionalUuid(context.attemptId, 'context.attemptId'),
  };
  // null인 키는 빼고 보낸다. 모두 비었으면 context 자체를 null로.
  const compact = Object.fromEntries(Object.entries(parsed).filter(([, item]) => item !== null));
  return Object.keys(compact).length ? compact : null;
}

function parseKnowledgeScope(value) {
  if (value === undefined || value === null) return null;
  const scope = f.onlyKeys(f.object(value, 'knowledgeScope'), ['conceptCodes'], 'knowledgeScope');
  if (scope.conceptCodes === undefined) return { conceptCodes: [] };
  if (!Array.isArray(scope.conceptCodes)) throw AppError.validation('knowledgeScope.conceptCodes는 배열이어야 합니다.');
  if (scope.conceptCodes.length > LIMITS.conceptCodes) {
    throw AppError.validation(`knowledgeScope.conceptCodes는 최대 ${LIMITS.conceptCodes}개입니다.`);
  }
  const codes = scope.conceptCodes.map((code, index) => f.string(code, `knowledgeScope.conceptCodes[${index}]`, LIMITS.conceptCode));
  if (new Set(codes).size !== codes.length) throw AppError.validation('knowledgeScope.conceptCodes에 중복 값이 있습니다.');
  return { conceptCodes: codes };
}

function parseIdempotencyKey(headers = {}) {
  const key = headers['idempotency-key'];
  if (key === undefined) return null;
  return f.string(key, 'Idempotency-Key', LIMITS.idempotencyKey);
}

function parseMessage(body, headers) {
  const value = f.onlyKeys(f.object(body, 'body'), ['conversationId', 'question', 'modelTier', 'clientMessageId', 'context', 'knowledgeScope'], 'body');
  parseIdempotencyKey(headers); // 길이만 검사. 값은 Controller가 헤더에서 그대로 읽는다.
  return {
    conversationId: f.uuid(value.conversationId, 'conversationId'),
    question: f.string(value.question, 'question', LIMITS.question),
    modelTier: value.modelTier === undefined || value.modelTier === null ? 'BASIC' : f.oneOf(value.modelTier, MODEL_TIERS, 'modelTier'),
    clientMessageId: f.optionalString(value.clientMessageId, 'clientMessageId', LIMITS.clientMessageId),
    context: parseContext(value.context),
    knowledgeScope: parseKnowledgeScope(value.knowledgeScope),
  };
}

function parseListQuery(query) {
  const value = f.onlyKeys(f.object(query, 'query'), ['page', 'pageSize', 'size', 'cursor', 'limit'], 'query');
  const pageSize = value.pageSize || value.size || value.limit;
  return {
    page: String(f.positiveIntQuery(value.page, 'page', { fallback: 1 })),
    pageSize: String(f.positiveIntQuery(pageSize, 'size', { fallback: 20, max: 100 })),
    ...(value.cursor === undefined ? {} : { cursor: f.string(value.cursor, 'cursor', 255) }),
  };
}

function parseConversationId(params) {
  return { id: f.uuid(f.object(params, 'params').id, 'conversationId') };
}

module.exports = {
  LIMITS, ENTRY_POINTS, MODEL_TIERS,
  parseConversation, parseMessage, parseListQuery, parseConversationId, parseIdempotencyKey,
};
