const { createHash } = require('node:crypto');
const AppError = require('../errors/AppError');
const hash = value => createHash('sha256').update(value).digest('hex');
function questionKey(value) {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,100}$/.test(value)) {
    throw AppError.validation('Idempotency-Key: 공백 없는 ASCII 문자 1~100자가 필요합니다.');
  }
  // 13 + 64 = 77 characters. Other request types must never be replayed as QUESTION_GEN.
  return `QUESTION_GEN:${hash(value)}`;
}
function fingerprint(input) {
  return hash(JSON.stringify({ conceptId: input.conceptId.toLowerCase(), topic: input.topic,
    difficulty: input.difficulty, questionCount: input.questionCount, learningObjectives: input.learningObjectives }));
}
module.exports = { questionKey, fingerprint };
