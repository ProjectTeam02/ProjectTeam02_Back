const AppError = require('../../common/errors/AppError');

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

function kakao({ body }) {
  return { body: { accessToken: requiredString(body.accessToken, 'accessToken', 4096) } };
}

module.exports = { signup, login, refresh, kakao };
