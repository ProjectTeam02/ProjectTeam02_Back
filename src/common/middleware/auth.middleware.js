/**
 * 사용자 인증 미들웨어
 * 백엔드 작업: JWT 검증 후 인증 사용자 정보를 요청에 연결
 * 주의: 실제 인증 정책 구현 전까지 보호 API에 연결하지 않는다.
 */
module.exports = function authMiddleware(_req, _res, next) {
  // 현재는 인증 로직이 구현되지 않은 스캐폴드다.
  next();
};
