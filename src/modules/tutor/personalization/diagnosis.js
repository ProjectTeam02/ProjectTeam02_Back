const TYPES = Object.freeze([
  'KNOWLEDGE_GAP',
  'RELATION_ERROR',
  'CAUSAL_ERROR',
  'APPLICATION_ERROR',
  'UNCERTAIN',
]);

function typeForRow(row) {
  const category = String(row.questionCategory || '').toUpperCase();
  if (category === 'COMPARISON') return 'RELATION_ERROR';
  if (category === 'SCENARIO') return 'CAUSAL_ERROR';
  if (category === 'APPLICATION') return 'APPLICATION_ERROR';
  return 'KNOWLEDGE_GAP';
}

function diagnoseConcept(stats) {
  const wrongRows = (stats.wrongRows || []).filter(row => row.assessmentId);
  const observationCount = wrongRows.length;
  // A single wrong answer is an observation, not a confirmed misconception.
  if (observationCount < 2) {
    return {
      hypothesisType: 'UNCERTAIN',
      status: 'UNCONFIRMED',
      conceptCode: stats.conceptCode,
      evidenceIds: wrongRows.slice(0, 5).map(row => row.assessmentId),
      confidence: observationCount ? 0.2 : 0,
      observationCount,
      rationale: '오답 관찰이 2회 미만이므로 오개념을 확정하지 않고 추가 진단이 필요합니다.',
    };
  }

  const typeCounts = new Map();
  for (const row of wrongRows) {
    const type = typeForRow(row);
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }
  const [hypothesisType] = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    hypothesisType: TYPES.includes(hypothesisType) ? hypothesisType : 'UNCERTAIN',
    status: 'UNCONFIRMED',
    conceptCode: stats.conceptCode,
    evidenceIds: wrongRows.slice(0, 5).map(row => row.assessmentId),
    confidence: Math.min(0.8, 0.35 + (observationCount - 2) * 0.1),
    observationCount,
    rationale: '반복 오답의 문항 유형을 바탕으로 한 미확정 가설이며 Backend 검수 전에는 확정하지 않습니다.',
  };
}

function strategyFor({ weaknessScore = 0, hypothesisType = 'UNCERTAIN' } = {}) {
  if (hypothesisType === 'RELATION_ERROR') return 'RELATION_COMPARISON_V1';
  if (hypothesisType === 'CAUSAL_ERROR') return 'CAUSAL_CHAIN_V1';
  if (hypothesisType === 'APPLICATION_ERROR') return 'APPLICATION_STEPWISE_V1';
  if (hypothesisType === 'UNCERTAIN') return 'DIAGNOSTIC_CHECK_V1';
  return weaknessScore >= 0.6 ? 'FOUNDATION_EXPLANATION_V1' : 'APPLICATION_STEPWISE_V1';
}

module.exports = { TYPES, diagnoseConcept, strategyFor };
