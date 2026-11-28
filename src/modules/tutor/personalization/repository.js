/**
 * Read-only learning signals for one authenticated learner.
 * Every query is explicitly constrained by user_id; no AI-owned persistence is
 * used here and no source/question is promoted by this module.
 */
const EVENTS_SQL = `
WITH events AS (
  SELECT
    qs.submission_id AS assessment_id,
    q.question_id,
    c.concept_id,
    c.concept_code,
    qs.is_correct,
    qs.submitted_at,
    la.stage_id,
    q.question_category,
    q.learning_objective,
    'LEARNING' AS assessment_type
  FROM learning.question_submissions qs
  JOIN learning.learning_attempts la ON la.attempt_id = qs.attempt_id
  JOIN content.questions q ON q.question_id = qs.question_id
  JOIN content.concepts c ON c.concept_id = q.concept_id
  WHERE la.user_id = $1
    AND qs.submitted_at IS NOT NULL
    AND q.status = 'PUBLISHED'
  UNION ALL
  SELECT
    rs.submission_id AS assessment_id,
    q.question_id,
    c.concept_id,
    c.concept_code,
    rs.is_correct,
    rs.submitted_at,
    NULL::uuid AS stage_id,
    q.question_category,
    q.learning_objective,
    'REASSESSMENT' AS assessment_type
  FROM review.review_submissions rs
  JOIN review.review_attempts ra ON ra.review_attempt_id = rs.review_attempt_id
  JOIN content.questions q ON q.question_id = rs.question_id
  JOIN content.concepts c ON c.concept_id = q.concept_id
  WHERE ra.user_id = $1
    AND rs.submitted_at IS NOT NULL
    AND q.status = 'PUBLISHED'
)
SELECT assessment_id, question_id, concept_id, concept_code, is_correct,
       submitted_at, stage_id, question_category, learning_objective,
       assessment_type
  FROM events
 WHERE ($2::varchar IS NULL OR concept_code = $2)
   AND ($3::uuid IS NULL OR concept_id = $3)
 ORDER BY submitted_at DESC, assessment_id DESC
 LIMIT 500
`;

const REASSESSMENT_CANDIDATES_SQL = `
SELECT q.question_id, q.question_code, q.version, c.concept_code, q.difficulty
  FROM content.questions q
  JOIN content.concepts c ON c.concept_id = q.concept_id
 WHERE q.status = 'PUBLISHED'
   AND c.status = 'PUBLISHED'
   AND c.concept_code = $2
   AND NOT EXISTS (
     SELECT 1
       FROM learning.question_submissions qs
       JOIN learning.learning_attempts la ON la.attempt_id = qs.attempt_id
      WHERE la.user_id = $1 AND qs.question_id = q.question_id
   )
   AND NOT EXISTS (
     SELECT 1
       FROM review.review_submissions rs
       JOIN review.review_attempts ra ON ra.review_attempt_id = rs.review_attempt_id
      WHERE ra.user_id = $1 AND rs.question_id = q.question_id
   )
 ORDER BY q.updated_at DESC, q.question_id ASC
 LIMIT 3
`;

async function assessmentRows(manager, { userId, conceptCode = null, conceptId = null }) {
  if (!manager || typeof manager.query !== 'function') return [];
  return manager.query(EVENTS_SQL, [userId, conceptCode || null, conceptId || null]);
}

async function reassessmentCandidates(manager, userId, conceptCode) {
  if (!manager || typeof manager.query !== 'function' || !conceptCode) return [];
  return manager.query(REASSESSMENT_CANDIDATES_SQL, [userId, conceptCode]);
}

module.exports = {
  EVENTS_SQL,
  REASSESSMENT_CANDIDATES_SQL,
  assessmentRows,
  reassessmentCandidates,
};
