/**
 * Kakao OAuth 통신
 * 백엔드 작업: 카카오 프로필 요청과 응답 변환을 관리
 * 주의: OAuth 토큰과 민감정보를 로그에 남기지 않는다.
 */
const AppError = require('../common/errors/AppError');
<<<<<<< HEAD

class KakaoClient {
  async getProfile(accessToken) {
    try {
      const response = await fetch('https://kapi.kakao.com/v2/user/me', { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw AppError.unauthorized('Kakao 토큰이 유효하지 않습니다.');
      return response.json();
    } catch (error) {
      if (error.code === 'UNAUTHORIZED') throw error;
      throw AppError.unavailable('Kakao 인증 서버에 연결할 수 없습니다.');
    }
=======
const env = require('../config/env');

const TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const PROFILE_URL = 'https://kapi.kakao.com/v2/user/me';
const TIMEOUT_MS = 5000;

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw AppError.validation(`${name}이(가) 필요합니다.`);
  }
  return value;
}

function validRedirectUri(redirectUri) {
  requiredString(redirectUri, 'Redirect URI');
  let parsed;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw AppError.validation('Redirect URI는 유효한 HTTP(S) URL이어야 합니다.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname ||
      parsed.username || parsed.password || parsed.hash || redirectUri !== redirectUri.trim()) {
    throw AppError.validation('Redirect URI는 유효한 HTTP(S) URL이어야 합니다.');
  }
  return redirectUri;
}

async function requestJson(url, options, clientError) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response;
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } catch {
      if (controller.signal.aborted) throw AppError.unavailable('Kakao API 요청 시간이 초과되었습니다.');
      throw AppError.unavailable('Kakao 인증 서버에 연결할 수 없습니다.');
    }

    if (!response.ok) {
      if (response.status >= 500) throw AppError.unavailable('Kakao 인증 서버를 사용할 수 없습니다.');
      throw clientError();
    }

    let data;
    try {
      data = await response.json();
    } catch {
      if (controller.signal.aborted) throw AppError.unavailable('Kakao API 요청 시간이 초과되었습니다.');
      throw AppError.unavailable('Kakao API 응답 형식이 올바르지 않습니다.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw AppError.unavailable('Kakao API 응답 형식이 올바르지 않습니다.');
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

class KakaoClient {
  async getAccessToken(authorizationCode, redirectUri) {
    requiredString(authorizationCode, '인가 코드');
    validRedirectUri(redirectUri);
    if (typeof env.kakaoRestApiKey !== 'string' || !env.kakaoRestApiKey.trim() ||
        typeof env.kakaoClientSecret !== 'string' || !env.kakaoClientSecret.trim()) {
      throw AppError.unavailable('Kakao OAuth 설정이 완료되지 않았습니다.');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.kakaoRestApiKey,
      client_secret: env.kakaoClientSecret,
      redirect_uri: redirectUri,
      code: authorizationCode,
    });
    const data = await requestJson(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body,
    }, () => AppError.validation('Kakao 인가 코드가 유효하지 않거나 만료되었습니다.'));
    if (typeof data.access_token !== 'string' || !data.access_token.trim()) {
      throw AppError.unavailable('Kakao API 응답에 Access Token이 없습니다.');
    }
    return data;
  }

  async getProfile(accessToken) {
    requiredString(accessToken, 'Access Token');
    const data = await requestJson(PROFILE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    }, () => AppError.unauthorized('Kakao 토큰이 유효하지 않습니다.'));
    if (!((typeof data.id === 'number' && Number.isSafeInteger(data.id) && data.id > 0) ||
        (typeof data.id === 'string' && /^[1-9]\d*$/.test(data.id)))) {
      throw AppError.unavailable('Kakao API 응답에 사용자 ID가 없습니다.');
    }
    return data;
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
  }
}

module.exports = KakaoClient;
