const assert = require('node:assert/strict');
const test = require('node:test');

const { calculateWeakness } = require('../src/modules/tutor/personalization/weakness');
const { diagnoseConcept } = require('../src/modules/tutor/personalization/diagnosis');
const personalization = require('../src/modules/tutor/personalization/service');
const personalizationRepository = require('../src/modules/tutor/personalization/repository');
const request = require('../src/modules/tutor/tutor.schema');
const aiRequest = require('../src/modules/tutor/dto/aiInternalRequest.dto');

const now = new Date('2026-11-24T00:00:00.000Z');

test('weakness score follows the fixed weighted policy and exposes missing-data uncertainty', () => {
  const result = calculateWeakness({
    totalAttempts: 4,
    wrongCount: 2,
    reassessmentCount: 2,
    reassessmentWrongCount: 1,
    lastStudiedAt: '2026-11-24T00:00:00.000Z',
  }, now);
  assert.equal(result.weaknessScore, 0.425);
  assert.equal(result.estimatedMastery, 0.575);
  assert.equal(result.dataSufficiency, 'MEDIUM');
  assert.equal(result.uncertainty, 0.2);
  assert.equal(calculateWeakness({}, now).uncertainty, 1);
});

test('one wrong answer remains an unconfirmed UNCERTAIN hypothesis', () => {
  const result = diagnoseConcept({
    conceptCode: 'ECO-RATE',
    wrongRows: [{ assessmentId: 'assessment-1', questionCategory: 'SCENARIO' }],
  });
  assert.equal(result.hypothesisType, 'UNCERTAIN');
  assert.equal(result.status, 'UNCONFIRMED');
  assert.equal(result.evidenceIds[0], 'assessment-1');
});

test('personalization is isolated to supplied user rows and differs by learner state', () => {
  const weakLearner = personalization.contextFromRows([
    { assessmentId: 'a-1', conceptCode: 'ECO-RATE', isCorrect: false, submittedAt: '2026-11-20T00:00:00Z', assessmentType: 'LEARNING', questionCategory: 'SCENARIO' },
    { assessmentId: 'a-2', conceptCode: 'ECO-RATE', isCorrect: false, submittedAt: '2026-11-21T00:00:00Z', assessmentType: 'LEARNING', questionCategory: 'SCENARIO' },
  ], { now });
  const strongLearner = personalization.contextFromRows([
    { assessmentId: 'b-1', conceptCode: 'ECO-RATE', isCorrect: true, submittedAt: '2026-11-23T00:00:00Z', assessmentType: 'LEARNING' },
    { assessmentId: 'b-2', conceptCode: 'ECO-RATE', isCorrect: true, submittedAt: '2026-11-24T00:00:00Z', assessmentType: 'REASSESSMENT' },
  ], { now });
  assert.ok(weakLearner.personalizedContext.learnerProfile.weaknessScore > strongLearner.personalizedContext.learnerProfile.weaknessScore);
  assert.equal(weakLearner.personalizedContext.misconceptionHypotheses[0].status, 'UNCONFIRMED');
  assert.equal(weakLearner.personalizedContext.teachingStrategy.strategyId, 'CAUSAL_CHAIN_V1');
});

test('tutor personalization query rejects unknown fields and AI payload keeps it optional', () => {
  assert.deepEqual(request.personalization({ query: { conceptCode: 'ECO-RATE' } }), {
    query: { conceptCode: 'ECO-RATE', conceptId: null, stageId: null },
  });
  assert.throws(() => request.personalization({ query: { userId: 'leak' } }));
  const body = aiRequest.build({
    requestId: 'request-1',
    userId: 'user-1',
    conversation: { conversationId: 'conversation-1', summary: null, summaryUntilSeq: null },
    input: { question: 'q', modelTier: 'BASIC', context: null, knowledgeScope: null },
    historyRows: [],
    personalizedContext: { learnerProfile: { conceptCode: 'ECO-RATE', weaknessScore: 0.8 } },
  });
  assert.equal(body.personalizedContext.learnerProfile.weaknessScore, 0.8);
});

test('learning signal query is explicitly scoped to the authenticated user', async () => {
  let params;
  await personalizationRepository.assessmentRows({
    query: async (sql, values) => {
      params = values;
      assert.match(sql, /la\.user_id = \$1/);
      assert.match(sql, /ra\.user_id = \$1/);
      return [];
    },
  }, { userId: 'user-a', conceptCode: 'ECO-RATE' });
  assert.deepEqual(params, ['user-a', 'ECO-RATE', null]);
});
