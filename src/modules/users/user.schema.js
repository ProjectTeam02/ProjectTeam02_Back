/**
 * 사용자 요청값 검증
 * 백엔드 작업: API 입력 데이터의 유효성 규칙을 관리
 * 주의: 기존 필드명과 오류 응답 형식을 유지한다.
 */
const AppError = require('../../common/errors/AppError');

function notification({ body }) {
  if (typeof body.learningOn !== 'boolean') throw AppError.validation('learningOn은 boolean이어야 합니다.');
  return { body: { learningOn: body.learningOn } };
}

module.exports = { notification };
