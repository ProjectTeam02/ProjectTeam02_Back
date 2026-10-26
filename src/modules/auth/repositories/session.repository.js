const prisma = require('../../../config/prisma');

function repository(db = prisma) {
  return {
    create: (data) => db.authSession.create({ data }),
    findActive: (id) => db.authSession.findFirst({ where: { id, revokedAt: null } }),
    revoke: (id) => db.authSession.update({ where: { id }, data: { revokedAt: new Date() } }),
    revokeAll: (userId) => db.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  };
}

module.exports = repository;
