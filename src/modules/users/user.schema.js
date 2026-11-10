/**
 * 사용자 요청값 검증
 * 백엔드 작업: API 입력 데이터의 유효성 규칙을 관리
 * 주의: 기존 필드명과 오류 응답 형식을 유지한다. 실제 규칙은 dto/ 파일에 있다.
 */
const notificationSetting = require('../notifications/dto/notificationSetting.dto');
const AppError = require('../../common/errors/AppError');

function notification({ body }) {
  return { body: notificationSetting.parse(body) };
}

function characterClass({ body }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 1
      || typeof body.classCode !== 'string' || !/^[A-Z][A-Z0-9_]{0,29}$/.test(body.classCode)) {
    throw AppError.validation('요청 본문에는 대문자 직업 코드(classCode)만 입력해 주세요.');
  }
  return { body: { classCode: body.classCode } };
}

module.exports = { notification, characterClass };
