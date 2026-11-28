/**
 * P5 대화 누적 요약 — 실제 PostgreSQL
 * 확인: 7턴 후 tutor.ai_conversation_summaries 행 + ai_conversations.summary·summary_until_seq 갱신 (CHECK·FK 통과),
 *       다음 요청에 summary가 실리고 답변의 summary_id가 기록됨, 20턴까지 누적 요약이 1500자 이하로 유지됨
 */
const assert = require('node:assert/strict');
const test = require('node:test');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('tutor conversation summary against PostgreSQL', { skip: !config, timeout: 120000 }, async t => {
  const options = JSON.parse(config);
  const E = require('@leren/database');
  const db = E.AppDataSource;
  const previous = { ...db.options };
  t.after(async () => { if (db.isInitialized) await db.destroy(); db.setOptions(previous); });
  db.setOptions({ host: '127.0.0.1', port: options.port, database: options.database || 'leren_it',
    username: options.username || 'app_user', password: options.password || 'app_local',
    ssl: false, synchronize: false, migrationsRun: false, logging: false });
  await db.initialize();

  const tutorService = require('../../src/modules/tutor/tutor.service');
  const user = await db.getRepository(E.User).save({ nickname: `요약-${Date.now() % 100000}` });
  const sent = [];
  const aiClient = { answer: async body => { sent.push(body); return {
    requestId: body.requestId, answer: `${sent.length}번째 답변입니다. 기회비용은 포기한 대안의 가치입니다.`,
    groundingStatus: 'INSUFFICIENT', sources: [], usage: { latencyMs: 1, cacheHit: false, retrievalStrategy: 'mock' } }; } };
  const service = tutorService(db, aiClient, { personalizationEnabled: false, summaryEnabled: true });
  const { conversationId } = await service.createConversation(user.userId, { entryPoint: 'NAV' });
  const ask = n => service.sendMessage(user.userId, { conversationId, question: `${n}번째 질문: 기회비용 예시 알려줘`, modelTier: 'BASIC',
    clientMessageId: `sum-${conversationId}-${n}`, context: null, knowledgeScope: null }, null);

  for (let n = 1; n <= 6; n += 1) await ask(n);
  const summaries = () => db.getRepository(E.AiConversationSummary).find({ where: { conversationId }, order: { summaryUntilSeq: 'ASC' } });
  let rows = await summaries();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].summaryUntilSeq, 6);
  assert.ok(rows[0].requestId);
  const conversation = await db.getRepository(E.AiConversation).findOneByOrFail({ conversationId });
  assert.equal(conversation.summaryUntilSeq, 6);
  assert.equal(conversation.summary, rows[0].content);

  await ask(7);
  assert.equal(sent.at(-1).summaryUntilSeq, 6);
  assert.match(sent.at(-1).summary, /1번째 질문/);
  const answer7 = await db.getRepository(E.AiMessage).findOneByOrFail({ conversationId, sequenceNo: 14 });
  assert.equal(answer7.summaryId, rows[0].summaryId);

  for (let n = 8; n <= 20; n += 1) await ask(n);
  rows = await summaries();
  assert.ok(rows.length >= 3);
  for (const row of rows) assert.ok(row.content.length <= 1500);
  assert.ok(rows.some(row => row.summaryUntilSeq === sent.at(-1).summaryUntilSeq)); // 보낸 요약은 저장된 요약 이력 중 하나
  assert.ok(sent.at(-1).summaryUntilSeq >= 20);                         // 20턴째 요청은 앞 10턴 이상을 요약으로 받음
  // 요약되지 않은 최근 메시지는 AI 창(12개) 안에 들어간다
  const unsummarized = sent.at(-1).history.filter(h => h.sequenceNo > sent.at(-1).summaryUntilSeq);
  assert.ok(unsummarized.length <= 12, `unsummarized=${unsummarized.length}`);
});
