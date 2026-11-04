/**
 * 토큰 응답 데이터 형식 파일
 * 백엔드 작업: 발급한 LEREN 토큰을 응답 형식으로 변환
 * 주의: 기존 필드(accessToken, refreshToken) 유지. tokenType·expiresIn은 추가 필드
 *
 *   accessToken   string  Authorization: Bearer 헤더에 사용
 *   refreshToken  string  POST /auth/refresh Body로 전달, 재발급 때마다 새 값으로 교체(회전)
 *   tokenType     'Bearer'
 *   expiresIn     number  accessToken 유효 시간(초), ACCESS_TOKEN_TTL_SECONDS
 */
const env = require('../../../config/env');

function tokens({ accessToken, refreshToken }) {
  return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: env.accessTokenTtlSeconds };
}

module.exports = { tokens };
