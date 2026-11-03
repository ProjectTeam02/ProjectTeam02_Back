/**
 * 환경변수 기본값 설정
 * 백엔드 작업: 서버 실행에 필요한 환경변수의 기본값 관리
 * 주의: Secret과 토큰 값은 파일에 하드코딩하지 않는다.
 */
require('dotenv').config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900),
  refreshTokenTtlSeconds: Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 2592000),
  fastapiBaseUrl: process.env.FASTAPI_BASE_URL || 'http://127.0.0.1:8000',
  fastapiInternalToken: process.env.FASTAPI_INTERNAL_TOKEN,
  fastapiTimeoutMs: Number(process.env.FASTAPI_TIMEOUT_MS || 5000),
  aiDailyLimit: Number(process.env.AI_DAILY_LIMIT || 20),
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,
  kakaoClientSecret: process.env.KAKAO_CLIENT_SECRET,
  kakaoAllowedRedirectUris: (process.env.KAKAO_ALLOWED_REDIRECT_URIS || '')
    .split(',').map((uri) => uri.trim()).filter(Boolean),
  kakaoOauthCallbackUrl: process.env.KAKAO_OAUTH_CALLBACK_URL,
  kakaoAppDeepLink: process.env.KAKAO_APP_DEEP_LINK,
  kakaoAllowedAppDeepLinks: (process.env.KAKAO_ALLOWED_APP_DEEP_LINKS || '')
    .split(',').map((uri) => uri.trim()).filter(Boolean),
  kakaoOauthStoreMode: process.env.KAKAO_OAUTH_STORE_MODE,
  kakaoOauthStateTtlSeconds: Number(process.env.KAKAO_OAUTH_STATE_TTL_SECONDS || 300),
  kakaoOauthExchangeTtlSeconds: Number(process.env.KAKAO_OAUTH_EXCHANGE_TTL_SECONDS || 60),
  kakaoLegacyDirectLoginEnabled: process.env.KAKAO_LEGACY_DIRECT_LOGIN_ENABLED === 'true',
};
