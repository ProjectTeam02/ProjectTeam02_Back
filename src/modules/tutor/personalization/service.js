/**
 * 학습자 취약도 신호 (#179)
 * 본인 학습 제출 + 복습(재평가) 제출을 개념별로 묶어 weakness.js 정책으로 점수를 만든다.
 * personalization/index.js(provider)가 learnerProfile·선수 개념 숙련도·teachingStrategy에 붙이고,
 * GET /api/v1/tutor/personalization이 같은 provider 결과와 재평가 후보를 보여준다.
 * 모든 조회는 repository.js에서 user_id로 제한한다.
 */
const repository = require('./repository');
const { calculateWeakness } = require('./weakness');

function dateValue(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeRow(row) {
  return {
    assessmentId: row.assessment_id ?? row.assessmentId,
    questionId: row.question_id ?? row.questionId,
    conceptId: row.concept_id ?? row.conceptId,
    conceptCode: row.concept_code ?? row.conceptCode,
    isCorrect: row.is_correct ?? row.isCorrect,
    submittedAt: dateValue(row.submitted_at ?? row.submittedAt),
    assessmentType: row.assessment_type ?? row.assessmentType ?? 'LEARNING',
  };
}

function groupedRows(rows) {
  const groups = new Map();
  for (const raw of rows || []) {
    const row = normalizeRow(raw);
    // 정답 여부가 없는 행(미제출·결측)은 점수에 넣지 않는다
    if (!row.conceptCode || typeof row.isCorrect !== 'boolean') continue;
    const list = groups.get(row.conceptCode) || [];
    list.push(row);
    groups.set(row.conceptCode, list);
  }
  return groups;
}

function weaknessFromRows(rows = [], now = new Date()) {
  const reassessments = rows.filter(row => row.assessmentType === 'REASSESSMENT');
  const latest = rows.map(row => row.submittedAt).filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
  return calculateWeakness({
    totalAttempts: rows.length,
    wrongCount: rows.filter(row => row.isCorrect === false).length,
    reassessmentCount: reassessments.length,
    reassessmentWrongCount: reassessments.filter(row => row.isCorrect === false).length,
    lastStudiedAt: latest,
  }, now);
}

/** conceptCode → weakness 결과. 기록이 없는 개념은 Map에 없다 */
function weaknessByConcept(rows, now = new Date()) {
  return new Map([...groupedRows(rows)].map(([code, list]) => [code, weaknessFromRows(list, now)]));
}

/** AI LearnerProfileContext에 붙일 필드. 값이 없는 항목은 빼서 null을 보내지 않는다 */
function profileSignals(weakness) {
  const signals = {
    weaknessScore: weakness.weaknessScore,
    estimatedMastery: weakness.estimatedMastery,
    uncertainty: weakness.uncertainty,
    dataSufficiency: weakness.dataSufficiency,
    weaknessComponents: weakness.weaknessScore === null ? null : weakness.components,
  };
  return Object.fromEntries(Object.entries(signals).filter(([, value]) => value !== null && value !== undefined));
}

async function learnerWeakness(manager, userId, now = new Date()) {
  return weaknessByConcept(await repository.assessmentRows(manager, { userId }), now);
}

function reassessmentQuestions(rows) {
  return rows.map(row => ({
    questionId: row.question_id,
    questionCode: row.question_code,
    version: row.version,
    conceptCode: row.concept_code,
    difficulty: row.difficulty,
    status: 'PUBLISHED',
  }));
}

function recommendationFor(conceptCode, weakness, candidateCount) {
  if (!conceptCode || !weakness || weakness.weaknessScore === null) return null;
  return {
    conceptCode,
    weaknessScore: weakness.weaknessScore,
    dataSufficiency: weakness.dataSufficiency,
    reason: weakness.weaknessScore >= 0.6
      ? '반복 오답 또는 재평가 실패가 있어 우선 복습이 필요합니다.'
      : '최근 학습 결과를 확인하고 승인된 유사 문항으로 이해도를 재평가합니다.',
    action: candidateCount ? 'REASSESS_APPROVED_QUESTIONS' : 'REVIEW_CONCEPT',
  };
}

module.exports = {
  normalizeRow,
  groupedRows,
  weaknessFromRows,
  weaknessByConcept,
  profileSignals,
  learnerWeakness,
  reassessmentQuestions,
  recommendationFor,
};
