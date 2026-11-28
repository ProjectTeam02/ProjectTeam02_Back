/**
 * AI 튜터 개인화: 선수 개념 관계·오개념 가설·진단 근거·최근 평가 (BE-05)
 * 계약: ProjectTeam02_AI ConceptGraphContext / MisconceptionHypothesisContext / DiagnosisEvidenceContext / RecentAssessmentContext
 * 규칙
 *   - 개념 관계는 검수 승인(APPROVED)된 것만 보낸다. 승인되지 않은 관계는 확정된 학습 근거로 쓰지 않는다
 *     · 선수 개념(prerequisiteConcepts): 대상 개념에서 거슬러 올라가 깊이 2까지 (AI 서버도 깊이 2까지만 사용), 순환은 끊는다
 *     · 다음 개념(relatedConcepts, relationshipType=NEXT): 대상 개념을 선수로 두는 개념 (깊이 1)
 *     · 공개(PUBLISHED)된 개념만, 이름은 코드별 기준 버전(PUBLISHED 중 최신)
 *     · 학습자 숙련도(learnerConceptMastery)는 personalization/index.js가 본인 기록이 있는 선수 개념에만 붙인다 (#179)
 *   - 오개념 가설: 본인 가설 중 REJECTED가 아닌 것, 대상 개념이 있으면 그 개념만, 최근 수정 순 10개
 *     · 상태(UNCONFIRMED/CONFIRMED)를 그대로 보내 불확실한 가설이 확정 정보처럼 전달되지 않게 한다
 *     · 근거 ID는 본인 문제 제출 기록인 것만 남긴다 (다른 사용자 기록 차단)
 *   - 진단 근거(diagnosisEvidence): 위 가설의 근거 제출 기록 (최대 20개, evidenceType=QUESTION_SUBMISSION)
 *   - 최근 평가(recentAssessments): 대상 개념에 대한 본인 최근 제출 10개
 */
const MAX_DEPTH = 2;
const MAX_NODES = 50;
const MAX_HYPOTHESES = 10;
const MAX_EVIDENCE = 20;
const MAX_ASSESSMENTS = 10;

const BASE_TITLES = `
  base AS (                                                   -- 코드별 기준 버전 이름 (공개 개념만)
    SELECT DISTINCT ON (concept_code) concept_code, title
    FROM content.concepts
    WHERE status = 'PUBLISHED'
    ORDER BY concept_code, version DESC
  )`;

async function conceptGraphContext(manager, conceptCode) {
  if (!conceptCode) return null;
  const prerequisites = await manager.query(`
    WITH RECURSIVE pre AS (                                   -- 승인된 선수 관계를 거슬러 올라감
      SELECT p.prerequisite_concept_code AS code, 1 AS depth, p.display_order,
             ARRAY[p.concept_code, p.prerequisite_concept_code]::varchar[] AS path
      FROM content.concept_prerequisites p
      WHERE p.concept_code = $1 AND p.review_status = 'APPROVED'
      UNION ALL
      SELECT p.prerequisite_concept_code, pre.depth + 1, p.display_order, pre.path || p.prerequisite_concept_code
      FROM pre
      JOIN content.concept_prerequisites p ON p.concept_code = pre.code AND p.review_status = 'APPROVED'
      WHERE pre.depth < $2 AND NOT (p.prerequisite_concept_code = ANY(pre.path))
    ),
    best AS (                                                 -- 같은 개념은 가장 가까운 깊이 1건
      SELECT DISTINCT ON (code) code, depth, display_order FROM pre ORDER BY code, depth, display_order
    ),${BASE_TITLES}
    SELECT b.code, b.depth, base.title
    FROM best b JOIN base ON base.concept_code = b.code
    ORDER BY b.depth, b.display_order, b.code
    LIMIT $3`, [conceptCode, MAX_DEPTH, MAX_NODES]);
  const next = await manager.query(`
    WITH${BASE_TITLES}
    SELECT p.concept_code AS code, base.title
    FROM content.concept_prerequisites p
    JOIN base ON base.concept_code = p.concept_code
    WHERE p.prerequisite_concept_code = $1 AND p.review_status = 'APPROVED'
    ORDER BY p.display_order, p.concept_code
    LIMIT $2`, [conceptCode, MAX_NODES]);
  if (!prerequisites.length && !next.length) return null;
  const node = (row, relationshipType, depth) => ({ conceptCode: row.code, title: row.title, relationshipType, relationReviewStatus: 'APPROVED', depth });
  return {
    currentConceptCode: conceptCode,
    prerequisiteConcepts: prerequisites.map(row => node(row, 'PREREQUISITE', row.depth)),
    relatedConcepts: next.map(row => node(row, 'NEXT', 1)),
  };
}

async function misconceptionContext(manager, userId, conceptCode) {
  const hypotheses = await manager.query(`
    SELECT hypothesis_type, status::text AS status, concept_code, evidence_submission_ids::text[] AS evidence_ids
    FROM learning.misconception_hypotheses
    WHERE user_id = $1 AND status <> 'REJECTED' AND ($2::varchar IS NULL OR concept_code = $2)
    ORDER BY updated_at DESC
    LIMIT $3`, [userId, conceptCode, MAX_HYPOTHESES]);
  if (!hypotheses.length) return { misconceptionHypotheses: [], diagnosisEvidence: [] };

  const evidenceIds = [...new Set(hypotheses.flatMap(row => row.evidence_ids || []))];
  const own = evidenceIds.length ? await manager.query(`
    SELECT s.submission_id::text AS submission_id, s.question_id::text AS question_id
    FROM learning.question_submissions s
    JOIN learning.learning_attempts a ON a.attempt_id = s.attempt_id
    WHERE a.user_id = $1 AND s.submission_id = ANY($2::uuid[])`, [userId, evidenceIds]) : [];
  const ownIds = new Map(own.map(row => [row.submission_id, row.question_id]));

  const misconceptionHypotheses = hypotheses.map(row => ({
    hypothesisType: row.hypothesis_type,
    status: row.status,
    conceptCode: row.concept_code,
    evidenceIds: (row.evidence_ids || []).filter(evidenceId => ownIds.has(evidenceId)).slice(0, 20),
  }));
  const diagnosisEvidence = [...new Set(misconceptionHypotheses.flatMap(row => row.evidenceIds))]
    .slice(0, MAX_EVIDENCE)
    .map(evidenceId => ({ evidenceId, evidenceType: 'QUESTION_SUBMISSION', questionId: ownIds.get(evidenceId) }));
  return { misconceptionHypotheses, diagnosisEvidence };
}

async function recentAssessments(manager, userId, conceptCode) {
  if (!conceptCode) return [];
  // 일반 학습과 복습의 제출 기록을 합쳐 최신 10건을 AI Context에 전달한다.
  // 복습 응시를 시작하기만 한 미제출 행은 제외하고, 양쪽 모두 요청 사용자만 조회한다.
  const rows = await manager.query(`
    SELECT s.submission_id::text AS submission_id, s.question_id::text AS question_id, s.is_correct, s.submitted_at
    FROM (
      SELECT s.submission_id, s.question_id, s.is_correct, s.submitted_at
      FROM learning.question_submissions s
      JOIN learning.learning_attempts a ON a.attempt_id = s.attempt_id
      WHERE a.user_id = $1 AND s.submitted_at IS NOT NULL
      UNION ALL
      SELECT s.submission_id, s.question_id, s.is_correct, s.submitted_at
      FROM review.review_submissions s
      JOIN review.review_attempts a ON a.review_attempt_id = s.review_attempt_id
      WHERE a.user_id = $1 AND s.submitted_at IS NOT NULL
    ) s
    JOIN content.questions q ON q.question_id = s.question_id
    JOIN content.concepts c ON c.concept_id = q.concept_id
    WHERE c.concept_code = $2
    ORDER BY s.submitted_at DESC, s.submission_id DESC
    LIMIT $3`, [userId, conceptCode, MAX_ASSESSMENTS]);
  return rows.map(row => ({ assessmentId: row.submission_id, questionId: row.question_id, conceptCode, isCorrect: row.is_correct, assessedAt: row.submitted_at }));
}

module.exports = { conceptGraphContext, misconceptionContext, recentAssessments, MAX_DEPTH };
