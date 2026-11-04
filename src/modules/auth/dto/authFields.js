/**
 * 인증 DTO 공통 필드 검사 파일
 * 백엔드 작업: 이메일·비밀번호·닉네임·토큰 입력 규칙을 한곳에서 관리
 * 주의: 길이 제한은 DB 컬럼(users.email 255, users.nickname 30)을 넘지 않게 맞춘다.
 */
const AppError = require('../../../common/errors/AppError');

const LIMITS = Object.freeze({
  email: 255,
  passwordMin: 8,
  passwordMax: 128,
  nickname: 30,
  token: 4096,
  redirectUri: 2048,
});

function requiredString(value, name, max) {
  if (typeof value !== 'string' || !value.trim()) {
    throw AppError.validation(`${name}은(는) 비어 있지 않은 문자열이어야 합니다.`);
  }
  if (value.length > max) throw AppError.validation(`${name}은(는) ${max}자 이하여야 합니다.`);
  return value.trim();
}

/** 이메일: 앞뒤 공백 제거 + 소문자. checkFormat=false는 로그인처럼 형식을 노출하지 않을 때 사용 */
function email(value, { checkFormat = true } = {}) {
  const normalized = requiredString(value, 'email', LIMITS.email).toLowerCase();
  if (checkFormat && !/^\S+@\S+\.\S+$/.test(normalized)) throw AppError.validation('email 형식이 올바르지 않습니다.');
  return normalized;
}

/**
 * 비밀번호: 기존 구현과 같이 앞뒤 공백을 제거한 값으로 해시·비교한다(기존 계정 호환).
 * checkPolicy=false는 로그인 시(가입 당시 정책과 무관하게 비교)
 */
function password(value, { checkPolicy = true } = {}) {
  const trimmed = requiredString(value, 'password', LIMITS.passwordMax);
  if (checkPolicy && trimmed.length < LIMITS.passwordMin) {
    throw AppError.validation(`password는 ${LIMITS.passwordMin}자 이상이어야 합니다.`);
  }
  return trimmed;
}

/** 닉네임: 앞뒤 공백 제거 후 1~30자 (한글 1글자 = 1자, DB varchar(30) 기준) */
function nickname(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw AppError.validation('nickname은(는) 비어 있지 않은 문자열이어야 합니다.');
  }
  const trimmed = value.trim();
  if ([...trimmed].length > LIMITS.nickname) throw AppError.validation(`nickname은(는) ${LIMITS.nickname}자 이하여야 합니다.`);
  return trimmed;
}

function body(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

module.exports = { LIMITS, requiredString, email, password, nickname, body };
