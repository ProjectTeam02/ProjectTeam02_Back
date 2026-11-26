const { Concept, LearningAttempt, Stage, StageQuestion } = require('@leren/database');
const { currentQuestionOrder } = require('./attemptQuestion');
const { assertEligibleTutorQuestion } = require('./eligibleQuestion');
const { invalid, sameCandidate, UUID } = require('./dto/tutorMetadata.dto');
const { normalRules } = require('../quizzes/question-pool-policy');

function activeAttempt(manager, userId, attemptId, lock = false) {
  if (!attemptId) return null;
  return manager.getRepository(LearningAttempt).findOne({
    where: { attemptId, userId, status: 'IN_PROGRESS' },
    ...(lock ? { lock: { mode: 'pessimistic_read' } } : {}),
  });
}

async function publicStage(manager, stageId) {
  if (!stageId || !UUID.test(stageId)) return null;
  return manager.getRepository(Stage).findOneBy({ stageId, status: 'PUBLISHED', topic: { status: 'PUBLISHED' } });
}

async function publicConcept(manager, conceptCode, topicId) {
  return manager.getRepository(Concept).existsBy({
    conceptCode, status: 'PUBLISHED', topic: { status: 'PUBLISHED' }, ...(topicId ? { topicId } : {}),
  });
}

async function currentCandidate(manager, attempt, stage, context) {
  if (!attempt || stage?.stageType !== 'NORMAL' || stage.stageId !== attempt.stageId
    || attempt.maxQuestionCount !== normalRules.questions
    || attempt.requiredCorrectCount !== normalRules.correct || attempt.initialHp !== normalRules.hp) return null;
  const questionOrder = currentQuestionOrder(attempt);
  if (questionOrder === null) return null;
  const slot = await manager.getRepository(StageQuestion).findOneBy({ stageId: stage.stageId, questionOrder });
  if (!slot || (context.questionId && context.questionId !== slot.questionId)) return null;
  let question;
  try {
    question = await assertEligibleTutorQuestion(manager, slot.questionId);
  } catch (error) {
    if (error.statusCode === 404) return null;
    throw error;
  }
  const { concept } = question;
  if (concept.topicId !== stage.topicId
    || (context.topicId && context.topicId !== stage.topicId)
    || (context.conceptId && context.conceptId !== question.conceptId)
    || (context.conceptCode && context.conceptCode !== concept.conceptCode)) return null;
  return { questionId: question.questionId, stageId: stage.stageId, attemptId: attempt.attemptId, conceptCode: concept.conceptCode };
}

async function ownedEvidence(manager, userId, conceptCode, evidenceIds) {
  if (!conceptCode || !evidenceIds.length) return [];
  return manager.query(`
    SELECT s.submission_id::text AS "evidenceId", s.question_id::text AS "questionId"
    FROM learning.question_submissions s
    JOIN learning.learning_attempts a ON a.attempt_id = s.attempt_id
    JOIN content.questions q ON q.question_id = s.question_id
    JOIN content.concepts c ON c.concept_id = q.concept_id
    JOIN content.topics t ON t.topic_id = c.topic_id
    WHERE a.user_id = $1 AND c.concept_code = $2 AND s.submission_id = ANY($3::uuid[])
      AND s.submitted_at IS NOT NULL AND s.is_correct = false
      AND q.status = 'PUBLISHED' AND c.status = 'PUBLISHED' AND t.status = 'PUBLISHED'
    ORDER BY s.submitted_at DESC, s.submission_id`, [userId, conceptCode, evidenceIds]);
}

async function prepare(manager, userId, originalContext, personalization) {
  const context = originalContext || {};
  const attempt = await activeAttempt(manager, userId, context.attemptId);
  const stageMatches = !context.attemptId || (attempt && (!context.stageId || context.stageId === attempt.stageId));
  let stage = stageMatches ? await publicStage(manager,
    attempt?.stageId ?? context.stageId ?? personalization?.learnerProfile?.currentStageId) : null;
  const candidate = await currentCandidate(manager, attempt, stage, context);
  const conceptCode = context.conceptCode ?? candidate?.conceptCode
    ?? personalization?.learnerProfile?.conceptCode ?? personalization?.conceptGraphContext?.currentConceptCode ?? null;
  if (stage && ((attempt && !candidate) || (context.topicId && context.topicId !== stage.topicId)
    || (conceptCode && !candidate && !(await publicConcept(manager, conceptCode, stage.topicId))))) stage = null;

  // #43 derives fallback actions from context and learnerProfile. Pass only verified destinations.
  const { stageId: _stageId, attemptId: _attemptId, ...safeContext } = context;
  if (stage) safeContext.stageId = stage.stageId;
  if (stage && attempt) safeContext.attemptId = attempt.attemptId;
  if (conceptCode) safeContext.conceptCode = conceptCode;

  let personalizedContext = personalization;
  if (personalization) {
    const { learnerProfile, misconceptionHypotheses, diagnosisEvidence, ...remaining } = personalization;
    personalizedContext = remaining;
    if (learnerProfile) {
      const { currentStageId, ...profile } = learnerProfile;
      if (stage && stage.stageId === currentStageId) profile.currentStageId = currentStageId;
      if (Object.keys(profile).length) personalizedContext.learnerProfile = profile;
    }
    const hypothesis = misconceptionHypotheses?.find(item => item.conceptCode === conceptCode && item.status !== 'REJECTED');
    const receivedEvidence = new Set(diagnosisEvidence?.filter(item => item.evidenceType === 'QUESTION_SUBMISSION').map(item => item.evidenceId));
    const evidenceIds = (hypothesis?.evidenceIds ?? []).filter(id => UUID.test(id) && receivedEvidence.has(id));
    const rows = await ownedEvidence(manager, userId, conceptCode, evidenceIds);
    const seen = new Set();
    const evidence = rows.filter(row => !seen.has(row.questionId) && seen.add(row.questionId));
    if (evidence.length) {
      personalizedContext.misconceptionHypotheses = [{ ...hypothesis, evidenceIds: evidence.map(row => row.evidenceId) }];
      personalizedContext.diagnosisEvidence = evidence.map(row => ({ ...row, evidenceType: 'QUESTION_SUBMISSION' }));
    }
  }

  return {
    context: Object.keys(safeContext).length ? safeContext : null,
    personalizedContext: personalizedContext && Object.keys(personalizedContext).length ? personalizedContext : null,
    candidates: candidate ? [candidate] : [],
  };
}

async function validate(manager, userId, request, { tutoringMeta, proposedAction }) {
  const expectedConcept = request.context?.conceptCode ?? null;
  if (tutoringMeta) {
    if (tutoringMeta.conceptCode !== expectedConcept
      || (expectedConcept && !(await publicConcept(manager, expectedConcept)))) throw invalid('tutoringMeta.conceptCode');
    const { diagnosis } = tutoringMeta;
    // Observation aggregation is not defined. No observationCount or confidence is sent to #43.
    if (diagnosis.misconceptionType !== 'UNCERTAIN' || diagnosis.confidence !== 0 || !diagnosis.needsFollowup) {
      throw invalid('tutoringMeta.diagnosis');
    }
    if (diagnosis.evidenceQuestionIds.length) {
      const sent = request.personalizedContext?.diagnosisEvidence ?? [];
      const rows = await ownedEvidence(manager, userId, expectedConcept, sent.map(row => row.evidenceId));
      const verified = new Set(rows.map(row => row.questionId));
      if (diagnosis.evidenceQuestionIds.some(id => !sent.some(row => row.questionId === id) || !verified.has(id))) {
        throw invalid('diagnosis.evidenceQuestionIds');
      }
    }
  }
  if (!proposedAction) return;
  const { type, stageId, attemptId, conceptCode } = proposedAction;
  if (type === 'SOLVE_QUESTION') {
    if (!request.eligibleQuestionCandidates.some(candidate => sameCandidate(candidate, proposedAction))) {
      throw invalid('proposedAction.candidate');
    }
    const attempt = await activeAttempt(manager, userId, attemptId, true);
    const stage = await publicStage(manager, stageId);
    const current = await currentCandidate(manager, attempt, stage, request.context ?? {});
    if (!current || !sameCandidate(current, proposedAction)) throw invalid('proposedAction.currentQuestion');
    return;
  }
  if ((stageId && stageId !== request.context?.stageId) || (attemptId && attemptId !== request.context?.attemptId)
    || (conceptCode && conceptCode !== expectedConcept)) throw invalid('proposedAction.context');
  const attempt = await activeAttempt(manager, userId, attemptId, true);
  const destination = stageId ?? attempt?.stageId;
  const stage = await publicStage(manager, destination);
  if ((destination && !stage) || (attemptId && (!attempt || attempt.stageId !== stage?.stageId))
    || (conceptCode && !(await publicConcept(manager, conceptCode, stage?.topicId)))) throw invalid('proposedAction.destination');
}

module.exports = { prepare, validate };
