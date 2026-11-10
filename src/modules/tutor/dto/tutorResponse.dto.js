/**
 * AI 튜터 메시지·사용량 응답 데이터 형식 파일
 * 대상: GET /tutor/conversations/:id/messages, POST /tutor/messages, GET /tutor/usage
 * 백엔드 작업: AiMessage·AiMessageSource 엔티티와 AI 서버 응답을 앱에 보낼 형태로 변환
 * 주의: 내부 값(requestId, errorCode, rewrittenQuery, historyFromSeq, tokenCount, summaryId,
 *       parentMessageId, chunkId, 토큰 수·모델 ID·비용 등 usage)은 내보내지 않는다.
 *
 * message
 *   messageId        uuid
 *   conversationId   uuid
 *   sequenceNo       number  대화 안 순서 (1부터)
 *   role             'USER' | 'ASSISTANT'
 *   content          string
 *   clientMessageId  string | null  앱이 보낸 값 (USER 메시지만)
 *   status           'PENDING' | 'COMPLETED' | 'FAILED'
 *   groundingStatus  'GROUNDED' | 'INSUFFICIENT' | null  학습 자료 근거 충분 여부 (ASSISTANT만)
 *   createdAt        ISO 시각
 *   completedAt      ISO 시각 | null
 *   sources          source[]  답변 근거 (ASSISTANT만, rank 순)
 *
 * source
 *   rank         number  1부터
 *   documentId   string
 *   title        string | null  (ai_message_sources.title_snapshot)
 *   conceptCode  string | null
 *
 * 메시지 목록 data: { items: message[], total, page, pageSize }
 * 질문 전송 data: { userMessage, assistantMessage, quota: { dailyLimit, used, remaining } | null, duplicate? }
 *   duplicate: 같은 clientMessageId(또는 Idempotency-Key) 재요청이면 true, 이때 quota는 null
 * 사용량 data: { dailyLimit, used, remaining }
 */
const { iso } = require('../../../common/dto/fields');

function source(entity) {
  return {
    rank: entity.rank,
    documentId: entity.documentId,
    title: entity.titleSnapshot ?? null,
    conceptCode: entity.conceptCode ?? null,
  };
}

function message(entity, sources = []) {
  const isAssistant = entity.role === 'ASSISTANT';
  return {
    messageId: entity.messageId,
    conversationId: entity.conversationId,
    sequenceNo: entity.sequenceNo,
    role: entity.role,
    content: entity.content,
    clientMessageId: isAssistant ? null : (entity.clientMessageId ?? null),
    status: entity.status,
    groundingStatus: isAssistant ? (entity.groundingStatus ?? null) : null,
    createdAt: iso(entity.createdAt),
    completedAt: iso(entity.completedAt),
    sources: isAssistant ? [...sources].sort((a, b) => a.rank - b.rank).map(source) : [],
  };
}

function list({ items, total }, sourcesByMessage, { page, pageSize }) {
  return {
    items: items.map(item => message(item, sourcesByMessage.get(item.messageId) || [])),
    total, page, pageSize,
  };
}

/** quota.reserve 결과 { used(이번 요청 전), remaining(이번 요청 후) } → 이번 요청을 포함한 사용량 */
function quota(reserved, dailyLimit) {
  if (!reserved) return null;
  return { dailyLimit, used: reserved.used + 1, remaining: reserved.remaining };
}

function sendResult({ userMessage, assistantMessage, assistantSources, reserved, dailyLimit, duplicate = false }) {
  return {
    userMessage: message(userMessage),
    assistantMessage: message(assistantMessage, assistantSources),
    quota: duplicate ? null : quota(reserved, dailyLimit),
    ...(duplicate ? { duplicate: true } : {}),
  };
}

function usage({ dailyLimit, used, remaining }) {
  return { dailyLimit, used, remaining };
}

module.exports = { source, message, list, sendResult, usage };
