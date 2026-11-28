const assert = require('node:assert/strict');
const test = require('node:test');

const { WEIGHTS, calculateWeakness, recencyRisk } = require('../src/modules/tutor/personalization/weakness');
const { strategyFor } = require('../src/modules/tutor/personalization/diagnosis');
const signals = require('../src/modules/tutor/personalization/service');
const personalizationRepository = require('../src/modules/tutor/personalization/repository');
const { personalizationProvider, withPrerequisiteMastery } = require('../src/modules/tutor/personalization');
const personalizedDto = require('../src/modules/tutor/dto/aiPersonalizedContext.dto');
const request = require('../src/modules/tutor/tutor.schema');
const aiRequest = require('../src/modules/tutor/dto/aiInternalRequest.dto');

const now = new Date('2026-11-24T00:00:00.000Z');

test('weights are fixed at 40/25/20/15 and sum to 1', () => {
  assert.deepEqual(WEIGHTS, { errorRate: 0.40, repeatError: 0.25, reassessmentFailure: 0.20, recencyRisk: 0.15 });
  assert.equal(Math.round(Object.values(WEIGHTS).reduce((a, b) => a + b, 0) * 1000), 1000);
  assert.ok(Object.isFrozen(WEIGHTS));
});

test('weakness score follows the weighted policy component by component', () => {
  // errorRate 2/4=0.5, repeat (2-1)/2=0.5, reassessment 1/2=0.5, recency 0 (studied now)
  const result = calculateWeakness({
    totalAttempts: 4, wrongCount: 2, reassessmentCount: 2, reassessmentWrongCount: 1,
    lastStudiedAt: '2026-11-24T00:00:00.000Z',
  }, now);
  assert.deepEqual(result.components, { errorRate: 0.5, repeatError: 0.5, reassessmentFailure: 0.5, recencyRisk: 0 });
  assert.equal(result.weaknessScore, 0.425);
  assert.equal(result.estimatedMastery, 0.575);
  assert.equal(result.dataSufficiency, 'MEDIUM');
  assert.equal(result.uncertainty, 0.2);

  // all wrong, all reassessments failed, 30+ days ago → 1.0 cap
  const worst = calculateWeakness({
    totalAttempts: 10, wrongCount: 10, reassessmentCount: 3, reassessmentWrongCount: 3,
    lastStudiedAt: '2026-10-01T00:00:00.000Z',
  }, now);
  assert.equal(worst.components.repeatError, 0.9);
  assert.equal(worst.weaknessScore, 0.975);
  assert.equal(worst.dataSufficiency, 'HIGH');
});

test('no submissions is missing data, never mastery', () => {
  const result = calculateWeakness({}, now);
  assert.equal(result.weaknessScore, null);
  assert.equal(result.estimatedMastery, null);
  assert.equal(result.uncertainty, 1);
  assert.equal(result.dataSufficiency, 'NONE');
  assert.deepEqual(signals.profileSignals(result), { uncertainty: 1, dataSufficiency: 'NONE' });
});

test('missing or invalid fields fall back to neutral values without throwing', () => {
  assert.equal(recencyRisk(null, now), 0.5);
  assert.equal(recencyRisk('not-a-date', now), 0.5);
  assert.equal(recencyRisk('2027-01-01T00:00:00Z', now), 0); // future timestamp is not negative risk
  const noReassessment = calculateWeakness({ totalAttempts: 5, wrongCount: 0, lastStudiedAt: now }, now);
  assert.equal(noReassessment.components.reassessmentFailure, 0.5);
  assert.equal(noReassessment.weaknessScore, 0.1);
  // inconsistent counts are clamped, not amplified
  const clamped = calculateWeakness({ totalAttempts: 2, wrongCount: 9, reassessmentCount: 5, reassessmentWrongCount: 7, lastStudiedAt: now }, now);
  assert.equal(clamped.wrongCount, 2);
  assert.equal(clamped.reassessmentCount, 2);
  assert.equal(clamped.reassessmentWrongCount, 2);
  assert.ok(clamped.weaknessScore <= 1);
  // rows without a boolean result (unsubmitted/missing) are ignored
  const map = signals.weaknessByConcept([
    { concept_code: 'ECO-01', is_correct: null, submitted_at: now },
    { concept_code: null, is_correct: false, submitted_at: now },
  ], now);
  assert.equal(map.size, 0);
});

test('uncertainty decreases with more attempts and with reassessment evidence', () => {
  const one = calculateWeakness({ totalAttempts: 1, wrongCount: 1, lastStudiedAt: now }, now);
  const five = calculateWeakness({ totalAttempts: 5, wrongCount: 1, lastStudiedAt: now }, now);
  const fiveReassessed = calculateWeakness({ totalAttempts: 5, wrongCount: 1, reassessmentCount: 1, lastStudiedAt: now }, now);
  assert.ok(one.uncertainty > five.uncertainty);
  assert.ok(five.uncertainty > fiveReassessed.uncertainty);
  assert.equal(fiveReassessed.uncertainty, 0);
});

test('a single wrong answer stays uncertain and does not pick a type-specific strategy', () => {
  const single = calculateWeakness({ totalAttempts: 1, wrongCount: 1, lastStudiedAt: now }, now);
  assert.equal(single.components.repeatError, 0);
  assert.equal(single.dataSufficiency, 'LOW');
  const oneEvidence = [{ hypothesisType: 'CAUSAL_ERROR', status: 'UNCONFIRMED', evidenceIds: ['s-1'] }];
  assert.equal(strategyFor({ ...single, hypotheses: oneEvidence }), 'DIAGNOSTIC_CHECK_V1');

  const repeated = calculateWeakness({ totalAttempts: 4, wrongCount: 2, reassessmentCount: 1, lastStudiedAt: now }, now);
  assert.equal(strategyFor({ ...repeated, hypotheses: oneEvidence }), 'DIAGNOSTIC_CHECK_V1');
  assert.equal(strategyFor({ ...repeated, hypotheses: [{ hypothesisType: 'CAUSAL_ERROR', status: 'UNCONFIRMED', evidenceIds: ['s-1', 's-2'] }] }), 'CAUSAL_CHAIN_V1');
  assert.equal(strategyFor({ ...repeated, hypotheses: [{ hypothesisType: 'RELATION_ERROR', status: 'CONFIRMED', evidenceIds: [] }] }), 'RELATION_COMPARISON_V1');
  assert.equal(strategyFor({ weaknessScore: 0.7, dataSufficiency: 'HIGH', hypotheses: [] }), 'FOUNDATION_EXPLANATION_V1');
  assert.equal(strategyFor({ weaknessScore: 0.2, dataSufficiency: 'HIGH', hypotheses: [] }), 'APPLICATION_STEPWISE_V1');
  assert.equal(strategyFor({ weaknessScore: null, dataSufficiency: 'NONE', hypotheses: [] }), 'DIAGNOSTIC_CHECK_V1');
});

test('reassessment (review) submissions count as reassessment evidence', () => {
  const map = signals.weaknessByConcept([
    { concept_code: 'ECO-01', is_correct: false, submitted_at: '2026-11-20T00:00:00Z', assessment_type: 'LEARNING' },
    { concept_code: 'ECO-01', is_correct: false, submitted_at: '2026-11-21T00:00:00Z', assessment_type: 'REASSESSMENT' },
    { concept_code: 'ECO-02', is_correct: true, submitted_at: '2026-11-23T00:00:00Z', assessment_type: 'LEARNING' },
  ], now);
  assert.equal(map.get('ECO-01').reassessmentCount, 1);
  assert.equal(map.get('ECO-01').components.reassessmentFailure, 1);
  assert.ok(map.get('ECO-01').weaknessScore > map.get('ECO-02').weaknessScore);
});

test('prerequisite mastery is attached only to prerequisites with learner data', () => {
  const weaknessMap = signals.weaknessByConcept([
    { concept_code: 'PRE-A', is_correct: true, submitted_at: now },
    { concept_code: 'PRE-A', is_correct: true, submitted_at: now, assessment_type: 'REASSESSMENT' },
  ], now);
  const graph = withPrerequisiteMastery({
    currentConceptCode: 'ECO-01',
    prerequisiteConcepts: [
      { conceptCode: 'PRE-A', relationshipType: 'PREREQUISITE', relationReviewStatus: 'APPROVED', depth: 1 },
      { conceptCode: 'PRE-B', relationshipType: 'PREREQUISITE', relationReviewStatus: 'APPROVED', depth: 2 },
    ],
    relatedConcepts: [],
  }, weaknessMap);
  assert.equal(graph.prerequisiteConcepts[0].learnerConceptMastery, 1);
  assert.equal('learnerConceptMastery' in graph.prerequisiteConcepts[1], false);
  assert.deepEqual(graph.learnerConceptMastery, { 'PRE-A': 1 });
  assert.equal(withPrerequisiteMastery(null, weaknessMap), null);
});

function fakeManager(userRows) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('UNION ALL') && sql.includes('REASSESSMENT')) return userRows[params[0]] || [];
      if (sql.includes('total') && sql.includes('recent_incorrect')) {
        const rows = (userRows[params[0]] || []).filter(row => row.concept_code === params[1]);
        return [{ total: rows.length, correct: rows.filter(r => r.is_correct).length, recent_incorrect: rows.filter(r => !r.is_correct).length, last_at: rows.length ? now : null }];
      }
      return [];
    },
  };
}

test('provider output is per-user and passes the AI personalized contract', async () => {
  const rows = {
    'user-weak': [
      { concept_code: 'ECO-01', is_correct: false, submitted_at: '2026-11-20T00:00:00Z' },
      { concept_code: 'ECO-01', is_correct: false, submitted_at: '2026-11-21T00:00:00Z' },
    ],
    'user-strong': [
      { concept_code: 'ECO-01', is_correct: true, submitted_at: '2026-11-23T00:00:00Z' },
      { concept_code: 'ECO-01', is_correct: true, submitted_at: '2026-11-24T00:00:00Z', assessment_type: 'REASSESSMENT' },
    ],
  };
  const manager = fakeManager(rows);
  const provider = personalizationProvider({ now: () => now });
  const input = { context: { conceptCode: 'ECO-01', stageId: 'stage-1' } };
  const weak = personalizedDto.normalize(await provider.build('user-weak', input, manager));
  const strong = personalizedDto.normalize(await provider.build('user-strong', input, manager));
  const nobody = personalizedDto.normalize(await provider.build('user-new', input, manager));

  assert.ok(weak.learnerProfile.weaknessScore > strong.learnerProfile.weaknessScore);
  assert.equal(weak.learnerProfile.weaknessComponents.errorRate, 1);
  assert.equal(nobody.learnerProfile.dataSufficiency, 'NONE');
  assert.equal('weaknessScore' in nobody.learnerProfile, false);
  assert.equal(nobody.teachingStrategy.strategyId, 'DIAGNOSTIC_CHECK_V1');
  // every learner-signal query is bound to the requesting user only
  for (const call of manager.calls.filter(c => c.sql.includes('user_id'))) {
    assert.ok(['user-weak', 'user-strong', 'user-new'].includes(call.params[0]));
  }
});

test('personalized DTO accepts weakness signals and rejects out-of-range components', () => {
  const ok = personalizedDto.normalize({ learnerProfile: { conceptCode: 'ECO-01', uncertainty: 0.4, dataSufficiency: 'MEDIUM', weaknessComponents: { errorRate: 0.5 } } });
  assert.equal(ok.learnerProfile.weaknessComponents.errorRate, 0.5);
  assert.throws(() => personalizedDto.normalize({ learnerProfile: { weaknessComponents: { errorRate: 1.5 } } }));
  assert.throws(() => personalizedDto.normalize({ learnerProfile: { weaknessComponents: { ['x'.repeat(41)]: 0.1 } } }));
  assert.throws(() => personalizedDto.normalize({ learnerProfile: { uncertainty: -0.1 } }));
});

test('tutor personalization query rejects unknown fields (no userId override) and AI payload keeps it optional', () => {
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
