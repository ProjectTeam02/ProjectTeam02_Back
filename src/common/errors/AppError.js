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

module.exports = AppError;
