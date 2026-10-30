/**
 * 환경변수 기본값 설정
 * 백엔드 작업: 서버 실행에 필요한 환경변수의 기본값 관리
 * 주의: Secret과 토큰 값은 파일에 하드코딩하지 않는다.
 */
require('dotenv').config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
};
