/**
 * 퀴즈 요청값 검증
 * 백엔드 작업: API 입력 데이터의 유효성 규칙을 관리
 * 주의: 기존 필드명과 오류 응답 형식을 유지한다.
 */
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
