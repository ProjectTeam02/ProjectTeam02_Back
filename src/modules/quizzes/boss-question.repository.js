const { BossAttemptQuestion } = require('@leren/database');
const AppError = require('../../common/errors/AppError');

const questionCount = 7;

async function draw(manager, topicId) {
  const rows = await manager.query(`
    SELECT question.question_id AS "questionId"
    FROM content.questions AS question
    JOIN content.concepts AS concept ON concept.concept_id = question.concept_id
    WHERE concept.topic_id = $1 AND question.status = 'PUBLISHED'
      AND NOT EXISTS (
        SELECT 1 FROM content.stage_questions AS assignment
        JOIN content.stages AS stage ON stage.stage_id = assignment.stage_id
        WHERE assignment.question_id = question.question_id AND stage.stage_type = 'NORMAL'
      )
      AND EXISTS (
        SELECT 1 FROM content.question_choices AS choice
        WHERE choice.question_id = question.question_id
        GROUP BY choice.question_id
        HAVING count(*) = 4 AND count(*) FILTER (WHERE choice.is_correct) = 1
      )
    ORDER BY random()
    LIMIT $2
  `, [topicId, questionCount]);
  if (rows.length !== questionCount) throw AppError.unavailable(`Boss에 출제 가능한 공개 문항 ${questionCount}개가 필요합니다.`);
  return rows.map(row => row.questionId);
}

async function save(manager, attemptId, questionIds) {
  await manager.getRepository(BossAttemptQuestion).insert(questionIds.map((questionId, index) => ({
    attemptId, questionOrder: index + 1, questionId,
  })));
}

async function findForAttempt(manager, attemptId, questionOrder) {
  const repo = manager.getRepository(BossAttemptQuestion);
  const mapping = await repo.findOne({ where: { attemptId, questionOrder }, relations: { question: true } });
  if (mapping) return mapping;
  // An existing snapshot with a missing slot must never fall back to the shared Stage pool.
  return await repo.existsBy({ attemptId }) ? null : undefined;
}

module.exports = { questionCount, draw, save, findForAttempt };
