/**
 * AI 튜터 대화 누적 요약 (P5)
 * 배경: AI 서버는 최근 12개 메시지·1200토큰(글자수/4)만 프롬프트에 넣고, 그보다 오래된 턴은
 *       Backend가 보낸 summary·summaryUntilSeq로만 기억한다 (AI app/rag/memory/history_manager.py).
 *       Backend가 요약을 만들지 않으면 6턴 정도가 지난 대화는 앞부분이 그대로 잘린다.
 * 정책
 *   - 아직 요약되지 않은 완료(COMPLETED) 메시지가 TRIGGER(10)개를 넘으면, 최근 KEEP_RECENT(6)개를 남기고
 *     그 앞의 턴을 요약에 넣는다. 끊는 위치는 항상 ASSISTANT 메시지(턴 끝)다.
 *   - LLM을 부르지 않는 결정적 축약: 학습자 질문 앞부분 + 튜터 답변 첫 문장. 원문이 아님을 머리말로 밝힌다.
 *   - 누적(rolling): 이전 요약 줄 + 새 줄. MAX_CHARS(1500)를 넘으면 오래된 줄부터 뺀다
 *     (AI는 요약을 앞에서부터 1600자까지만 쓰므로, 넘치면 최신 내용이 잘리는 것을 막기 위함).
 *   - 저장: tutor.ai_conversation_summaries에 1행 추가 + ai_conversations.summary·summary_until_seq 갱신 (같은 트랜잭션).
 *   - 답변 저장과 분리된 트랜잭션에서 실행하고, 실패해도 튜터 응답은 성공으로 둔다 (다음 요청에서 다시 시도).
 * 주의: 모든 조회는 요청한 사용자의 대화방(conversationId) 안에서만 한다. 요약 본문은 외부 API로 내보내지 않는다.
 */
const { AiConversation, AiConversationSummary, AiMessage } = require('@leren/database');

const POLICY = Object.freeze({
  triggerMessages: 10,
  keepRecent: 6,
  maxChars: 1500,
  questionChars: 100,
  answerChars: 140,
});
const HEADER = '[이전 대화 요약 · 자동 축약, 원문 아님]';
const OMITTED = '(더 오래된 대화 일부 생략)';

const clean = text => String(text || '').replace(/\s+/g, ' ').trim();

function clip(text, max) {
  const value = clean(text);
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function firstSentence(text, max) {
  const value = clean(text);
  const match = value.match(/^.+?(?:[.!?。]|다\.|요\.)(?=\s|$)/);
  return clip(match ? match[0] : value, max);
}

/** USER→ASSISTANT 순서의 완료 메시지를 턴 줄로 바꾼다. 짝이 없는 메시지는 건너뛴다 */
function turnLines(messages, policy = POLICY) {
  const lines = [];
  let question = null;
  for (const message of messages) {
    if (message.role === 'USER') question = message;
    else if (message.role === 'ASSISTANT' && question) {
      lines.push(`- 학습자: ${clip(question.content, policy.questionChars)} / 튜터: ${firstSentence(message.content, policy.answerChars)}`);
      question = null;
    }
  }
  return lines;
}

function previousLines(summary) {
  return String(summary || '').split('\n').filter(line => line.startsWith('- '));
}

function compose(lines, policy = POLICY) {
  const kept = [...lines];
  const render = omitted => [HEADER, ...(omitted ? [OMITTED] : []), ...kept].join('\n');
  let omitted = false;
  while (kept.length > 1 && render(omitted).length > policy.maxChars) {
    kept.shift();
    omitted = true;
  }
  const text = render(omitted);
  return text.length <= policy.maxChars ? text : text.slice(0, policy.maxChars);
}

/**
 * 요약이 필요한지 결정한다. 필요 없으면 null.
 * completed: 이 대화의 COMPLETED 메시지 (순서 무관), summaryUntilSeq: 현재 요약 끝 순번(없으면 null)
 */
function plan(completed, summaryUntilSeq, policy = POLICY) {
  const after = completed
    .filter(row => row.sequenceNo > (summaryUntilSeq || 0))
    .sort((a, b) => a.sequenceNo - b.sequenceNo);
  if (after.length <= policy.triggerMessages) return null;
  let cut = after.length - policy.keepRecent; // after[0..cut-1]을 요약
  while (cut > 0 && after[cut - 1].role !== 'ASSISTANT') cut -= 1;
  if (cut <= 0) return null;
  const covered = after.slice(0, cut);
  return { covered, untilSeq: covered[covered.length - 1].sequenceNo };
}

function buildContent(previousSummary, covered, policy = POLICY) {
  const lines = [...previousLines(previousSummary), ...turnLines(covered, policy)];
  if (!lines.length) return null;
  return compose(lines, policy);
}

/** 요약을 갱신하고 새 요약 행을 돌려준다. 바꿀 것이 없으면 null */
async function refresh(manager, conversationId, { policy = POLICY, requestId = null } = {}) {
  const conversations = manager.getRepository(AiConversation);
  const conversation = await conversations.findOneBy({ conversationId });
  if (!conversation) return null;
  const completed = await manager.getRepository(AiMessage).find({
    where: { conversationId, status: 'COMPLETED' },
    order: { sequenceNo: 'ASC' },
  });
  const decision = plan(completed, conversation.summaryUntilSeq, policy);
  if (!decision) return null;
  const content = buildContent(conversation.summary, decision.covered, policy);
  if (!content) return null;
  const summaries = manager.getRepository(AiConversationSummary);
  const row = await summaries.save(summaries.create({
    conversationId, summaryUntilSeq: decision.untilSeq, content,
    tokenCount: Math.max(1, Math.floor(content.length / 4)), requestId,
  }));
  await conversations.update({ conversationId }, { summary: content, summaryUntilSeq: decision.untilSeq });
  return row;
}

/** 답변을 만들 때 프롬프트에 넣은 요약 행 ID (ai_messages.summary_id 기록용) */
async function summaryIdFor(manager, conversation) {
  if (!conversation.summary || !conversation.summaryUntilSeq) return null;
  const row = await manager.getRepository(AiConversationSummary).findOneBy({
    conversationId: conversation.conversationId, summaryUntilSeq: conversation.summaryUntilSeq,
  });
  return row?.summaryId || null;
}

module.exports = { POLICY, HEADER, turnLines, firstSentence, plan, buildContent, refresh, summaryIdFor };
