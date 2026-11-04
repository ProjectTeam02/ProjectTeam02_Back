/**
 * 회원가입 요청 데이터 형식 파일 (POST /api/v1/auth/signup)
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 요청 필드명(email, password, nickname) 유지
 *
 * 요청 Body
 *   email           string, 필수, 255자 이하, 이메일 형식, 소문자로 저장
 *   password        string, 필수, 8~128자 (세부 강도 정책은 협의 후 추가)
 *   nickname        string, 필수, 앞뒤 공백 제거 후 1~30자
 *   passwordConfirm string, 선택. 보내면 password와 같아야 함 (피그마 11번 비밀번호 확인)
 */
const AppError = require('../../../common/errors/AppError');
const fields = require('./authFields');

function parse(input) {
  const source = fields.body(input);
  const email = fields.email(source.email);
  const password = fields.password(source.password);
  const nickname = fields.nickname(source.nickname);
  if (source.passwordConfirm !== undefined
    && (typeof source.passwordConfirm !== 'string' || source.passwordConfirm.trim() !== password)) {
    throw AppError.validation('password와 passwordConfirm이 일치하지 않습니다.');
  }
  return { email, password, nickname };
}

module.exports = { parse };
