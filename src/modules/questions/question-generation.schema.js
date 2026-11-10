/** FastAPI PR #22 contract. No external calls or persistence in this adapter. */
const AppError = require('../../common/errors/AppError');
const { generatedDraft } = require('./question.schema');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const difficulties = { EASY: 'BEGINNER', MEDIUM: 'INTERMEDIATE', HARD: 'ADVANCED' };
const types = new Set(['CONCEPT', 'COMPARISON', 'SCENARIO', 'APPLICATION']);
function text(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}
function request(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object'
    || Object.keys(body).some(key => !['conceptId', 'topic', 'difficulty', 'questionCount', 'learningObjectives'].includes(key))
    || typeof body.conceptId !== 'string' || !UUID.test(body.conceptId)
    || !text(body.topic, 120) || typeof body.difficulty !== 'string' || !Object.hasOwn(difficulties, body.difficulty)
    || !Number.isInteger(body.questionCount) || body.questionCount < 1 || body.questionCount > 100
    || !Array.isArray(body.learningObjectives) || body.learningObjectives.length < 1 || body.learningObjectives.length > 10
    || body.learningObjectives.some(value => !text(value, 240))) {
    throw AppError.validation('conceptId, topic, difficulty, questionCount(1~100), learningObjectives를 확인해 주세요.');
  }
  const learningObjectives = body.learningObjectives.map(value => value.trim());
  if (new Set(learningObjectives.map(value => value.toLocaleLowerCase())).size !== learningObjectives.length) {
    throw AppError.validation('학습 목표가 중복되었습니다.');
  }
  return { conceptId: body.conceptId, topic: body.topic.trim(), difficulty: body.difficulty,
    questionCount: body.questionCount, learningObjectives };
}
function invalid() { throw AppError.unavailable('AI 문제 생성 응답이 요청 또는 검증 규격과 일치하지 않습니다.'); }
function response(body, input, resolveSourceIds) {
  if (!body || body.status !== 'COMPLETED' || body.error != null
    || body.topic !== input.topic || body.difficulty !== input.difficulty
    || !Array.isArray(body.questions) || body.questions.length !== input.questionCount
    || !Array.isArray(body.validation) || !Array.isArray(body.sourceIds)) invalid();
  const questionTexts = new Set();
  const usedSourceIds = new Set();
  for (const record of body.validation) {
    if (!record || !Number.isInteger(record.questionIndex) || record.questionIndex < 0
      || record.questionIndex >= input.questionCount || !Number.isInteger(record.attempt) || record.attempt < 1
      || !['APPROVE', 'REVISE', 'REJECT'].includes(record.decision)
      || !Array.isArray(record.issues) || record.issues.some(issue => !text(issue, 500))
      || typeof record.feedback !== 'string' || record.feedback.length > 2000) invalid();
  }
  const drafts = body.questions.map((q, index) => {
    if (!q || !types.has(q.questionType) || !text(q.question, 2000) || q.question.trim().length < 10
      || !text(q.explanation, 3000) || q.explanation.trim().length < 10
      || !input.learningObjectives.includes(q.learningObjective)
      || !Array.isArray(q.choices) || q.choices.length !== 4
      || !Number.isInteger(q.correctAnswerIndex) || q.correctAnswerIndex < 0 || q.correctAnswerIndex > 3
      || !Array.isArray(q.sourceIds) || q.sourceIds.length < 1 || q.sourceIds.length > 10
      || q.sourceIds.some(id => !text(id, 200)) || new Set(q.sourceIds).size !== q.sourceIds.length) invalid();
    const normalizedText = q.question.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    if (questionTexts.has(normalizedText)) invalid();
    questionTexts.add(normalizedText);
    q.sourceIds.forEach(id => usedSourceIds.add(id));
    // Only the final independent verdict counts; revision history is retained on the job.
    const records = body.validation.filter(record => record.questionIndex === index).sort((a, b) => a.attempt - b.attempt);
    if (new Set(records.map(record => record.attempt)).size !== records.length) invalid();
    const verdict = records.at(-1);
    if (!verdict || verdict.decision !== 'APPROVE' || verdict.independentAnswerIndex !== q.correctAnswerIndex
      || verdict.issues.length) invalid();
    try {
      return generatedDraft({ body: {
        conceptId: input.conceptId, questionText: q.question, explanation: q.explanation,
        difficulty: difficulties[input.difficulty], sourceDocumentIds: resolveSourceIds(q.sourceIds),
        choices: q.choices.map((choice, i) => ({ text: choice, isCorrect: i === q.correctAnswerIndex })),
      } }).body;
    } catch (error) {
      if (error.code === 'VALIDATION_ERROR') invalid();
      throw error;
    }
  });
  if (new Set(body.sourceIds).size !== body.sourceIds.length || body.sourceIds.length !== usedSourceIds.size
    || body.sourceIds.some(id => !usedSourceIds.has(id))) invalid();
  return drafts;
}
module.exports = { request, response };
