/**
 * 공통 오류 처리 미들웨어
 * 백엔드 작업: 예외를 일관된 API 오류 응답으로 변환
 * 주의: DB 장애와 기존 상태 코드 처리를 유지한다.
 */
module.exports = function errorMiddleware(err, _req, res, _next) {
  const databaseFailure = err?.name === 'QueryFailedError'
    || ['ECONNREFUSED', '57P01', '28P01', '08006'].includes(err?.code);
  const statusCode = databaseFailure ? 503 : (err.statusCode || 500);
  if (statusCode === 500) console.error({ name: err.name, code: err.code });
  res.status(statusCode).json({
    success: false,
    message: databaseFailure ? '데이터베이스를 사용할 수 없습니다.' : (err.message || 'Internal server error'),
    code: databaseFailure ? 'SERVICE_UNAVAILABLE' : (err.code || 'INTERNAL_ERROR'),
    ...(!databaseFailure && err.details ? { details: err.details } : {}),
  });
};
