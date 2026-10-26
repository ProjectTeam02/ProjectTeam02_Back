require('dotenv').config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900),
  refreshTokenTtlSeconds: Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 2592000),
  fastapiBaseUrl: process.env.FASTAPI_BASE_URL || 'http://127.0.0.1:8001',
  fastapiInternalToken: process.env.FASTAPI_INTERNAL_TOKEN,
  fastapiTimeoutMs: Number(process.env.FASTAPI_TIMEOUT_MS || 5000),
  aiDailyLimit: Number(process.env.AI_DAILY_LIMIT || 20),
};
