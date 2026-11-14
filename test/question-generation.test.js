const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const schema = require('../src/modules/questions/question-generation.schema');
const { loadEvidence } = require('../src/modules/questions/question-evidence');
const FastApiClient = require('../src/clients/fastapi.client');
const service = require('../src/modules/questions/question-generation.service');
const { input, result, evidence } = require('./fixtures/question-generation');

test('maps all AI difficulties and zero-based answers to existing DB format', () => {
  for (const [ai, db] of [['EASY', 'BEGINNER'], ['MEDIUM', 'INTERMEDIATE'], ['HARD', 'ADVANCED']]) {
    const output = schema.response(result(1, ai), input(1, ai), () => ['DOC-1']);
    assert.equal(output[0].difficulty, db);
    assert.equal(output[0].questionText, result().questions[0].question);
    assert.deepEqual(output[0].sourceDocumentIds, ['DOC-1']);
    assert.deepEqual(output[0].choices.map(c => c.isCorrect), [true, false, false, false]);
    assert.deepEqual(output[0].choices.map(c => c.baseOrder), [1, 2, 3, 4]);
  }
});

test('invalid generation input is rejected', () => {
  for (const patch of [{ conceptId: 'bad' }, { questionCount: 0 }, { questionCount: 101 }, { questionCount: 1.1 },
    { difficulty: 'BEGINNER' }, { learningObjectives: [] }, { learningObjectives: ['a', 'A'] }, { sourceIds: ['injected'] }]) {
    assert.throws(() => schema.request({ ...input(), ...patch }), { code: 'VALIDATION_ERROR' });
  }
});

test('rejects incomplete, failed, unapproved, inconsistent and oversized AI responses', () => {
  const changes = [
    b => { b.status = 'FAILED'; }, b => { b.error = 'INSUFFICIENT_EVIDENCE'; },
    b => { b.topic = '다른 주제'; }, b => { b.difficulty = 'HARD'; }, b => { b.questions = []; },
    b => { b.questions[0].choices.pop(); }, b => { b.questions[0].choices[1] = b.questions[0].choices[0]; },
    b => { b.questions[0].correctAnswerIndex = 4; }, b => { b.questions[0].correctAnswerIndex = '0'; },
    b => { b.questions[0].choices[0] = '가'.repeat(501); }, b => { b.questions[0].learningObjective = '다른 목표'; },
    b => { b.questions[0].questionType = 'MULTIPLE_CHOICE'; }, b => { b.validation = []; },
    b => { b.validation[0].decision = 'REJECT'; }, b => { b.validation[0].independentAnswerIndex = 2; },
    b => { b.validation[0].issues = ['오류']; }, b => { b.validation[0].questionIndex = 3; },
    b => { b.validation.push(b.validation[0]); }, b => { b.questions[0].sourceIds = []; },
    b => { b.sourceIds = ['wrong']; }, b => { b.sourceIds.push('BOK-1'); },
  ];
  for (const mutate of changes) {
    const body = result(); mutate(body);
    assert.throws(() => schema.response(body, input(), () => ['DOC-1']), { code: 'SERVICE_UNAVAILABLE' });
  }
  const duplicate = result(2); duplicate.questions[1] = duplicate.questions[0];
  assert.throws(() => schema.response(duplicate, input(2), () => ['DOC-1']), { code: 'SERVICE_UNAVAILABLE' });
});

test('#97: 500자 보기와 AI 문제 분류·학습 목표를 저장 입력으로 넘긴다', () => {
  const body = result();
  body.questions[0].choices[0] = '가'.repeat(500);
  const [draft] = schema.response(body, input(), () => ['DOC-1']);
  assert.equal(draft.choices[0].choiceText.length, 500);
  assert.equal(draft.questionCategory, body.questions[0].questionType);
  assert.equal(draft.learningObjective, body.questions[0].learningObjective);
});

test('final revision verdict is used, not an earlier APPROVE', () => {
  const body = result();
  body.validation.push({ ...body.validation[0], attempt: 2, decision: 'REVISE' });
  assert.throws(() => schema.response(body, input(), () => ['DOC-1']), { code: 'SERVICE_UNAVAILABLE' });
  body.validation[0].decision = 'REVISE'; body.validation[1].decision = 'APPROVE';
  assert.equal(schema.response(body, input(), () => ['DOC-1']).length, 1);
});

test('approved corpus resolves source ID to document ID and rejects missing/ambiguous sources', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'leren-evidence-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'evidence.jsonl');
  await writeFile(file, JSON.stringify(evidence));
  const corpus = await loadEvidence(file);
  assert.deepEqual(corpus.resolve(['BOK-1']), ['DOC-1']);
  assert.deepEqual(corpus.metadata(['BOK-1']), { 'BOK-1': { document_id: 'DOC-1', document_version: '2026' } });
  assert.throws(() => corpus.resolve(['DOC-1']), { code: 'SERVICE_UNAVAILABLE' });
  for (const rows of [[{ ...evidence, review_status: 'pending' }], [evidence, { ...evidence, document_id: 'DOC-2' }],
    [{ ...evidence, content: '' }]]) {
    await writeFile(file, rows.map(row => JSON.stringify(row)).join('\n'));
    await assert.rejects(loadEvidence(file), { code: 'SERVICE_UNAVAILABLE' });
  }
  await assert.rejects(loadEvidence(), { code: 'SERVICE_UNAVAILABLE' });
});

test('disabled generation makes no AI or DB call', async () => {
  const db = { getRepository() { throw Error('unexpected DB call'); } };
  const client = { generateQuestions() { throw Error('unexpected AI call'); } };
  await assert.rejects(service(db, { client, config: { questionGenerationEnabled: false } }).generate(input(), 'disabled-test'), { code: 'SERVICE_UNAVAILABLE' });
});

test('real HTTP client sends FastAPI contract and handles HTTP, JSON, timeout and disconnect failures', async t => {
  let mode = 'ok'; let calls = 0;
  const server = http.createServer(async (req, res) => {
    calls++;
    assert.equal(req.url, '/internal/v1/questions/generate');
    assert.equal(req.headers['x-internal-api-key'], 'mock-only-key');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const { conceptId, ...expected } = input();
    assert.deepEqual(JSON.parse(raw), expected);
    if (mode === 'timeout') return;
    if (mode === 'disconnect') return req.socket.destroy();
    res.writeHead(mode === 'http' ? 503 : 200, { 'content-type': 'application/json' });
    res.end(mode === 'json' ? '<html>bad</html>' : JSON.stringify(result()));
  });
  server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const client = new FastApiClient({ baseUrl: `http://127.0.0.1:${server.address().port}`, internalToken: 'mock-only-key', timeoutMs: 100 });
  const { conceptId, ...payload } = input();
  assert.equal((await client.generateQuestions(payload)).status, 'COMPLETED');
  for (mode of ['http', 'json', 'timeout', 'disconnect']) {
    await assert.rejects(client.generateQuestions(payload), { code: 'SERVICE_UNAVAILABLE' });
  }
  assert.equal(calls, 5);
});
