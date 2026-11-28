/**
 * AI 튜터 테스트용 가짜 저장소·AI 응답 (tutor-dto.test.js, tutor-ai-contract.test.js 공용)
 * fakeDataSource({ concepts }): 개념 행을 넣으면 #171 개념 코드 검증(conceptScope)도 같은 저장소로 테스트할 수 있다
 */
const crypto = require('node:crypto');
const { AiConversation, AiConversationSummary, AiMessage, AiMessageSource, AiRequest, Concept } = require('@leren/database');

function aiAnswer(requestId, overrides = {}) {
  return {
    requestId, answer: '기회비용은 포기한 것 중 가장 큰 가치입니다.', rewrittenQuery: '기회비용 정의',
    groundingStatus: 'GROUNDED', historyFromSeq: 1,
    sources: [{ documentId: 'doc-1', documentVersion: 'v1', chunkId: 'chunk-1', titleSnapshot: '기회비용', conceptCode: 'ECO-01', rank: 1, relevanceScore: 0.82 }],
    usage: { modelId: 'model-a', embeddingModelId: 'embed-a', inputTokens: 100, outputTokens: 50, latencyMs: 900, cacheHit: false, retrievalStrategy: 'hybrid', estimatedCost: 0.0012, currency: 'USD' },
    ...overrides,
  };
}

function fakeDataSource({
  concepts = [],
  approvedDocuments = [{ document_id: 'doc-1', review_status: 'approved' }],
} = {}) {
  const tables = new Map([[AiConversation, []], [AiConversationSummary, []], [AiMessage, []], [AiMessageSource, []], [AiRequest, []], [Concept, concepts]]);
  const keyOf = new Map([[AiConversation, 'conversationId'], [AiConversationSummary, 'summaryId'], [AiMessage, 'messageId'], [AiMessageSource, 'messageSourceId'], [AiRequest, 'requestId'], [Concept, 'conceptId']]);
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'type' in value && 'value' in value) {
      if (value.type === 'in') return value.value.includes(row[key]);
      return true; // 날짜·Not 조건은 이 테스트에서 따지지 않는다
    }
    return row[key] === value;
  });
  const sortRows = (rows, order = {}) => {
    const [[key, direction] = []] = Object.entries(order);
    return key ? [...rows].sort((a, b) => (a[key] > b[key] ? 1 : -1) * (direction === 'DESC' ? -1 : 1)) : rows;
  };
  const repo = entity => {
    const rows = tables.get(entity);
    return {
      create: value => ({ ...value }),
      async save(value) {
        const key = keyOf.get(entity);
        const existing = rows.find(row => value[key] && row[key] === value[key]);
        if (existing) return Object.assign(existing, value);
        const row = { [key]: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...value };
        rows.push(row);
        return row;
      },
      findOneBy: async where => rows.find(row => matches(row, where)) || null,
      findOne: async ({ where }) => rows.find(row => matches(row, where)) || null,
      findBy: async where => rows.filter(row => matches(row, where)),
      async find({ where, order, take }) { return sortRows(rows.filter(row => matches(row, where)), order).slice(0, take); },
      async findAndCount({ where, order, skip, take }) {
        const found = sortRows(rows.filter(row => matches(row, where)), order);
        return [found.slice(skip, skip + take), found.length];
      },
      async update(where, patch) { rows.filter(row => matches(row, where)).forEach(row => Object.assign(row, patch)); },
      count: async ({ where }) => rows.filter(row => row.userId === where.userId).length,
    };
  };
  const manager = {
    getRepository: repo,
    async query(sql, parameters = []) {
      if (/pg_advisory_xact_lock/i.test(sql)) return [];
      if (/FROM\s+ai\.rag_documents/i.test(sql)) {
        const ids = parameters[0] || [];
        return approvedDocuments.filter(row => ids.includes(row.document_id));
      }
      throw new Error('Unexpected SQL in tutor fake');
    },
  };
  return { tables, manager, transaction: async fn => fn(manager) };
}

module.exports = { aiAnswer, fakeDataSource };
