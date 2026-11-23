/**
 * AI 튜터 개인화: 학습자 프로필(learnerProfile) 집계 (BE-04)
 * 백엔드 작업: 사용자의 실제 퀴즈 제출 기록으로 개념별 정답률·최근 오답 수·마지막 학습 시각·현재 Stage를 만든다.
 * 계약: ProjectTeam02_AI LearnerProfileContext (정답률·숙련도 0~1, 최근 오답 수 0 이상 정수)
 * 규칙
 *   - 대상 개념: context.conceptCode → context.conceptId의 개념 코드 → knowledgeScope.conceptCodes가 1개일 때 그 코드 → 없으면 개념 통계 없음
 *     (개념 코드·ID가 공개 개념인지는 conceptScope.js가 먼저 확인한다)
 *   - 개념 통계: 같은 개념 코드의 모든 버전 문항에 대한 본인 제출(learning.question_submissions) 기준. 다른 사용자 기록은 섞지 않는다
 *   - 정답률 = 정답 수 / 제출 수 (소수 넷째 자리). 제출이 없으면 null (0으로 만들지 않음)
 *   - 최근 오답 수 = 그 개념의 최근 제출 RECENT_WINDOW(10)개 중 오답 수. 제출이 없으면 null
 *   - 마지막 학습 시각 = 대상 개념이 있으면 그 개념의 마지막 제출, 없으면 전체 마지막 제출
 *   - 현재 Stage = context.stageId → 진행 중(IN_PROGRESS)인 Stage 중 가장 최근에 바뀐 것
 *   - 숙련도(estimatedMastery)·취약도(weaknessScore)는 계산 정책이 없어 보내지 않는다 (임의 수치를 만들지 않음)
 *   - 보낼 값이 하나도 없으면 null → 기본 튜터 흐름
 */
const RECENT_WINDOW = 10;

async function targetConceptCode(manager, input) {
  const context = input.context || {};
  if (context.conceptCode) return context.conceptCode;
  if (context.conceptId) {
    const [row] = await manager.query('SELECT concept_code FROM content.concepts WHERE concept_id = $1', [context.conceptId]);
    if (row) return row.concept_code;
  }
  const codes = input.knowledgeScope?.conceptCodes || [];
  return codes.length === 1 ? codes[0] : null;
}

async function conceptStats(manager, userId, conceptCode) {
  const [row] = await manager.query(`
    WITH subs AS (                                            -- 본인의 해당 개념(모든 버전) 문항 제출
      SELECT s.is_correct, s.submitted_at
      FROM learning.question_submissions s
      JOIN learning.learning_attempts a ON a.attempt_id = s.attempt_id
      JOIN content.questions q          ON q.question_id = s.question_id
      JOIN content.concepts c           ON c.concept_id = q.concept_id
      WHERE a.user_id = $1 AND c.concept_code = $2
    ),
    recent AS (                                               -- 최근 제출 N개
      SELECT is_correct FROM subs ORDER BY submitted_at DESC LIMIT $3
    )
    SELECT (SELECT count(*) FROM subs)::int                                AS total,
           (SELECT count(*) FILTER (WHERE is_correct) FROM subs)::int      AS correct,
           (SELECT count(*) FILTER (WHERE NOT is_correct) FROM recent)::int AS recent_incorrect,
           (SELECT max(submitted_at) FROM subs)                            AS last_at`, [userId, conceptCode, RECENT_WINDOW]);
  return row;
}

async function lastSubmissionAt(manager, userId) {
  const [row] = await manager.query(`
    SELECT max(s.submitted_at) AS last_at
    FROM learning.question_submissions s
    JOIN learning.learning_attempts a ON a.attempt_id = s.attempt_id
    WHERE a.user_id = $1`, [userId]);
  return row?.last_at ?? null;
}

async function currentStageId(manager, userId, input) {
  if (input.context?.stageId) return input.context.stageId;
  const [row] = await manager.query(`
    SELECT stage_id FROM learning.user_stage_progress
    WHERE user_id = $1 AND progress_status = 'IN_PROGRESS'
    ORDER BY updated_at DESC
    LIMIT 1`, [userId]);
  return row?.stage_id ?? null;
}

async function buildLearnerProfile(manager, userId, input) {
  const conceptCode = await targetConceptCode(manager, input);
  const profile = { currentStageId: await currentStageId(manager, userId, input) };
  if (conceptCode) {
    const stats = await conceptStats(manager, userId, conceptCode);
    profile.conceptCode = conceptCode;
    if (stats && stats.total > 0) {
      profile.accuracyRate = Math.round((stats.correct / stats.total) * 10000) / 10000;
      profile.recentIncorrectCount = stats.recent_incorrect;
      profile.lastStudiedAt = stats.last_at;
    }
  } else {
    profile.lastStudiedAt = await lastSubmissionAt(manager, userId);
  }
  // 개념 코드만 있고 기록이 하나도 없으면 보낼 의미가 없다
  const meaningful = profile.currentStageId || profile.accuracyRate != null || profile.lastStudiedAt;
  if (!meaningful) return null;
  return Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== null && value !== undefined));
}

module.exports = { buildLearnerProfile, RECENT_WINDOW };
