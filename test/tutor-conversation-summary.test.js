const assert = require('node:assert/strict');
const test = require('node:test');
const { AiConversation, AiConversationSummary, AiMessage } = require('@leren/database');

const summary = require('../src/modules/tutor/conversationSummary');
const tutorService = require('../src/modules/tutor/tutor.service');
const env = require('../src/config/env');
const { aiAnswer, fakeDataSource } = require('./helpers/tutor-fakes');

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const turns = (count, start = 1) => Array.from({ length: count * 2 }, (_, i) => ({
  sequenceNo: start + i, role: i % 2 === 0 ? 'USER' : 'ASSISTANT', status: 'COMPLETED',
  content: i % 2 === 0 ? `질문 ${start + i}: 기회비용이 뭐야?` : `답변 ${start + i}입니다. 자세한 설명은 이렇습니다.`,
}));

test('FASTAPI timeout default is longer than the AI 45s internal bound', () => {
  if (!process.env.FASTAPI_TIMEOUT_MS) assert.equal(env.fastapiTimeoutMs, 50000);
  assert.ok(env.fastapiTimeoutMs > 45000 || Boolean(process.env.FASTAPI_TIMEOUT_MS));
});

test('plan: no summary until more than 10 unsummarized messages, then keep the latest 6', () => {
  assert.equal(summary.plan(turns(5), null), null);                    // 10 messages
  const decision = summary.plan(turns(6), null);                       // 12 messages
  assert.equal(decision.untilSeq, 6);
  assert.deepEqual(decision.covered.map(m => m.sequenceNo), [1, 2, 3, 4, 5, 6]);
  // already summarized up to 6 → only 7..18 count
  assert.equal(summary.plan(turns(9), 6).untilSeq, 12);
  assert.equal(summary.plan(turns(8), 6), null);                       // 7..16 = 10 messages
});

test('plan cuts only at the end of a turn (ASSISTANT)', () => {
  const rows = [...turns(5), { sequenceNo: 11, role: 'USER', status: 'COMPLETED', content: 'q' }, ...turns(1, 12)];
  // 13 messages; keepRecent 6 → cut 7 → seq 7 is USER → step back to seq 6 (ASSISTANT)
  const decision = summary.plan(rows, null);
  assert.equal(decision.covered.at(-1).role, 'ASSISTANT');
  assert.equal(decision.untilSeq, 6);
});

test('content: deterministic header, one line per turn, first sentence only', () => {
  const content = summary.buildContent(null, turns(2));
  assert.equal(content, [
    summary.HEADER,
    '- 학습자: 질문 1: 기회비용이 뭐야? / 튜터: 답변 2입니다.',
    '- 학습자: 질문 3: 기회비용이 뭐야? / 튜터: 답변 4입니다.',
  ].join('\n'));
  assert.equal(summary.buildContent(null, turns(2)), content);
  assert.equal(summary.firstSentence('  금리는 돈의 가격이다. 그래서…', 50), '금리는 돈의 가격이다.');
  assert.equal(summary.firstSentence('x'.repeat(300), 10).length, 10);
});

test('content: rolling summary keeps previous lines and drops the oldest past 1500 chars', () => {
  const first = summary.buildContent(null, turns(2));
  const rolled = summary.buildContent(first, turns(1, 5));
  assert.equal(rolled.split('\n').filter(l => l.startsWith('- ')).length, 3);
  const long = Array.from({ length: 40 }, (_, i) => ({ sequenceNo: i + 1, role: i % 2 ? 'ASSISTANT' : 'USER', content: `${i} ${'가'.repeat(200)}` }));
  const capped = summary.buildContent(null, long);
  assert.ok(capped.length <= summary.POLICY.maxChars);
  assert.match(capped, /일부 생략/);
  assert.match(capped, /- 학습자: 38 /);                            // newest turn kept
  assert.doesNotMatch(capped, /- 학습자: 0 /);                      // oldest dropped
});

async function chat(service, conversationId, n) {
  return service.sendMessage(id(9), { conversationId, question: `질문 ${n}`, modelTier: 'BASIC', clientMessageId: `c-${n}`, context: null, knowledgeScope: null }, null);
}

test('service: summary is created after 6 turns, sent on the next turn, and recorded on the answer', async () => {
  const dataSource = fakeDataSource();
  const sent = [];
  const aiClient = { answer: async body => { sent.push(body); return aiAnswer(body.requestId, { answer: `답변 ${sent.length}입니다. 추가 설명.` }); } };
  const service = tutorService(dataSource, aiClient, { personalizationEnabled: false, summaryEnabled: true });
  const { conversationId } = await service.createConversation(id(9), { entryPoint: 'NAV' });
  for (let n = 1; n <= 5; n += 1) await chat(service, conversationId, n);
  assert.equal(dataSource.tables.get(AiConversationSummary).length, 0);
  await chat(service, conversationId, 6);                              // 12 completed messages → summarize 1..6
  const [row] = dataSource.tables.get(AiConversationSummary);
  assert.equal(row.summaryUntilSeq, 6);
  assert.match(row.content, /- 학습자: 질문 1 \/ 튜터: 답변 1입니다\./);
  const conversation = dataSource.tables.get(AiConversation)[0];
  assert.equal(conversation.summary, row.content);
  assert.equal(conversation.summaryUntilSeq, 6);

  await chat(service, conversationId, 7);
  assert.equal(sent.at(-1).summary, row.content);
  assert.equal(sent.at(-1).summaryUntilSeq, 6);
  const answer7 = dataSource.tables.get(AiMessage).find(m => m.role === 'ASSISTANT' && m.sequenceNo === 14);
  assert.equal(answer7.summaryId, row.summaryId);
  assert.equal(sent[5].summary, null);                                 // turn 6 was built before the summary existed
});

test('service: summary failure never fails the tutor answer; disabled flag skips it', async () => {
  const dataSource = fakeDataSource();
  const summaryRepo = dataSource.manager.getRepository(AiConversationSummary);
  const original = dataSource.manager.getRepository;
  dataSource.manager.getRepository = entity => (entity === AiConversationSummary
    ? { ...summaryRepo, save: async () => { throw Object.assign(new Error('db down'), { code: 'X' }); } }
    : original(entity));
  const aiClient = { answer: async body => aiAnswer(body.requestId) };
  const warn = console.warn; console.warn = () => {};
  try {
    const service = tutorService(dataSource, aiClient, { personalizationEnabled: false, summaryEnabled: true });
    const { conversationId } = await service.createConversation(id(9), { entryPoint: 'NAV' });
    for (let n = 1; n <= 7; n += 1) assert.equal((await chat(service, conversationId, n)).assistantMessage.status, 'COMPLETED');
    assert.equal(dataSource.tables.get(AiConversation)[0].summary ?? null, null);
  } finally { console.warn = warn; dataSource.manager.getRepository = original; }

  const off = fakeDataSource();
  const service = tutorService(off, aiClient, { personalizationEnabled: false, summaryEnabled: false });
  const { conversationId } = await service.createConversation(id(9), { entryPoint: 'NAV' });
  for (let n = 1; n <= 7; n += 1) await chat(service, conversationId, n);
  assert.equal(off.tables.get(AiConversationSummary).length, 0);
});
