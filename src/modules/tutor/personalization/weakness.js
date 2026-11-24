/**
 * Backend-owned learner weakness calculation.
 *
 * All inputs are already scoped to one authenticated user.  The AI server only
 * receives the resulting signals and never calculates or persists mastery.
 */
const WEIGHTS = Object.freeze({
  errorRate: 0.40,
  repeatError: 0.25,
  reassessmentFailure: 0.20,
  recencyRisk: 0.15,
});

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function validDate(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function recencyRisk(lastStudiedAt, now = new Date(), decayDays = 30) {
  const last = validDate(lastStudiedAt);
  const current = validDate(now);
  if (!last || !current) return 0.5;
  const elapsedDays = Math.max(0, (current.getTime() - last.getTime()) / 86400000);
  return clamp(elapsedDays / Math.max(1, decayDays));
}

function dataSufficiency(totalAttempts, reassessmentCount) {
  if (totalAttempts < 2) return 'LOW';
  if (totalAttempts < 5 || reassessmentCount === 0) return 'MEDIUM';
  return 'HIGH';
}

function calculateWeakness(input = {}, now = new Date()) {
  const totalAttempts = Math.max(0, Number(input.totalAttempts) || 0);
  const wrongCount = Math.max(0, Number(input.wrongCount) || 0);
  const reassessmentCount = Math.max(0, Number(input.reassessmentCount) || 0);
  const reassessmentWrongCount = Math.max(0, Number(input.reassessmentWrongCount) || 0);
  const components = {
    errorRate: totalAttempts ? clamp(wrongCount / totalAttempts) : 0,
    repeatError: wrongCount > 1 ? clamp((wrongCount - 1) / wrongCount) : 0,
    reassessmentFailure: reassessmentCount
      ? clamp(reassessmentWrongCount / reassessmentCount)
      : 0.5,
    recencyRisk: recencyRisk(input.lastStudiedAt, now),
  };
  const weaknessScore = totalAttempts === 0
    ? 0
    : round(
      WEIGHTS.errorRate * components.errorRate
      + WEIGHTS.repeatError * components.repeatError
      + WEIGHTS.reassessmentFailure * components.reassessmentFailure
      + WEIGHTS.recencyRisk * components.recencyRisk,
    );
  const uncertainty = totalAttempts === 0
    ? 1
    : round(1 - Math.min(1, totalAttempts / 5) * (reassessmentCount ? 1 : 0.8));
  return {
    weaknessScore,
    estimatedMastery: round(1 - weaknessScore),
    uncertainty,
    dataSufficiency: dataSufficiency(totalAttempts, reassessmentCount),
    components,
    weights: WEIGHTS,
    totalAttempts,
    wrongCount,
    reassessmentCount,
    reassessmentWrongCount,
  };
}

module.exports = {
  WEIGHTS,
  clamp,
  recencyRisk,
  calculateWeakness,
};
