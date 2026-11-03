/**
 * 요청 ID 미들웨어
 * 백엔드 작업: 요청 추적용 ID 발급과 응답 Header 설정
 * 주의: 하나의 요청에서 생성한 ID를 로그와 응답에 일관되게 사용
 */
const crypto = require('crypto');

module.exports = function requestIdMiddleware(req, res, next) {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};
