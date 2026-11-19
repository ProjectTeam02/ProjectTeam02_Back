const { UserEquippedCostume } = require('@leren/database');

function findEquippedCostume(manager, userId, withCostume = false) {
  return manager.getRepository(UserEquippedCostume).findOne({
    where: { userId },
    relations: { costume: withCostume },
  });
}

module.exports = { findEquippedCostume };
