/**
 * 애플리케이션 공통 오류 객체
 * 백엔드 작업: 상태 코드와 오류 코드를 일관되게 전달
 * 주의: 응답 형식 변경은 error.middleware.js와 함께 검토
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

AppError.validation = (message, details) => {
  const error = new AppError(message, 422, 'VALIDATION_ERROR');
  error.details = details;
  return error;
};
AppError.unauthorized = (message = '인증이 필요합니다.') => (
  new AppError(message, 401, 'UNAUTHORIZED')
);
AppError.forbidden = (message = '접근 권한이 없습니다.') => (
  new AppError(message, 403, 'FORBIDDEN')
);
AppError.notFound = (message = '리소스를 찾을 수 없습니다.') => (
  new AppError(message, 404, 'NOT_FOUND')
);
AppError.conflict = (message = '요청이 충돌했습니다.') => (
  new AppError(message, 409, 'CONFLICT')
);
AppError.unavailable = (message = '서비스를 일시적으로 사용할 수 없습니다.') => (
  new AppError(message, 503, 'SERVICE_UNAVAILABLE')
);
AppError.rateLimited = (message = 'AI 사용량을 초과했습니다.') => (
  new AppError(message, 429, 'RATE_LIMITED')
);

module.exports = AppError;
