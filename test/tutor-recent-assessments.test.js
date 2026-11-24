const assert = require('node:assert/strict');
const test = require('node:test');
const { recentAssessments } = require('../src/modules/tutor/personalization/conceptContext');

test('recentAssessments combines learning and review submissions without changing the AI DTO', async () => {
  const submittedAt = new Date('2026-11-24T03:00:00.000Z');
  let called = 0;
  const manager = {
    async query(sql, params) {
      called += 1;
      assert.deepEqual(params, ['user-1', 'ECO-01', 10]);
      assert.match(sql, /FROM learning\.question_submissions/);
      assert.match(sql, /JOIN learning\.learning_attempts/);
      assert.match(sql, /FROM review\.review_submissions/);
      assert.match(sql, /JOIN review\.review_attempts/);
      assert.match(sql, /UNION ALL/);
      assert.equal((sql.match(/a\.user_id = \$1/g) || []).length, 2);
      assert.equal((sql.match(/s\.submitted_at IS NOT NULL/g) || []).length, 2);
      assert.match(sql, /c\.concept_code = \$2/);
      assert.match(sql, /ORDER BY s\.submitted_at DESC, s\.submission_id DESC/);
      return [
        { submission_id: 'review-submission', question_id: 'question-2', is_correct: true, submitted_at: submittedAt },
        { submission_id: 'learning-submission', question_id: 'question-1', is_correct: false, submitted_at: submittedAt },
      ];
    },
  };
  const result = await recentAssessments(manager, 'user-1', 'ECO-01');
  assert.equal(called, 1);
  assert.deepEqual(result, [
    { assessmentId: 'review-submission', questionId: 'question-2', conceptCode: 'ECO-01', isCorrect: true, assessedAt: submittedAt },
    { assessmentId: 'learning-submission', questionId: 'question-1', conceptCode: 'ECO-01', isCorrect: false, assessedAt: submittedAt },
  ]);
});

test('recentAssessments does not query without a target concept', async () => {
  const manager = { query: () => { throw new Error('must not query'); } };
  assert.deepEqual(await recentAssessments(manager, 'user-1', null), []);
});
