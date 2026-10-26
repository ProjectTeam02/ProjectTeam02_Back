module.exports = function errorMiddleware(err, _req, res, _next) {
  const databaseFailure = err?.name?.startsWith('PrismaClient')
    || ['P1000', 'P1001', 'P1002', 'P1008'].includes(err?.code);
  const statusCode = databaseFailure ? 503 : (err.statusCode || 500);
  if (statusCode === 500) console.error({ name: err.name, code: err.code });
  res.status(statusCode).json({
    success: false,
    message: databaseFailure ? '데이터베이스를 사용할 수 없습니다.' : (err.message || 'Internal server error'),
    code: databaseFailure ? 'SERVICE_UNAVAILABLE' : (err.code || 'INTERNAL_ERROR'),
    ...(!databaseFailure && err.details ? { details: err.details } : {}),
  });
};
