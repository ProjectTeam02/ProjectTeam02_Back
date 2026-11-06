/**
 * 카카오 로그인 요청 데이터 형식 파일
 * 대상: POST /auth/kakao/start, GET /auth/kakao/callback(state 형식), POST /auth/kakao/exchange,
 *       POST /auth/kakao(개발·테스트 전용 직접 로그인)
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 필드명·오류 메시지 유지. 허용되지 않은 필드는 거절한다(OAuth 값 오염 방지).
 *
 * start Body     codeChallenge string 43자 base64url (PKCE S256), codeChallengeMethod 'S256'
 * exchange Body  loginCode string 43자 base64url, codeVerifier string 43~128자, loginAttemptId uuid
 * kakao Body     authorizationCode string 4096자 이하, redirectUri 허용 목록과 정확히 일치하는 HTTP(S) URL
 */
const AppError = require('../../../common/errors/AppError');
const { LIMITS, requiredString } = require('./authFields');

const OAUTH_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));

function parseStart(input) {
  if (!isObject(input) || !onlyKeys(input, ['codeChallenge', 'codeChallengeMethod'])
    || typeof input.codeChallenge !== 'string' || !OAUTH_TOKEN.test(input.codeChallenge)
    || input.codeChallengeMethod !== 'S256') {
    throw AppError.validation('S256 codeChallenge가 필요합니다.');
  }
  return { codeChallenge: input.codeChallenge, codeChallengeMethod: 'S256' };
}

function isOAuthState(value) {
  return typeof value === 'string' && OAUTH_TOKEN.test(value);
}

function parseExchange(input) {
  if (!isObject(input) || !onlyKeys(input, ['loginCode', 'codeVerifier', 'loginAttemptId'])
    || typeof input.loginCode !== 'string' || !OAUTH_TOKEN.test(input.loginCode)
    || typeof input.codeVerifier !== 'string' || !CODE_VERIFIER.test(input.codeVerifier)
    || typeof input.loginAttemptId !== 'string' || !UUID.test(input.loginAttemptId)) {
    throw AppError.validation('로그인 교환 코드와 앱 검증 정보가 필요합니다.');
  }
  return { loginCode: input.loginCode, codeVerifier: input.codeVerifier, loginAttemptId: input.loginAttemptId };
}

function parseLegacyLogin(input, allowedRedirectUris = []) {
  const source = isObject(input) ? input : {};
  const authorizationCode = requiredString(source.authorizationCode, 'authorizationCode', LIMITS.token);
  const redirectUri = requiredString(source.redirectUri, 'redirectUri', LIMITS.redirectUri);
  let uri;
  try { uri = new URL(redirectUri); } catch (_error) {
    throw AppError.validation('redirectUri는 유효한 HTTP(S) URL이어야 합니다.');
  }
  if (source.redirectUri !== redirectUri || !['http:', 'https:'].includes(uri.protocol)
    || !uri.hostname || uri.username || uri.password || uri.hash) {
    throw AppError.validation('redirectUri는 유효한 HTTP(S) URL이어야 합니다.');
  }
  if (!allowedRedirectUris.length) {
    throw AppError.unavailable('Kakao Redirect URI 허용 목록이 설정되지 않았습니다.');
  }
  if (!allowedRedirectUris.includes(redirectUri)) {
    throw AppError.validation('허용되지 않은 redirectUri입니다.');
  }
  return { authorizationCode, redirectUri };
}

module.exports = { parseStart, parseExchange, parseLegacyLogin, isOAuthState };
