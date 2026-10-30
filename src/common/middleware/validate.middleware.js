/**
 * 요청값 검증 미들웨어
 * 백엔드 작업: 기능별 Schema를 실행하고 정규화된 입력을 전달
 * 주의: 검증 실패는 공통 AppError로 전달한다.
 */
const AppError = require('../errors/AppError');

module.exports = function validateMiddleware(schema) {
  return (req, _res, next) => {
    try {
      const result = schema({
        body: req.body,
        params: req.params,
        query: req.query,
        headers: req.headers,
      });
      if (result && result.body !== undefined) req.body = result.body;
      if (result && result.params !== undefined) req.params = result.params;
      if (result && result.query !== undefined) req.query = result.query;
      next();
    } catch (error) {
      next(error instanceof AppError ? error : AppError.validation(error.message));
    }
  };
};
