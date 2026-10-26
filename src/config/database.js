// DB 연결: database/ 패키지(@leren/database)의 TypeORM DataSource를 사용 (app_user 계정)
// 엔티티·Enum도 같은 패키지에서 가져온다: const { User, AccountStatus } = require('@leren/database');
const { AppDataSource } = require('@leren/database');

async function connectDatabase() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  return AppDataSource;
}

module.exports = { AppDataSource, connectDatabase };
