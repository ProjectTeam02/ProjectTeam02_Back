/**
 * Node → FastAPI 내부 튜터 요청 데이터 형식 파일
 * 대상: POST {FASTAPI_BASE_URL}/internal/v1/tutor/answer
 * 기준: ProjectTeam02_AI app/schemas/tutor.py InternalTutorRequest (extra="forbid")
 * 백엔드 작업: 대화방·이전 메시지·검증된 앱 요청으로 AI 서버 요청 본문을 만든다.
 * 주의: AI 서버는 모르는 키를 거절한다. 키를 추가하려면 AI 레포 계약을 먼저 바꾼다.
 *
 * requestId        uuid
 * conversationId   uuid
 * userId           uuid
 * question         string 1~4000자
 * modelTier        'BASIC' | 'ADVANCED'
 * history          { sequenceNo, role, content }[]  최대 50개, sequenceNo 오름차순·중복 없음, content 1~4000자
 * summary          string | null    ┐ 둘 다 있거나 둘 다 null
 * summaryUntilSeq  number | null    ┘
 * context          TutorLearningContext | null
 * knowledgeScope   { conceptCodes: string[] } | null
 */
const MAX_HISTORY = 50;
const MAX_CONTENT = 4000;

function historyItems(rows) {
  return rows
    .filter(row => typeof row.content === 'string' && row.content.trim())
    .slice(-MAX_HISTORY)
    .map(row => ({ sequenceNo: row.sequenceNo, role: row.role, content: row.content.trim().slice(0, MAX_CONTENT) }));
}

function build({ requestId, conversation, userId, input, historyRows }) {
  const summary = conversation.summary && conversation.summaryUntilSeq ? conversation.summary : null;
  return {
    requestId,
    conversationId: conversation.conversationId,
    userId,
    question: input.question,
    modelTier: input.modelTier,
    history: historyItems(historyRows),
    summary,
    summaryUntilSeq: summary ? conversation.summaryUntilSeq : null,
    context: input.context ?? null,
    knowledgeScope: input.knowledgeScope ?? null,
  };
}

module.exports = { MAX_HISTORY, build };
