const prisma = require('../../config/prisma');

function repository(db = prisma) {
  return { findWithGrowth: (id) => db.user.findUnique({ where: { id }, include: { growth: true } }) };
}

module.exports = repository;
