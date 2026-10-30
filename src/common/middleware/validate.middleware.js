/**
 * 요청값 검증 미들웨어
 * 백엔드 작업: 기능별 Schema를 이용한 입력 검증 연결
 * 주의: 검증 실패 시 공통 오류 응답 형식을 사용
 */
module.exports = function validateMiddleware(_schema) {
  return (_req, _res, next) => next();
};
