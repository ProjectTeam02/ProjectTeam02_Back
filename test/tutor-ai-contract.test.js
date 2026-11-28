/**
 * #171 BE-03: 백엔드 ↔ FastAPI 내부 튜터 API 계약 테스트
 * - AI_CONTRACT: ProjectTeam02_AI app/schemas/tutor.py (main 641b080, 2026-11-26)의 pydantic 모델 키 목록.
 *   verifiedContext·learnerProfile 취약도 필드는 b7b9dfb, eligibleQuestionCandidates는 5b147e3부터 지원 (그 이전 AI 이미지는 422).
 *   모든 모델이 extra="forbid"라 이 목록에 없는 키를 보내면 AI 서버가 422로 거절한다. AI 계약이 바뀌면 이 목록부터 고친다.
 * - 가짜 FastAPI 서버(node:http)가 실제 서버처럼 모르는 키를 422로 거절하는지까지 확인한다.
 */
const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const aiRequestDto = require('../src/modules/tutor/dto/aiInternalRequest.dto');
const personalizedDto = require('../src/modules/tutor/dto/aiPersonalizedContext.dto');
const { assertKnownConcepts } = require('../src/modules/tutor/conceptScope');
const tutorService = require('../src/modules/tutor/tutor.service');
const FastApiClient = require('../src/clients/fastapi.client');
const { AiRequest } = require('@leren/database');
const { aiAnswer, fakeDataSource } = require('./helpers/tutor-fakes');

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const isValidation = error => error.statusCode === 422 && error.code === 'VALIDATION_ERROR';

const AI_CONTRACT = {
  request: ['context', 'conversationId', 'eligibleQuestionCandidates', 'history', 'knowledgeScope', 'modelTier', 'personalizedContext', 'question', 'requestId', 'summary', 'summaryUntilSeq', 'userId', 'verifiedContext'],
  'request.verifiedContext': ['blockingReasons', 'conceptCode', 'conceptId', 'prerequisiteConcepts', 'shortDefinition', 'sourceDocumentIds', 'sources', 'title', 'verificationStatus', 'version'],
  'request.verifiedContext.sources[]': ['documentId', 'documentVersion', 'licenseReviewStatus', 'reviewStatus', 'title'],
  'request.verifiedContext.prerequisiteConcepts[]': ['conceptCode', 'depth', 'learnerConceptMastery', 'relationReviewStatus', 'relationshipType', 'title'],
  'request.eligibleQuestionCandidates[]': ['attemptId', 'conceptCode', 'questionId', 'stageId'],
  'request.history[]': ['content', 'role', 'sequenceNo'],
  'request.context': ['attemptId', 'conceptCode', 'conceptId', 'entryPoint', 'questionId', 'stageId', 'topicId'],
  'request.knowledgeScope': ['conceptCodes'],
  personalizedContext: ['conceptGraphContext', 'diagnosisEvidence', 'learnerProfile', 'misconceptionHypotheses', 'recentAssessments', 'teachingStrategy'],
  'personalizedContext.learnerProfile': ['accuracyRate', 'conceptCode', 'currentStageId', 'dataSufficiency', 'estimatedMastery', 'lastStudiedAt', 'recentIncorrectCount', 'uncertainty', 'weaknessComponents', 'weaknessScore'],
  'personalizedContext.misconceptionHypotheses[]': ['conceptCode', 'evidenceIds', 'hypothesisType', 'status'],
  'personalizedContext.diagnosisEvidence[]': ['chunkId', 'documentId', 'evidenceId', 'evidenceType', 'questionId', 'reviewStatus'],
  'personalizedContext.recentAssessments[]': ['assessedAt', 'assessmentId', 'conceptCode', 'isCorrect', 'questionId'],
  'personalizedContext.teachingStrategy': ['strategyId', 'strategyVersion'],
  'personalizedContext.conceptGraphContext': ['currentConceptCode', 'learnerConceptMastery', 'prerequisiteConcepts', 'relatedConcepts'],
  'personalizedContext.conceptGraphContext.prerequisiteConcepts[]': ['conceptCode', 'depth', 'learnerConceptMastery', 'relationReviewStatus', 'relationshipType', 'title'],
  'personalizedContext.conceptGraphContext.relatedConcepts[]': ['conceptCode', 'depth', 'learnerConceptMastery', 'relationReviewStatus', 'relationshipType', 'title'],
};

// AI 서버처럼 객체마다 허용 키만 받는지 검사 → 위반 경로 목록 (빈 배열이면 통과)
function forbiddenKeys(body, contract = AI_CONTRACT) {
  const errors = [];
  const walk = (value, path) => {
    if (Array.isArray(value)) return value.forEach(item => walk(item, `${path}[]`));
    if (!value || typeof value !== 'object') return;
    const allowed = contract[path];
    if (!allowed) return; // learnerConceptMastery 같은 자유 키 맵
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) errors.push(`${path}.${key}`);
      else walk(value[key], path === 'request' && key === 'personalizedContext' ? 'personalizedContext' : `${path}.${key}`);
    }
  };
  walk(body, 'request');
  return errors;
}

const fullContext = () => ({
  learnerProfile: { conceptCode: 'C0703', accuracyRate: 0.7, recentIncorrectCount: 2, estimatedMastery: null, weaknessScore: null, lastStudiedAt: new Date('2026-11-20T01:00:00Z'), currentStageId: null },
  misconceptionHypotheses: [{ hypothesisType: 'CAUSALITY_REVERSED', status: 'UNCONFIRMED', conceptCode: 'C0703', evidenceIds: [id(51)] }],
  diagnosisEvidence: [{ evidenceId: id(51), evidenceType: 'QUESTION_SUBMISSION', questionId: id(61) }],
  recentAssessments: [{ assessmentId: id(51), questionId: id(61), conceptCode: 'C0703', isCorrect: false, assessedAt: '2026-11-20T01:00:00Z' }],
  teachingStrategy: null,
  conceptGraphContext: {
    currentConceptCode: 'C0703',
    prerequisiteConcepts: [{ conceptCode: 'C0702', title: '소비자물가지수(CPI)', relationshipType: 'PREREQUISITE', relationReviewStatus: 'APPROVED', depth: 1 }],
    relatedConcepts: [],
    learnerConceptMastery: {},
  },
});

/* ---------- 계약 목록 ---------- */

test('#171 personalizedContext 규칙(SPEC)의 키 목록이 AI 계약과 같다', () => {
  const ours = personalizedDto.allowedKeys();
  for (const [path, keys] of Object.entries(AI_CONTRACT).filter(([path]) => path.startsWith('personalizedContext'))) {
    assert.deepEqual(ours[path], [...keys].sort(), path);
  }
});

test('#171 내부 요청은 AI 계약에 있는 키만 보낸다 (개인화 없음 → personalizedContext 키 자체를 빼서 예전 AI 서버와도 호환)', () => {
  const base = { requestId: id(7), userId: id(9), historyRows: [{ sequenceNo: 1, role: 'USER', content: 'q0' }], conversation: { conversationId: id(1), summary: '요약', summaryUntilSeq: 1 } };
  const input = { question: 'q', modelTier: 'BASIC', context: { entryPoint: 'CONCEPT', conceptId: id(2), conceptCode: 'C0703' }, knowledgeScope: { conceptCodes: ['C0703'] } };
  const plain = aiRequestDto.build({ ...base, input });
  assert.equal('personalizedContext' in plain, false);
  assert.deepEqual(forbiddenKeys(plain), []);
  const personalized = aiRequestDto.build({ ...base, input, personalizedContext: personalizedDto.normalize(fullContext()) });
  assert.deepEqual(forbiddenKeys(personalized), []);
  assert.equal(personalized.personalizedContext.learnerProfile.accuracyRate, 0.7);
});

/* ---------- 개인화 Context 정리·검사 ---------- */

test('#171 normalize: null·빈 값은 빼고 날짜는 ISO 문자열로, 보낼 내용이 없으면 null', () => {
  const out = personalizedDto.normalize(fullContext());
  assert.deepEqual(Object.keys(out).sort(), ['conceptGraphContext', 'diagnosisEvidence', 'learnerProfile', 'misconceptionHypotheses', 'recentAssessments']);
  assert.deepEqual(Object.keys(out.learnerProfile).sort(), ['accuracyRate', 'conceptCode', 'lastStudiedAt', 'recentIncorrectCount']);
  assert.equal(out.learnerProfile.lastStudiedAt, '2026-11-20T01:00:00.000Z');
  assert.deepEqual(Object.keys(out.conceptGraphContext).sort(), ['currentConceptCode', 'prerequisiteConcepts']);
  assert.equal(personalizedDto.normalize(null), null);
  assert.equal(personalizedDto.normalize({ learnerProfile: { estimatedMastery: null }, misconceptionHypotheses: [] }), null);
});

test('#171 normalize: AI 계약을 벗어나면 예외 (범위·길이·개수·필수값·모르는 키)', () => {
  const bad = patch => assert.throws(() => personalizedDto.normalize({ ...fullContext(), ...patch }), error => error.code === 'PERSONALIZATION_INVALID');
  bad({ learnerProfile: { accuracyRate: 70 } });                                        // 0~1 범위 (퍼센트 그대로 넣은 경우)
  bad({ learnerProfile: { recentIncorrectCount: 1.5 } });                               // 정수
  bad({ learnerProfile: { conceptCode: 'x'.repeat(31) } });                             // 30자
  bad({ learnerProfile: { lastStudiedAt: 'yesterday' } });                              // 날짜
  bad({ misconceptionHypotheses: Array.from({ length: 11 }, () => ({ hypothesisType: 'T' })) }); // 최대 10개
  bad({ misconceptionHypotheses: [{ status: 'UNCONFIRMED' }] });                        // hypothesisType 필수
  bad({ teachingStrategy: { strategyId: 's' } });                                       // strategyVersion 필수
  bad({ conceptGraphContext: { prerequisiteConcepts: [{ conceptCode: 'C1', depth: 6 }] } }); // depth 1~5
  bad({ conceptGraphContext: { learnerConceptMastery: { C1: 1.2 } } });                 // 숙련도 0~1
  bad({ learnerProfile: { userId: id(9) } });                                           // 모르는 키
  bad({ extra: true });                                                                 // 최상위 모르는 키
});

/* ---------- 개념 코드·ID 검증 ---------- */

const concepts = [
  { conceptId: id(21), conceptCode: 'C0703', status: 'PUBLISHED' },
  { conceptId: id(22), conceptCode: 'C0702', status: 'PUBLISHED' },
  { conceptId: id(23), conceptCode: 'C9999', status: 'DRAFT' },
];

test('#171 개념 코드·ID는 공개된 개념만, conceptId와 conceptCode는 같은 개념이어야 한다', async () => {
  const { manager } = fakeDataSource({ concepts });
  await assertKnownConcepts(manager, { context: null, knowledgeScope: null });
  await assertKnownConcepts(manager, { context: { conceptId: id(21), conceptCode: 'C0703' }, knowledgeScope: { conceptCodes: ['C0702', 'C0703'] } });
  await assert.rejects(assertKnownConcepts(manager, { context: null, knowledgeScope: { conceptCodes: ['C0703', 'NOPE', 'C9999'] } }),
    error => isValidation(error) && JSON.stringify(error.details.unknownConceptCodes) === JSON.stringify(['NOPE', 'C9999']));
  await assert.rejects(assertKnownConcepts(manager, { context: { conceptCode: 'NOPE' } }), isValidation);
  await assert.rejects(assertKnownConcepts(manager, { context: { conceptId: id(23) } }), isValidation);   // DRAFT
  await assert.rejects(assertKnownConcepts(manager, { context: { conceptId: id(21), conceptCode: 'C0702' } }),
    error => isValidation(error) && error.details.conceptCodeOfConceptId === 'C0703');
});

test('#171 없는 개념 코드 질문은 사용량 차감·AI 호출 전에 422', async () => {
  const dataSource = fakeDataSource({ concepts });
  let called = false;
  const service = tutorService(dataSource, { answer: async () => { called = true; return aiAnswer(id(1)); } }, { personalizationEnabled: false });
  const conversation = await service.createConversation(id(9), { entryPoint: 'NAV' });
  await assert.rejects(service.sendMessage(id(9), { conversationId: conversation.conversationId, question: 'q', modelTier: 'BASIC', clientMessageId: 'c-1', context: null, knowledgeScope: { conceptCodes: ['NOPE'] } }, null), isValidation);
  assert.equal(called, false);
  assert.equal(dataSource.tables.get(AiRequest).length, 0);
});

/* ---------- 가짜 FastAPI 서버로 끝까지 ---------- */

// 실제 AI 서버처럼 모르는 키는 422로 거절. supportsPersonalization=false면 personalizedContext를 모르는 예전 서버
async function fakeFastApi({ supportsPersonalization = true } = {}) {
  const received = [];
  const contract = { ...AI_CONTRACT, request: AI_CONTRACT.request.filter(key => supportsPersonalization || key !== 'personalizedContext') };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      received.push(body);
      const errors = forbiddenKeys(body, contract);
      res.setHeader('content-type', 'application/json');
      if (errors.length) { res.statusCode = 422; return res.end(JSON.stringify({ detail: errors.map(loc => ({ type: 'extra_forbidden', loc })) })); }
      return res.end(JSON.stringify(aiAnswer(body.requestId)));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, received, close: () => new Promise(resolve => server.close(resolve)) };
}

async function ask(service, question, extra = {}) {
  const conversation = await service.createConversation(id(9), { entryPoint: 'CONCEPT' });
  return service.sendMessage(id(9), { conversationId: conversation.conversationId, question, modelTier: 'BASIC', clientMessageId: question, context: { conceptCode: 'C0703' }, knowledgeScope: null, ...extra }, null);
}

test('#171 가짜 FastAPI: 개인화를 켜면 personalizedContext가 계약대로 전달되고 답변이 저장된다', async () => {
  const ai = await fakeFastApi();
  try {
    const personalization = { build: async () => fullContext() };
    const service = tutorService(fakeDataSource({ concepts }), new FastApiClient({ baseUrl: ai.url, timeoutMs: 2000 }), { personalizationEnabled: true, personalization });
    const result = await ask(service, 'q-personalized');
    assert.equal(result.assistantMessage.status, 'COMPLETED');
    assert.equal(ai.received[0].personalizedContext.learnerProfile.accuracyRate, 0.7);
    assert.deepEqual(forbiddenKeys(ai.received[0]), []);
  } finally { await ai.close(); }
});

test('#171 가짜 FastAPI: 개인화 정보가 계약을 벗어나거나 만들다 실패해도 기본 튜터 흐름으로 답한다', async () => {
  const ai = await fakeFastApi();
  const warn = console.warn; console.warn = () => {};
  try {
    for (const build of [async () => ({ learnerProfile: { accuracyRate: 70 } }), async () => { throw new Error('집계 실패'); }]) {
      const service = tutorService(fakeDataSource({ concepts }), new FastApiClient({ baseUrl: ai.url, timeoutMs: 2000 }), { personalizationEnabled: true, personalization: { build } });
      const result = await ask(service, `q-fallback-${ai.received.length}`);
      assert.equal(result.assistantMessage.status, 'COMPLETED');
      assert.equal('personalizedContext' in ai.received.at(-1), false);
    }
  } finally { console.warn = warn; await ai.close(); }
});

test('#171 가짜 FastAPI: 개인화를 끄면 personalizedContext를 모르는 예전 AI 서버와도 동작하고, 켜면 422가 503으로 바뀐다', async () => {
  const ai = await fakeFastApi({ supportsPersonalization: false });
  try {
    const personalization = { build: async () => fullContext() };
    const off = tutorService(fakeDataSource({ concepts }), new FastApiClient({ baseUrl: ai.url, timeoutMs: 2000 }), { personalizationEnabled: false, personalization });
    assert.equal((await ask(off, 'q-off')).assistantMessage.status, 'COMPLETED');
    assert.equal('personalizedContext' in ai.received[0], false);

    const dataSource = fakeDataSource({ concepts });
    const on = tutorService(dataSource, new FastApiClient({ baseUrl: ai.url, timeoutMs: 2000 }), { personalizationEnabled: true, personalization });
    await assert.rejects(ask(on, 'q-on'), error => error.statusCode === 503 && error.reason === 'AI_REQUEST_REJECTED');
    assert.equal(dataSource.tables.get(AiRequest)[0].status, 'FAILED'); // 실패 요청은 기록하고 사용량에서 빠진다
  } finally { await ai.close(); }
});

test('#179 verifiedContext는 플래그를 켰을 때만 보내고, 조회 실패도 BLOCKED(Fail-Closed)로 계약 키만 보낸다', async () => {
  const ai = await fakeFastApi();
  const warn = console.warn; console.warn = () => {};
  try {
    const off = tutorService(fakeDataSource({ concepts }), new FastApiClient({ baseUrl: ai.url, timeoutMs: 2000 }), { personalizationEnabled: false });
    await ask(off, 'q-verified-off');
    assert.equal('verifiedContext' in ai.received.at(-1), false);

    const on = tutorService(fakeDataSource({ concepts }), new FastApiClient({ baseUrl: ai.url, timeoutMs: 2000 }), { personalizationEnabled: false, verifiedContextEnabled: true });
    const result = await ask(on, 'q-verified-on');
    assert.equal(result.assistantMessage.status, 'COMPLETED');
    const sent = ai.received.at(-1);
    assert.equal(sent.verifiedContext.verificationStatus, 'BLOCKED');
    assert.deepEqual(forbiddenKeys(sent), []);
  } finally { console.warn = warn; await ai.close(); }
});
