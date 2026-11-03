/**
 * 인증 PostgreSQL 접근
 * 백엔드 작업: 조회·저장 로직과 TypeORM Repository를 관리
 * 주의: 기존 DB 스키마와 트랜잭션 정책을 유지한다.
 */
const { UserSession } = require('@leren/database');
const { IsNull, MoreThan } = require('typeorm');

function repository(dataSource) {
  const repoFor = (manager = dataSource.manager) => manager.getRepository(UserSession);
  return {
    create: (data, manager) => {
      const repo = repoFor(manager);
      return repo.save(repo.create(data));
    },
    findActive: (id, userId, manager) => repoFor(manager).findOne({
      where: { sessionId: id, ...(userId ? { userId } : {}), revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    }),
    revoke: (id, reason = 'LOGOUT', manager) => repoFor(manager).update({ sessionId: id }, { revokedAt: new Date(), revokeReason: reason }),
    revokeAll: (userId, manager) => repoFor(manager).update({ userId, revokedAt: IsNull() }, { revokedAt: new Date(), revokeReason: 'LOGOUT' }),
  };
}

module.exports = repository;
