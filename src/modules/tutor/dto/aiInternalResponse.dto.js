/**
 * FastAPI → Node 내부 튜터 응답 데이터 형식 파일
 * 대상: POST {FASTAPI_BASE_URL}/internal/v1/tutor/answer 응답
 * 기준: ProjectTeam02_AI app/schemas/tutor.py InternalTutorResponse
 * 백엔드 작업: AI 응답을 DB에 저장하기 전에 형식과 DB 컬럼 길이를 검사한다.
 * 주의: 하나라도 맞지 않으면 저장하지 않고 503(SERVICE_UNAVAILABLE)으로 실패시킨다.
 *       (Service의 catch가 USER 메시지와 ai_requests를 FAILED로 표시한다.)
 *
 * requestId        uuid (보낸 값과 같아야 함)
 * answer           string (비어 있으면 안 됨)
 * rewrittenQuery   string | null
 * groundingStatus  'GROUNDED' | 'INSUFFICIENT'
 * historyFromSeq   number | null
 * sources[]        documentId ≤255, documentVersion ≤100, chunkId ≤255, titleSnapshot ≤500,
 *                  conceptCode ≤30, rank ≥1, relevanceScore 0~1 | null   (tutor.ai_message_sources)
 * usage            modelId ≤100, embeddingModelId ≤100, retrievalStrategy ≤50, currency 3자,
 *                  inputTokens·outputTokens·latencyMs ≥0 정수, cacheHit boolean, estimatedCost ≥0 (tutor.ai_requests)
 */
const AppError = require('../../../common/errors/AppError');

const SOURCE_LIMITS = Object.freeze({ documentId: 255, documentVersion: 100, chunkId: 255, titleSnapshot: 500, conceptCode: 30 });
const USAGE_LIMITS = Object.freeze({ modelId: 100, embeddingModelId: 100, retrievalStrategy: 50 });
const GROUNDING = ['GROUNDED', 'INSUFFICIENT'];

function invalid(field) {
  const error = AppError.unavailable('AI 서버 응답 형식이 올바르지 않습니다.');
  // 앱 응답(details)에는 내보내지 않고, 로그·테스트에서만 확인할 수 있게 둔다.
  error.invalidField = field;
  return error;
}

function text(value, field, max, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw invalid(field);
    return null;
  }
  if (typeof value !== 'string' || (required && !value.trim()) || [...value].length > max) throw invalid(field);
  return value;
}

function int(value, field, { min = 0, required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw invalid(field);
    return null;
  }
  if (!Number.isSafeInteger(value) || value < min) throw invalid(field);
  return value;
}

function number(value, field, { min = 0, max = Infinity } = {}) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw invalid(field);
  return value;
}

function source(item, index) {
  const field = name => `sources[${index}].${name}`;
  if (!item || typeof item !== 'object') throw invalid(`sources[${index}]`);
  return {
    documentId: text(item.documentId, field('documentId'), SOURCE_LIMITS.documentId, { required: true }),
    documentVersion: text(item.documentVersion, field('documentVersion'), SOURCE_LIMITS.documentVersion),
    chunkId: text(item.chunkId, field('chunkId'), SOURCE_LIMITS.chunkId, { required: true }),
    titleSnapshot: text(item.titleSnapshot, field('titleSnapshot'), SOURCE_LIMITS.titleSnapshot),
    conceptCode: text(item.conceptCode, field('conceptCode'), SOURCE_LIMITS.conceptCode),
    rank: int(item.rank, field('rank'), { min: 1, required: true }),
    relevanceScore: number(item.relevanceScore, field('relevanceScore'), { min: 0, max: 1 }),
  };
}

function usage(value) {
  if (!value || typeof value !== 'object') throw invalid('usage');
  if (typeof value.cacheHit !== 'boolean') throw invalid('usage.cacheHit');
  if (value.currency !== undefined && value.currency !== null && !/^[A-Z]{3}$/.test(value.currency)) throw invalid('usage.currency');
  return {
    modelId: text(value.modelId, 'usage.modelId', USAGE_LIMITS.modelId),
    embeddingModelId: text(value.embeddingModelId, 'usage.embeddingModelId', USAGE_LIMITS.embeddingModelId),
    inputTokens: int(value.inputTokens, 'usage.inputTokens'),
    outputTokens: int(value.outputTokens, 'usage.outputTokens'),
    latencyMs: int(value.latencyMs, 'usage.latencyMs', { required: true }),
    cacheHit: value.cacheHit,
    retrievalStrategy: text(value.retrievalStrategy, 'usage.retrievalStrategy', USAGE_LIMITS.retrievalStrategy, { required: true }),
    estimatedCost: number(value.estimatedCost, 'usage.estimatedCost'),
    currency: value.currency ?? null,
  };
}

function parse(body, expectedRequestId) {
  if (!body || typeof body !== 'object') throw invalid('body');
  if (body.requestId !== expectedRequestId) throw invalid('requestId');
  if (!GROUNDING.includes(body.groundingStatus)) throw invalid('groundingStatus');
  if (body.sources !== undefined && !Array.isArray(body.sources)) throw invalid('sources');
  const sources = (body.sources || []).map(source);
  if (new Set(sources.map(item => item.rank)).size !== sources.length) throw invalid('sources.rank');
  return {
    requestId: body.requestId,
    answer: text(body.answer, 'answer', Number.MAX_SAFE_INTEGER, { required: true }),
    rewrittenQuery: text(body.rewrittenQuery, 'rewrittenQuery', Number.MAX_SAFE_INTEGER),
    groundingStatus: body.groundingStatus,
    historyFromSeq: int(body.historyFromSeq, 'historyFromSeq', { min: 1 }),
    sources,
    usage: usage(body.usage),
  };
}

module.exports = { SOURCE_LIMITS, USAGE_LIMITS, parse };
