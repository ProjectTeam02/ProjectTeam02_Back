const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { AiConversation, AiMessage, AiMessageSource, AiRequest } = require('@leren/database');
const request = require('../src/modules/tutor/dto/tutorRequest.dto');
const conversationDto = require('../src/modules/tutor/dto/conversationResponse.dto');
const messageDto = require('../src/modules/tutor/dto/tutorResponse.dto');
const aiRequestDto = require('../src/modules/tutor/dto/aiInternalRequest.dto');
const aiResponseDto = require('../src/modules/tutor/dto/aiInternalResponse.dto');
const schema = require('../src/modules/tutor/tutor.schema');
const tutorService = require('../src/modules/tutor/tutor.service');

const isValidation = error => error.statusCode === 422 && error.code === 'VALIDATION_ERROR';
const isUnavailable = error => error.statusCode === 503 && error.code === 'SERVICE_UNAVAILABLE';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/* ---------- 요청 DTO ---------- */

test('tutor conversation request: entryPoint enum, uuid context, unknown field rejected', () => {
  assert.deepEqual(request.parseConversation(undefined), { entryPoint: null, contextTopicId: null, contextStageId: null, contextConceptId: null });
  const parsed = request.parseConversation({ entryPoint: 'QUIZ', contextStageId: id(1).toUpperCase() });
  assert.equal(parsed.entryPoint, 'QUIZ');
  assert.equal(parsed.contextStageId, id(1));
  assert.throws(() => request.parseConversation({ entryPoint: 'home' }), isValidation);
  assert.throws(() => request.parseConversation({ contextTopicId: 'topic-1' }), isValidation);
  assert.throws(() => request.parseConversation({ userId: id(9) }), isValidation);
});

test('tutor message request: required fields, defaults and DB length limits', () => {
  const parsed = request.parseMessage({ conversationId: id(1), question: '  기회비용이 뭐야?  ' }, {});
  assert.deepEqual(parsed, { conversationId: id(1), question: '기회비용이 뭐야?', modelTier: 'BASIC', clientMessageId: null, context: null, knowledgeScope: null });
  assert.throws(() => request.parseMessage({ question: 'q' }, {}), isValidation);
  assert.throws(() => request.parseMessage({ conversationId: id(1), question: '   ' }, {}), isValidation);
  assert.throws(() => request.parseMessage({ conversationId: id(1), question: 'x'.repeat(4001) }, {}), isValidation);
  assert.throws(() => request.parseMessage({ conversationId: id(1), question: 'q', modelTier: 'PRO' }, {}), isValidation);
  assert.throws(() => request.parseMessage({ conversationId: id(1), question: 'q', clientMessageId: 'x'.repeat(101) }, {}), isValidation);
  assert.throws(() => request.parseMessage({ conversationId: id(1), question: 'q' }, { 'idempotency-key': 'x'.repeat(101) }), isValidation);
  assert.throws(() => request.parseMessage({ conversationId: id(1), question: 'q', extra: 1 }, {}), isValidation);
});

test('tutor message request: context and knowledgeScope follow the AI server contract', () => {
  const parsed = request.parseMessage({
    conversationId: id(1), question: 'q',
    context: { entryPoint: 'CONCEPT', conceptId: id(2), conceptCode: 'ECO-01', stageId: null },
    knowledgeScope: { conceptCodes: ['ECO-01', 'ECO-02'] },
  }, {});
  assert.deepEqual(parsed.context, { entryPoint: 'CONCEPT', conceptId: id(2), conceptCode: 'ECO-01' });
  assert.deepEqual(parsed.knowledgeScope, { conceptCodes: ['ECO-01', 'ECO-02'] });
  assert.equal(request.parseMessage({ conversationId: id(1), question: 'q', context: {} }, {}).context, null);
  assert.throws(() => request.parseMessage({ conversationId: id(1), question: 'q', context: { userId: id(3) } }, {}), isValidation);
  assert.throws(() => request.parseMessage({ conversationId: id(1), question: 'q', context: { conceptCode: 'x'.repeat(31) } }, {}), isValidation);
  assert.throws(() => request.parseMessage({ conversationId: id(1), question: 'q', knowledgeScope: { conceptCodes: ['A', 'A'] } }, {}), isValidation);
  assert.throws(() => request.parseMessage({ conversationId: id(1), question: 'q', knowledgeScope: { conceptCodes: 'A' } }, {}), isValidation);
});

test('tutor list and messages schema validate page, pageSize and conversation id', () => {
  assert.deepEqual(schema.list({ query: {} }), { query: { page: '1', pageSize: '20' } });
  assert.deepEqual(schema.messages({ params: { id: id(1) }, query: { page: '2', pageSize: '50' } }), { params: { id: id(1) }, query: { page: '2', pageSize: '50' } });
  assert.throws(() => schema.list({ query: { pageSize: '101' } }), isValidation);
  assert.throws(() => schema.list({ query: { page: '0' } }), isValidation);
  assert.throws(() => schema.list({ query: { sort: 'asc' } }), isValidation);
  assert.throws(() => schema.messages({ params: { id: 'bad' }, query: {} }), isValidation);
});

/* ---------- 응답 DTO ---------- */

const now = new Date('2026-11-10T01:00:00.000Z');

test('tutor conversation response hides userId and summary', () => {
  const data = conversationDto.conversation({
    conversationId: id(1), userId: id(9), entryPoint: 'NAV', contextTopicId: null, contextStageId: null,
    contextConceptId: null, contextQuestionId: null, contextAttemptId: null, title: null, status: 'ACTIVE',
    summary: '내부 요약', summaryUntilSeq: 10, createdAt: now, updatedAt: now,
  });
  assert.deepEqual(Object.keys(data).sort(), ['contextConceptId', 'contextStageId', 'contextTopicId', 'conversationId', 'createdAt', 'entryPoint', 'status', 'title', 'updatedAt']);
  assert.equal(data.createdAt, now.toISOString());
});

test('tutor message response hides internal AI fields and orders sources by rank', () => {
  const assistant = {
    messageId: id(2), conversationId: id(1), parentMessageId: id(3), sequenceNo: 2, role: 'ASSISTANT', inputType: null,
    clientMessageId: null, contextStageId: null, contextConceptId: null, content: '답변', rewrittenQuery: '재작성 질문',
    historyFromSeq: 1, tokenCount: 30, summaryId: null, status: 'COMPLETED', groundingStatus: 'GROUNDED',
    errorCode: null, requestId: id(4), createdAt: now, completedAt: now,
  };
  const data = messageDto.message(assistant, [
    { messageSourceId: id(5), messageId: id(2), documentId: 'doc-2', chunkId: 'c2', titleSnapshot: '두 번째', conceptCode: null, rank: 2, relevanceScore: '0.5' },
    { messageSourceId: id(6), messageId: id(2), documentId: 'doc-1', chunkId: 'c1', titleSnapshot: '첫 번째', conceptCode: 'ECO-01', rank: 1, relevanceScore: '0.9' },
  ]);
  for (const hidden of ['rewrittenQuery', 'historyFromSeq', 'tokenCount', 'summaryId', 'errorCode', 'requestId', 'parentMessageId']) {
    assert.equal(hidden in data, false, hidden);
  }
  assert.deepEqual(data.sources, [
    { rank: 1, documentId: 'doc-1', title: '첫 번째', conceptCode: 'ECO-01' },
    { rank: 2, documentId: 'doc-2', title: '두 번째', conceptCode: null },
  ]);
  const user = messageDto.message({ ...assistant, role: 'USER', clientMessageId: 'c-1', groundingStatus: null });
  assert.equal(user.clientMessageId, 'c-1');
  assert.deepEqual(user.sources, []);
});

/* ---------- 내부 AI 요청·응답 DTO ---------- */

function aiAnswer(requestId, overrides = {}) {
  return {
    requestId, answer: '기회비용은 포기한 것 중 가장 큰 가치입니다.', rewrittenQuery: '기회비용 정의',
    groundingStatus: 'GROUNDED', historyFromSeq: 1,
    sources: [{ documentId: 'doc-1', documentVersion: 'v1', chunkId: 'chunk-1', titleSnapshot: '기회비용', conceptCode: 'ECO-01', rank: 1, relevanceScore: 0.82 }],
    usage: { modelId: 'model-a', embeddingModelId: 'embed-a', inputTokens: 100, outputTokens: 50, latencyMs: 900, cacheHit: false, retrievalStrategy: 'hybrid', estimatedCost: 0.0012, currency: 'USD' },
    ...overrides,
  };
}

test('AI internal response is checked against DB column lengths before saving', () => {
  const requestId = id(7);
  assert.equal(aiResponseDto.parse(aiAnswer(requestId), requestId).sources[0].conceptCode, 'ECO-01');
  const bad = (overrides, field) => assert.throws(() => aiResponseDto.parse(aiAnswer(requestId, overrides), requestId),
    error => isUnavailable(error) && error.invalidField === field && error.details === undefined);
  bad({ requestId: id(8) }, 'requestId');
  bad({ answer: '' }, 'answer');
  bad({ groundingStatus: 'OK' }, 'groundingStatus');
  bad({ sources: [{ ...aiAnswer(requestId).sources[0], conceptCode: 'x'.repeat(31) }] }, 'sources[0].conceptCode');
  bad({ sources: [{ ...aiAnswer(requestId).sources[0], relevanceScore: 1.5 }] }, 'sources[0].relevanceScore');
  bad({ usage: { ...aiAnswer(requestId).usage, retrievalStrategy: 'x'.repeat(51) } }, 'usage.retrievalStrategy');
  bad({ usage: undefined }, 'usage');
});

test('AI internal request keeps the latest 50 history items and sends summary only as a pair', () => {
  const rows = Array.from({ length: 60 }, (_, index) => ({ sequenceNo: index + 1, role: index % 2 ? 'ASSISTANT' : 'USER', content: `m${index + 1}` }));
  const body = aiRequestDto.build({
    requestId: id(7), userId: id(9), historyRows: rows,
    conversation: { conversationId: id(1), summary: '요약', summaryUntilSeq: null },
    input: { question: 'q', modelTier: 'BASIC', context: null, knowledgeScope: null },
  });
  assert.equal(body.history.length, 50);
  assert.equal(body.history[0].sequenceNo, 11);
  assert.equal(body.summary, null);
  assert.equal(body.summaryUntilSeq, null);
  assert.deepEqual(Object.keys(body).sort(), ['context', 'conversationId', 'history', 'knowledgeScope', 'modelTier', 'question', 'requestId', 'summary', 'summaryUntilSeq', 'userId']);
});

/* ---------- Service가 DTO 형식으로 응답하는지 (가짜 저장소) ---------- */

function fakeDataSource() {
  const tables = new Map([[AiConversation, []], [AiMessage, []], [AiMessageSource, []], [AiRequest, []]]);
  const keyOf = new Map([[AiConversation, 'conversationId'], [AiMessage, 'messageId'], [AiMessageSource, 'messageSourceId'], [AiRequest, 'requestId']]);
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
  const manager = { getRepository: repo };
  return { tables, manager, transaction: async fn => fn(manager) };
}

test('tutor service returns DTO shapes and never exposes AI usage or cost', async () => {
  const dataSource = fakeDataSource();
  let sent;
  const aiClient = { answer: async body => { sent = body; return aiAnswer(body.requestId); } };
  const service = tutorService(dataSource, aiClient);
  const userId = id(9);

  const conversation = await service.createConversation(userId, { entryPoint: 'NAV', contextTopicId: null, contextStageId: null, contextConceptId: null });
  assert.equal('userId' in conversation, false);

  const result = await service.sendMessage(userId, { conversationId: conversation.conversationId, question: '기회비용?', modelTier: 'BASIC', clientMessageId: 'c-1', context: null, knowledgeScope: null }, null);
  assert.deepEqual(Object.keys(result).sort(), ['assistantMessage', 'quota', 'userMessage']);
  assert.equal(result.userMessage.sequenceNo, 1);
  assert.equal(result.assistantMessage.sequenceNo, 2);
  assert.equal(result.assistantMessage.groundingStatus, 'GROUNDED');
  assert.deepEqual(result.assistantMessage.sources, [{ rank: 1, documentId: 'doc-1', title: '기회비용', conceptCode: 'ECO-01' }]);
  assert.equal(result.quota.used, 1);
  assert.equal(JSON.stringify(result).includes('estimatedCost'), false);
  assert.equal(JSON.stringify(result).includes('rewrittenQuery'), false);
  assert.equal(sent.history.length, 0); // 이번 질문은 history가 아니라 question으로 보낸다

  const duplicate = await service.sendMessage(userId, { conversationId: conversation.conversationId, question: '기회비용?', modelTier: 'BASIC', clientMessageId: 'c-1', context: null, knowledgeScope: null }, null);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.quota, null);
  assert.equal(duplicate.assistantMessage.sources.length, 1);

  const page = await service.messages(userId, conversation.conversationId, { skip: 0, take: 20, page: 1, pageSize: 20 });
  assert.deepEqual({ total: page.total, page: page.page, pageSize: page.pageSize }, { total: 2, page: 1, pageSize: 20 });
  assert.equal(page.items[1].sources[0].title, '기회비용');
  assert.equal('requestId' in page.items[0], false);

  const list = await service.listConversations(userId, { skip: 0, take: 20, page: 1, pageSize: 20 });
  assert.equal(list.items[0].conversationId, conversation.conversationId);
  assert.deepEqual(Object.keys(await service.usage(userId)).sort(), ['dailyLimit', 'remaining', 'used']);
});

test('tutor service continues sequenceNo after 50 messages and marks invalid AI answers as FAILED', async () => {
  const dataSource = fakeDataSource();
  const userId = id(9);
  const conversationId = id(1);
  dataSource.tables.get(AiConversation).push({ conversationId, userId, summary: null, summaryUntilSeq: null });
  for (let n = 1; n <= 60; n += 1) {
    dataSource.tables.get(AiMessage).push({ messageId: crypto.randomUUID(), conversationId, sequenceNo: n, role: n % 2 ? 'USER' : 'ASSISTANT', content: `m${n}`, status: 'COMPLETED' });
  }
  let sent;
  const ok = tutorService(dataSource, { answer: async body => { sent = body; return aiAnswer(body.requestId); } });
  const result = await ok.sendMessage(userId, { conversationId, question: 'q', modelTier: 'BASIC', clientMessageId: null, context: null, knowledgeScope: null }, null);
  assert.equal(result.userMessage.sequenceNo, 61);
  assert.equal(sent.history[0].sequenceNo, 11);
  assert.equal(sent.history.at(-1).sequenceNo, 60);

  const broken = tutorService(dataSource, { answer: async body => aiAnswer(body.requestId, { sources: [{ ...aiAnswer(body.requestId).sources[0], conceptCode: 'x'.repeat(31) }] }) });
  await assert.rejects(
    broken.sendMessage(userId, { conversationId, question: 'q2', modelTier: 'BASIC', clientMessageId: null, context: null, knowledgeScope: null }, null),
    isUnavailable,
  );
  const failed = dataSource.tables.get(AiMessage).find(row => row.content === 'q2');
  assert.equal(failed.status, 'FAILED');
  assert.equal(dataSource.tables.get(AiMessageSource).some(row => row.conceptCode?.length > 30), false);
});

/* ---------- #99 저장 흐름 ---------- */

test('#99: 튜터 저장 키는 대화방 단위로 구분하고 100자 이하다', () => {
  const { tutorKey } = require('../src/modules/tutor/tutor.service');
  const a = tutorKey(id(1), 'c-1');
  const b = tutorKey(id(2), 'c-1');
  assert.notEqual(a, b);
  assert.match(a, /^TUTOR:[0-9a-f]{64}$/);
  assert.ok(a.length <= 100);
});

test('#99: 다른 대화방에서 같은 clientMessageId를 써도 각각 정상 처리된다', async () => {
  const dataSource = fakeDataSource();
  const userId = id(9);
  const service = tutorService(dataSource, { answer: async body => aiAnswer(body.requestId) });
  const first = await service.createConversation(userId, { entryPoint: 'NAV' });
  const second = await service.createConversation(userId, { entryPoint: 'NAV' });
  for (const conversation of [first, second]) {
    const result = await service.sendMessage(userId, { conversationId: conversation.conversationId, question: '물가?', modelTier: 'BASIC', clientMessageId: 'same-id', context: null, knowledgeScope: null }, null);
    assert.equal(result.assistantMessage.status, 'COMPLETED');
  }
  const keys = dataSource.tables.get(AiRequest).map(row => row.idempotencyKey);
  assert.equal(new Set(keys).size, 2);
});

test('#99: 답변 생성 중 같은 대화방 요청(동시 요청)은 409', async () => {
  const dataSource = fakeDataSource();
  const userId = id(9);
  const service = tutorService(dataSource, { answer: async body => aiAnswer(body.requestId) });
  const conversation = await service.createConversation(userId, { entryPoint: 'NAV' });
  const violation = Object.assign(new Error('duplicate key'), { driverError: { code: '23505', constraint: 'uq_ai_messages_one_pending_answer' } });
  dataSource.transaction = async () => { throw violation; };
  await assert.rejects(
    service.sendMessage(userId, { conversationId: conversation.conversationId, question: 'q', modelTier: 'BASIC', clientMessageId: null, context: null, knowledgeScope: null }, null),
    error => error.statusCode === 409,
  );
});

test('#99: 처리 중·실패한 clientMessageId 재전송은 409, history에는 완료된 메시지만', async () => {
  const dataSource = fakeDataSource();
  const userId = id(9);
  let sent;
  const service = tutorService(dataSource, { answer: async body => { sent = body; return aiAnswer(body.requestId); } });
  const conversation = await service.createConversation(userId, { entryPoint: 'NAV' });
  const messages = dataSource.tables.get(AiMessage);
  const pendingUser = { messageId: crypto.randomUUID(), conversationId: conversation.conversationId, sequenceNo: 1, role: 'USER', content: '처리 중 질문', clientMessageId: 'p-1', status: 'PENDING' };
  messages.push(pendingUser, { messageId: crypto.randomUUID(), conversationId: conversation.conversationId, parentMessageId: pendingUser.messageId, sequenceNo: 2, role: 'ASSISTANT', content: '', status: 'PENDING' });
  await assert.rejects(
    service.sendMessage(userId, { conversationId: conversation.conversationId, question: '처리 중 질문', modelTier: 'BASIC', clientMessageId: 'p-1', context: null, knowledgeScope: null }, null),
    error => error.statusCode === 409 && /처리 중/.test(error.message),
  );
  messages.forEach(row => { row.status = 'FAILED'; });
  await assert.rejects(
    service.sendMessage(userId, { conversationId: conversation.conversationId, question: '처리 중 질문', modelTier: 'BASIC', clientMessageId: 'p-1', context: null, knowledgeScope: null }, null),
    error => error.statusCode === 409 && /실패/.test(error.message),
  );
  const result = await service.sendMessage(userId, { conversationId: conversation.conversationId, question: '새 질문', modelTier: 'BASIC', clientMessageId: 'n-1', context: null, knowledgeScope: null }, null);
  assert.equal(result.userMessage.sequenceNo, 3);
  assert.equal(sent.history.length, 0); // FAILED 메시지는 history에서 제외
});
