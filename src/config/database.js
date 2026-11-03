/**
 * PostgreSQL 연결 설정
 * 백엔드 작업: TypeORM DataSource 연결과 오류 처리 관리
 * 주의: 환경변수 사용, DB 스키마와 마이그레이션 임의 변경 금지
 */
const { AppDataSource } = require('@leren/database');

async function connectDatabase() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  return AppDataSource;
}

module.exports = { AppDataSource, connectDatabase };
