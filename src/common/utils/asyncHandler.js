/**
 * 비동기 Controller 래퍼
 * 백엔드 작업: Promise 예외를 공통 오류 미들웨어로 전달
 * 주의: 비동기 라우터에서 next 누락을 방지
 */
module.exports = function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
};
