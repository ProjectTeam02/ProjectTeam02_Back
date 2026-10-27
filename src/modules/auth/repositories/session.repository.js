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
