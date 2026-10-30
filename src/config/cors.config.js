/**
 * CORS 설정
 * 백엔드 작업: 허용 Origin과 인증 요청 정책 관리
 * 주의: 운영 환경에서 허용 Origin을 와일드카드로 열지 않는다.
 */
module.exports = {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
};
