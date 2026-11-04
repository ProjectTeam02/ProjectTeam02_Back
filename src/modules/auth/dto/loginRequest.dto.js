/**
 * 로그인·토큰 재발급 요청 데이터 형식 파일
 * (POST /api/v1/auth/login, POST /api/v1/auth/refresh)
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 요청 필드명 유지. 로그인은 이메일 형식·비밀번호 정책을 검사하지 않는다(계정 존재 여부 노출 방지).
 *
 * 로그인 Body:   email string 필수 255자 이하(소문자 비교), password string 필수 128자 이하
 * 재발급 Body:   refreshToken string 필수 4096자 이하
 */
const fields = require('./authFields');

function parse(input) {
  const source = fields.body(input);
  return {
    email: fields.email(source.email, { checkFormat: false }),
    password: fields.password(source.password, { checkPolicy: false }),
  };
}

function parseRefresh(input) {
  const source = fields.body(input);
  return { refreshToken: fields.requiredString(source.refreshToken, 'refreshToken', fields.LIMITS.token) };
}

module.exports = { parse, parseRefresh };
