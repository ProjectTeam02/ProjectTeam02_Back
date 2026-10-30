/**
 * 공통 오류 처리 미들웨어
 * 백엔드 작업: 예외를 일관된 API 오류 응답으로 변환
 * 주의: 기존 상태 코드와 오류 코드 형식 유지
 */
module.exports = function errorMiddleware(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(err.code ? { code: err.code } : {}),
  });
};
