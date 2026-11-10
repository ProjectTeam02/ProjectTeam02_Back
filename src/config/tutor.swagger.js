/**
 * AI 튜터 Swagger 정의
 * 기준: src/modules/tutor/dto/*.dto.js (요청 검사·응답 필드가 바뀌면 같이 고친다)
 */
const uuid = { type: 'string', format: 'uuid' };
const nullableUuid = { ...uuid, nullable: true };
const dateTime = { type: 'string', format: 'date-time' };
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const entryPoint = { type: 'string', enum: ['NAV', 'CONCEPT', 'QUIZ', 'RESULT', 'REVIEW'] };
const bearer = [{ bearerAuth: [] }];
const error = { description: '오류', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const ok = (description, schema) => ({ description, content: { 'application/json': { schema: {
  type: 'object', required: ['success', 'data'], properties: { success: { type: 'boolean', example: true }, data: schema },
} } } });
const page = { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } };
const pageSize = { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } };
const pageFields = { total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' } };

const schemas = {
  TutorConversationRequest: {
    type: 'object', additionalProperties: false,
    properties: { entryPoint, contextTopicId: uuid, contextStageId: uuid, contextConceptId: uuid },
  },
  TutorConversation: {
    type: 'object', required: ['conversationId', 'status', 'createdAt', 'updatedAt'],
    properties: {
      conversationId: uuid, entryPoint: { ...entryPoint, nullable: true },
      contextTopicId: nullableUuid, contextStageId: nullableUuid, contextConceptId: nullableUuid,
      title: { type: 'string', nullable: true }, status: { type: 'string', enum: ['ACTIVE', 'ARCHIVED'] },
      createdAt: dateTime, updatedAt: dateTime,
    },
  },
  TutorMessageRequest: {
    type: 'object', required: ['conversationId', 'question'], additionalProperties: false,
    properties: {
      conversationId: uuid,
      question: { type: 'string', minLength: 1, maxLength: 4000 },
      modelTier: { type: 'string', enum: ['BASIC', 'ADVANCED'], default: 'BASIC' },
      clientMessageId: { type: 'string', minLength: 1, maxLength: 100, description: '앱이 만든 중복 방지 ID (UUID 권장)' },
      context: {
        type: 'object', nullable: true, additionalProperties: false,
        properties: {
          entryPoint, topicId: uuid, stageId: uuid, conceptId: uuid,
          conceptCode: { type: 'string', maxLength: 30 }, questionId: uuid, attemptId: uuid,
        },
      },
      knowledgeScope: {
        type: 'object', nullable: true, additionalProperties: false,
        properties: { conceptCodes: { type: 'array', maxItems: 100, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 30 } } },
      },
    },
  },
  TutorSource: {
    type: 'object', required: ['rank', 'documentId'],
    properties: {
      rank: { type: 'integer', minimum: 1 }, documentId: { type: 'string' },
      title: { type: 'string', nullable: true }, conceptCode: { type: 'string', nullable: true },
    },
  },
  TutorMessage: {
    type: 'object', required: ['messageId', 'conversationId', 'sequenceNo', 'role', 'content', 'status', 'createdAt', 'sources'],
    properties: {
      messageId: uuid, conversationId: uuid, sequenceNo: { type: 'integer', minimum: 1 },
      role: { type: 'string', enum: ['USER', 'ASSISTANT'] }, content: { type: 'string' },
      clientMessageId: { type: 'string', nullable: true, description: 'USER 메시지만' },
      status: { type: 'string', enum: ['PENDING', 'COMPLETED', 'FAILED'] },
      groundingStatus: { type: 'string', enum: ['GROUNDED', 'INSUFFICIENT'], nullable: true, description: 'ASSISTANT 메시지만' },
      createdAt: dateTime, completedAt: { ...dateTime, nullable: true },
      sources: { type: 'array', items: ref('TutorSource'), description: 'ASSISTANT 메시지만, rank 순' },
    },
  },
  TutorUsage: {
    type: 'object', required: ['dailyLimit', 'used', 'remaining'],
    properties: { dailyLimit: { type: 'integer' }, used: { type: 'integer' }, remaining: { type: 'integer' } },
  },
  TutorSendResult: {
    type: 'object', required: ['userMessage', 'assistantMessage', 'quota'],
    properties: {
      userMessage: ref('TutorMessage'), assistantMessage: ref('TutorMessage'),
      quota: { allOf: [ref('TutorUsage')], nullable: true, description: '이번 질문을 포함한 오늘 사용량. 중복 요청이면 null' },
      duplicate: { type: 'boolean', description: '같은 clientMessageId(Idempotency-Key) 재요청이면 true' },
    },
  },
};

const paths = {
  '/api/v1/tutor/conversations': {
    post: {
      tags: ['AI Tutor'], security: bearer, summary: '대화방 생성',
      requestBody: { content: { 'application/json': { schema: ref('TutorConversationRequest') } } },
      responses: { 201: ok('생성 성공', ref('TutorConversation')), 401: error, 422: error },
    },
    get: {
      tags: ['AI Tutor'], security: bearer, summary: '대화방 목록 (최근 대화 순)', parameters: [page, pageSize],
      responses: { 200: ok('목록 조회', { type: 'object', properties: { items: { type: 'array', items: ref('TutorConversation') }, ...pageFields } }), 401: error, 422: error },
    },
  },
  '/api/v1/tutor/conversations/{id}/messages': {
    get: {
      tags: ['AI Tutor'], security: bearer, summary: '대화 메시지 목록 (sequenceNo 순)',
      parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }, page, pageSize],
      responses: { 200: ok('목록 조회', { type: 'object', properties: { items: { type: 'array', items: ref('TutorMessage') }, ...pageFields } }), 401: error, 404: error, 422: error },
    },
  },
  '/api/v1/tutor/messages': {
    post: {
      tags: ['AI Tutor'], security: bearer, summary: 'AI 튜터 질문',
      parameters: [{ name: 'Idempotency-Key', in: 'header', schema: { type: 'string', minLength: 1, maxLength: 100 }, description: 'clientMessageId가 없을 때 중복 방지 키로 사용' }],
      requestBody: { required: true, content: { 'application/json': { schema: ref('TutorMessageRequest') } } },
      responses: {
        201: ok('답변 저장', ref('TutorSendResult')), 401: error, 404: error,
        409: { ...error, description: '같은 키로 다른 질문을 보냈거나 같은 요청이 처리 중' },
        422: error, 429: { ...error, description: '오늘 사용량 초과' },
        503: { ...error, description: 'AI 서버 연결 실패·시간 초과 또는 잘못된 응답' },
      },
    },
  },
  '/api/v1/tutor/usage': {
    get: { tags: ['AI Tutor'], security: bearer, summary: '오늘 AI 사용량', responses: { 200: ok('사용량', ref('TutorUsage')), 401: error } },
  },
};

module.exports = { schemas, paths };
