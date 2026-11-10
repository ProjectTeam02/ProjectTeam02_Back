/**
 * AI 튜터 대화방 응답 데이터 형식 파일
 * 대상: POST /tutor/conversations (data), GET /tutor/conversations (data.items[])
 * 백엔드 작업: AiConversation 엔티티를 앱에 보낼 형태로 변환
 * 주의: userId, summary, summaryUntilSeq 등 내부 값은 내보내지 않는다.
 *
 * conversation
 *   conversationId    uuid
 *   entryPoint        'NAV' | 'CONCEPT' | 'QUIZ' | 'RESULT' | 'REVIEW' | null
 *   contextTopicId    uuid | null
 *   contextStageId    uuid | null
 *   contextConceptId  uuid | null
 *   title             string | null
 *   status            'ACTIVE' | 'ARCHIVED'
 *   createdAt         ISO 시각
 *   updatedAt         ISO 시각
 *
 * 목록 data: { items: conversation[], total, page, pageSize }
 */
const { iso } = require('../../../common/dto/fields');

function conversation(entity) {
  return {
    conversationId: entity.conversationId,
    entryPoint: entity.entryPoint ?? null,
    contextTopicId: entity.contextTopicId ?? null,
    contextStageId: entity.contextStageId ?? null,
    contextConceptId: entity.contextConceptId ?? null,
    title: entity.title ?? null,
    status: entity.status ?? 'ACTIVE',
    createdAt: iso(entity.createdAt),
    updatedAt: iso(entity.updatedAt),
  };
}

function list({ items, total }, { page, pageSize }) {
  return { items: items.map(conversation), total, page, pageSize };
}

module.exports = { conversation, list };
