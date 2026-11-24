const repository = require('./repository');
const { calculateWeakness } = require('./weakness');
const { diagnoseConcept, strategyFor } = require('./diagnosis');

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
    stageId: row.stage_id ?? row.stageId ?? null,
    questionCategory: row.question_category ?? row.questionCategory ?? null,
    learningObjective: row.learning_objective ?? row.learningObjective ?? null,
    assessmentType: row.assessment_type ?? row.assessmentType ?? 'LEARNING',
  };
}

function groupedRows(rows) {
  const groups = new Map();
  for (const raw of rows || []) {
    const row = normalizeRow(raw);
    if (!row.conceptCode || row.isCorrect == null) continue;
    const list = groups.get(row.conceptCode) || [];
    list.push(row);
    groups.set(row.conceptCode, list);
  }
  return groups;
}

function conceptStats(conceptCode, rows, now) {
  const wrongRows = rows.filter(row => row.isCorrect === false);
  const reassessmentRows = rows.filter(row => row.assessmentType === 'REASSESSMENT');
  const wrongReassessmentRows = reassessmentRows.filter(row => row.isCorrect === false);
  const latest = rows
    .map(row => row.submittedAt)
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
  const weakness = calculateWeakness({
    totalAttempts: rows.length,
    wrongCount: wrongRows.length,
    reassessmentCount: reassessmentRows.length,
    reassessmentWrongCount: wrongReassessmentRows.length,
    lastStudiedAt: latest,
  }, now);
  return {
    conceptCode,
    rows,
    wrongRows,
    latest,
    weakness,
    accuracyRate: rows.length ? (rows.length - wrongRows.length) / rows.length : null,
    currentStageId: rows.find(row => row.stageId)?.stageId || null,
  };
}

function profileFrom(stats, requestedStageId) {
  if (!stats) return null;
  return {
    conceptCode: stats.conceptCode,
    accuracyRate: stats.accuracyRate,
    recentIncorrectCount: stats.wrongRows.slice(0, 5).length,
    estimatedMastery: stats.weakness.estimatedMastery,
    weaknessScore: stats.weakness.weaknessScore,
    lastStudiedAt: stats.latest?.toISOString() || null,
    currentStageId: requestedStageId || stats.currentStageId,
    dataSufficiency: stats.weakness.dataSufficiency,
    uncertainty: stats.weakness.uncertainty,
    weaknessComponents: stats.weakness.components,
  };
}

function graphFrom(verifiedContext, statsByCode) {
  if (!verifiedContext || String(verifiedContext.verificationStatus).toUpperCase() !== 'VERIFIED') return null;
  const prerequisites = (verifiedContext.prerequisiteConcepts || []).map(node => ({
    conceptCode: node.conceptCode,
    title: node.title || null,
    relationshipType: node.relationshipType || 'PREREQUISITE',
    relationReviewStatus: node.relationReviewStatus || 'APPROVED',
    learnerConceptMastery: statsByCode.get(node.conceptCode)?.weakness.estimatedMastery ?? null,
    depth: node.depth || 1,
  }));
  return {
    currentConceptCode: verifiedContext.conceptCode || null,
    prerequisiteConcepts: prerequisites,
    relatedConcepts: [],
    learnerConceptMastery: Object.fromEntries(
      prerequisites
        .filter(node => node.learnerConceptMastery != null)
        .map(node => [node.conceptCode, node.learnerConceptMastery]),
    ),
  };
}

function contextFromRows(rows, options = {}) {
  const groups = groupedRows(rows);
  const statsByCode = new Map([...groups].map(([code, list]) => [
    code,
    conceptStats(code, list, options.now || new Date()),
  ]));
  if (!statsByCode.size) return null;
  const requestedCode = options.conceptCode || options.verifiedContext?.conceptCode;
  const current = (requestedCode && statsByCode.get(requestedCode))
    || (options.conceptId && [...statsByCode.values()].find(item => item.rows.some(row => row.conceptId === options.conceptId)))
    || [...statsByCode.values()].sort((a, b) => b.weakness.weaknessScore - a.weakness.weaknessScore)[0];
  if (!current) return null;
  const hypothesis = diagnoseConcept(current);
  const strategyId = strategyFor({
    weaknessScore: current.weakness.weaknessScore,
    hypothesisType: hypothesis.hypothesisType,
  });
  const recentRows = current.rows.slice(0, 10);
  return {
    personalizedContext: {
      learnerProfile: profileFrom(current, options.stageId),
      misconceptionHypotheses: [hypothesis],
      diagnosisEvidence: current.wrongRows.slice(0, 5).map(row => ({
        evidenceId: row.assessmentId,
        evidenceType: 'QUESTION_SUBMISSION',
        reviewStatus: 'RECORDED',
        questionId: row.questionId,
      })),
      recentAssessments: recentRows.map(row => ({
        assessmentId: row.assessmentId,
        questionId: row.questionId,
        conceptCode: row.conceptCode,
        isCorrect: row.isCorrect,
        assessedAt: row.submittedAt?.toISOString() || null,
      })),
      teachingStrategy: {
        strategyId,
        strategyVersion: 'personalization-v1',
      },
      conceptGraphContext: graphFrom(options.verifiedContext, statsByCode),
    },
    currentStats: current,
    statsByCode,
  };
}

async function buildPersonalizedContext(manager, options = {}) {
  const rows = await repository.assessmentRows(manager, options);
  return contextFromRows(rows, options);
}

async function buildTutorPersonalization(manager, options = {}) {
  const result = await buildPersonalizedContext(manager, options);
  if (!result) return { personalizedContext: null, recommendation: null, reassessmentQuestions: [] };
  const conceptCode = result.currentStats.conceptCode;
  const reassessmentQuestions = await repository.reassessmentCandidates(
    manager,
    options.userId,
    conceptCode,
  );
  return {
    personalizedContext: result.personalizedContext,
    recommendation: {
      conceptCode,
      weaknessScore: result.currentStats.weakness.weaknessScore,
      reason: result.currentStats.weakness.weaknessScore >= 0.6
        ? '반복 오답 또는 재평가 실패가 있어 우선 복습이 필요합니다.'
        : '최근 학습 결과를 확인하고 승인된 유사 문항으로 이해도를 재평가합니다.',
      action: reassessmentQuestions.length ? 'REASSESS_APPROVED_QUESTIONS' : 'REVIEW_CONCEPT',
    },
    reassessmentQuestions: reassessmentQuestions.map(row => ({
      questionId: row.question_id,
      questionCode: row.question_code,
      version: row.version,
      conceptCode: row.concept_code,
      difficulty: row.difficulty,
      status: 'PUBLISHED',
    })),
  };
}

module.exports = {
  normalizeRow,
  groupedRows,
  contextFromRows,
  buildPersonalizedContext,
  buildTutorPersonalization,
};
