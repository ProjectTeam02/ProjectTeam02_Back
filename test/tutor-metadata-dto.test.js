const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const requestDto = require('../src/modules/tutor/dto/aiInternalRequest.dto');
const responseDto = require('../src/modules/tutor/dto/aiInternalResponse.dto');
const metadataDto = require('../src/modules/tutor/dto/tutorMetadata.dto');
const { aiAnswer } = require('./helpers/tutor-fakes');

const conceptCode = 'ECO-01';
const questionId = randomUUID();
const stageId = randomUUID();
const attemptId = randomUUID();
const candidate = { questionId, stageId, attemptId, conceptCode };
const unavailable = { statusCode: 503 };

test('AI request #43 allows up to ten distinct candidates and forwards only public identifiers', () => {
  const call = { requestId: randomUUID(), conversation: { conversationId: randomUUID() }, userId: randomUUID(),
    input: { question: 'Fixture', modelTier: 'BASIC' }, historyRows: [] };
  const candidates = Array.from({ length: 10 }, () => ({ ...candidate, questionId: randomUUID() }));
  assert.deepEqual(requestDto.build({ ...call, eligibleQuestionCandidates: candidates }).eligibleQuestionCandidates, candidates);
  assert.equal(Object.hasOwn(requestDto.build(call), 'eligibleQuestionCandidates'), false);
  const withPrivateFields = { ...candidate, isCorrect: true, explanation: 'private', correctChoiceId: randomUUID() };
  assert.deepEqual(requestDto.build({ ...call, eligibleQuestionCandidates: [withPrivateFields] }).eligibleQuestionCandidates, [candidate]);
  assert.throws(() => requestDto.build({ ...call, eligibleQuestionCandidates: [...candidates, candidate] }), unavailable);
  assert.throws(() => requestDto.build({ ...call, eligibleQuestionCandidates: [candidate, candidate] }), unavailable);
});

test('AI response #43 validates each action shape and permits legacy responses', () => {
  const fields = { reason: 'Fixture', priority: 'LOW' };
  for (const action of [
    { type: 'SOLVE_QUESTION', ...candidate }, { type: 'START_STAGE', stageId },
    { type: 'REVIEW_CONCEPT', conceptCode, stageId }, { type: 'CONTINUE_LEARNING', attemptId }, { type: 'NONE' },
  ]) assert.equal(metadataDto.action({ ...fields, ...action }).type, action.type);
  for (const action of [
    { type: 'SOLVE_QUESTION', questionId, attemptId }, { type: 'START_STAGE', stageId, questionId },
    { type: 'REVIEW_CONCEPT', attemptId }, { type: 'CONTINUE_LEARNING' }, { type: 'NONE', stageId },
    { type: 'NONE', priority: 'INVALID' }, { type: 'CONTINUE_LEARNING', attemptId: 'non-uuid' },
  ]) assert.throws(() => metadataDto.action({ ...fields, ...action }), unavailable);
  const requestId = randomUUID();
  const legacy = responseDto.parse(aiAnswer(requestId), requestId, true);
  assert.equal(legacy.tutoringMeta, null);
  assert.equal(legacy.proposedAction, null);
  const invalid = aiAnswer(requestId, { proposedAction: { type: 'NONE', stageId, ...fields } });
  assert.throws(() => responseDto.parse(invalid, requestId, true), unavailable);
  assert.equal(Object.hasOwn(responseDto.parse(invalid, requestId, false), 'proposedAction'), false);
});

test('AI diagnosis #43 checks schema, ranges, evidence IDs and strategy fields', () => {
  const diagnosis = { misconceptionType: 'UNCERTAIN', confidence: 0, evidenceQuestionIds: [questionId],
    needsFollowup: true, reasoningSummary: 'Fixture' };
  const metadata = { schemaVersion: '1.0', conceptCode, diagnosis, strategy: { strategyId: 'DIAGNOSTIC_CHECK_V1', strategyVersion: '1.0' } };
  assert.deepEqual(metadataDto.metadata(metadata), metadata);
  for (const fields of [{ misconceptionType: 'UNKNOWN' }, { confidence: 1.1 }, { needsFollowup: 'true' },
    { evidenceQuestionIds: ['invalid'] }, { evidenceQuestionIds: [questionId, questionId] }, { reasoningSummary: '' }]) {
    assert.throws(() => metadataDto.metadata({ ...metadata, diagnosis: { ...diagnosis, ...fields } }), unavailable);
  }
  assert.throws(() => metadataDto.metadata({ ...metadata, schemaVersion: '2.0' }), unavailable);
  assert.throws(() => metadataDto.metadata({ ...metadata, strategy: { strategyId: 'X' } }), unavailable);
});
