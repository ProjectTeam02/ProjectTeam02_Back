/**
 * 인증 요청값 검증
 * 백엔드 작업: API 입력 데이터의 유효성 규칙을 관리
 * 주의: 기존 필드명과 오류 응답 형식을 유지한다. 실제 규칙은 dto/ 파일에 있다.
 */
const env = require('../../config/env');
const signupRequest = require('./dto/signupRequest.dto');
const loginRequest = require('./dto/loginRequest.dto');
const kakaoRequest = require('./dto/kakaoRequest.dto');

function signup({ body }) {
  return { body: signupRequest.parse(body) };
}

function login({ body }) {
  return { body: loginRequest.parse(body) };
}

function refresh({ body }) {
  return { body: loginRequest.parseRefresh(body) };
}

function kakao({ body = {} }) {
  return { body: kakaoRequest.parseLegacyLogin(body, env.kakaoAllowedRedirectUris) };
}

module.exports = { signup, login, refresh, kakao };
