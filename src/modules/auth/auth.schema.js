/**
 * 인증 요청값 검증
 * 백엔드 작업: API 입력 데이터의 유효성 규칙을 관리
 * 주의: 기존 필드명과 오류 응답 형식을 유지한다.
 */
const AppError = require('../../common/errors/AppError');
<<<<<<< HEAD
=======
const env = require('../../config/env');
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3

function requiredString(value, name, max = 255) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw AppError.validation(`${name}은(는) 비어 있지 않은 문자열이어야 합니다.`);
  }
  return value.trim();
}

function signup({ body }) {
  const email = requiredString(body.email, 'email', 320).toLowerCase();
  const password = requiredString(body.password, 'password', 128);
  if (password.length < 8) throw AppError.validation('password는 8자 이상이어야 합니다.');
  const nickname = requiredString(body.nickname, 'nickname', 50);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw AppError.validation('email 형식이 올바르지 않습니다.');
  return { body: { email, password, nickname } };
}

function login({ body }) {
  return { body: {
    email: requiredString(body.email, 'email', 320).toLowerCase(),
    password: requiredString(body.password, 'password', 128),
  } };
}

function refresh({ body }) {
  return { body: { refreshToken: requiredString(body.refreshToken, 'refreshToken', 4096) } };
}

<<<<<<< HEAD
function kakao({ body }) {
  return { body: { accessToken: requiredString(body.accessToken, 'accessToken', 4096) } };
=======
function kakao({ body = {} }) {
  const authorizationCode = requiredString(body.authorizationCode, 'authorizationCode', 4096);
  const redirectUri = requiredString(body.redirectUri, 'redirectUri', 2048);
  let uri;
  try { uri = new URL(redirectUri); } catch (_error) {
    throw AppError.validation('redirectUri는 유효한 HTTP(S) URL이어야 합니다.');
  }
  if (body.redirectUri !== redirectUri || !['http:', 'https:'].includes(uri.protocol)
    || !uri.hostname || uri.username || uri.password || uri.hash) {
    throw AppError.validation('redirectUri는 유효한 HTTP(S) URL이어야 합니다.');
  }
  if (!env.kakaoAllowedRedirectUris.length) {
    throw AppError.unavailable('Kakao Redirect URI 허용 목록이 설정되지 않았습니다.');
  }
  if (!env.kakaoAllowedRedirectUris.includes(redirectUri)) {
    throw AppError.validation('허용되지 않은 redirectUri입니다.');
  }
  return { body: { authorizationCode, redirectUri } };
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
}

module.exports = { signup, login, refresh, kakao };
