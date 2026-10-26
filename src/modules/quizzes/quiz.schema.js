const AppError = require('../../common/errors/AppError');

function uuid(value, name) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw AppError.validation(`${name}이(가) 올바른 UUID가 아닙니다.`);
  }
  return value;
}

function submit({ body, params, headers }) {
  const quizId = uuid(params.id, 'quizId');
  if (typeof body.choiceId !== 'string' || !body.choiceId.trim()) throw AppError.validation('choiceId가 필요합니다.');
  const choiceId = uuid(body.choiceId.trim(), 'choiceId');
  const attemptId = body.attemptId ? uuid(body.attemptId, 'attemptId') : null;
  const idempotencyKey = headers['idempotency-key'] || null;
  if (idempotencyKey && (typeof idempotencyKey !== 'string' || idempotencyKey.length > 200)) throw AppError.validation('Idempotency-Key가 올바르지 않습니다.');
  return { params: { id: quizId }, body: { choiceId, attemptId, idempotencyKey } };
}

module.exports = { submit };
