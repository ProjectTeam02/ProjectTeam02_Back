/**
 * 요청 빈도 제한 미들웨어
 * 백엔드 작업: 인증·AI API의 호출량 제한 정책 구현
 * 주의: 정책 확정 전에는 라우터에 연결하지 않는다.
 */
module.exports = function rateLimitMiddleware(_req, _res, next) {
  // 현재는 제한 로직이 구현되지 않은 스캐폴드다.
  next();
};
