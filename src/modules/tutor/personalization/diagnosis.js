/**
 * 교수 전략 선택 (#179)
 * 오개념 판정 자체는 learning.misconception_hypotheses(#164, conceptContext.js)가 단일 출처다.
 * 여기서는 그 가설과 Backend 취약도로 AI에 넘길 teachingStrategy만 고른다.
 * 규칙
 *   - 근거 제출이 2건 미만인 UNCONFIRMED 가설은 단일 오답 관찰로 보고 유형별 전략을 쓰지 않는다 → 진단 질문
 *   - 기록이 없거나(NONE) 부족하면(LOW) 진단 질문
 *   - 유형이 확인된 가설: 관계/인과/적용 오류별 전략
 *   - 그 외: 취약도 0.6 이상이면 기초 설명, 미만이면 단계별 적용
 */
const TYPES = Object.freeze([
  'KNOWLEDGE_GAP',
  'RELATION_ERROR',
  'CAUSAL_ERROR',
  'APPLICATION_ERROR',
  'UNCERTAIN',
]);
const STRATEGY_VERSION = 'personalization-v1';
const MIN_EVIDENCE = 2;

function establishedHypothesis(hypotheses = []) {
  return hypotheses.find(row => row && row.hypothesisType && (
    row.status === 'CONFIRMED' || (row.evidenceIds || []).length >= MIN_EVIDENCE
  )) || null;
}

function strategyFor({ weaknessScore = null, dataSufficiency = null, hypotheses = [] } = {}) {
  const hypothesisType = establishedHypothesis(hypotheses)?.hypothesisType || null;
  if (hypothesisType === 'RELATION_ERROR') return 'RELATION_COMPARISON_V1';
  if (hypothesisType === 'CAUSAL_ERROR') return 'CAUSAL_CHAIN_V1';
  if (hypothesisType === 'APPLICATION_ERROR') return 'APPLICATION_STEPWISE_V1';
  if (weaknessScore === null || dataSufficiency === 'NONE' || dataSufficiency === 'LOW'
    || hypothesisType === 'UNCERTAIN' || (!hypothesisType && hypotheses.length)) {
    return 'DIAGNOSTIC_CHECK_V1';
  }
  if (hypothesisType === 'KNOWLEDGE_GAP' || weaknessScore >= 0.6) return 'FOUNDATION_EXPLANATION_V1';
  return 'APPLICATION_STEPWISE_V1';
}

module.exports = { TYPES, STRATEGY_VERSION, MIN_EVIDENCE, establishedHypothesis, strategyFor };
