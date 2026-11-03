<<<<<<< HEAD
=======
/**
 * 사용자 PostgreSQL 접근
 * 백엔드 작업: 조회·저장 로직과 TypeORM Repository를 관리
 * 주의: 기존 DB 스키마와 트랜잭션 정책을 유지한다.
 */
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
const { User, UserGrowth } = require('@leren/database');

function repository(dataSource) {
  return {
<<<<<<< HEAD
    async findwithGrowth(id, manager = dataSource.manager) {
=======
    async findWithGrowth(id, manager = dataSource.manager) {
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
      const user = await manager.getRepository(User).findOneBy({ userId: id });
      if (!user) return null;
      const growth = await manager.getRepository(UserGrowth).findOneBy({ userId: id });
      return { user, growth };
    },
  };
}

module.exports = repository;
