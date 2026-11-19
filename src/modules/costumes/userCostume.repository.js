const { UserEquippedCostume } = require('@leren/database');

function findEquippedCostume(manager, userId, withCostume = false) {
  // 기존 부위별 장착 데이터가 둘이면 가장 최근 장착을 표시한다. 조회에서 기록을 수정하지 않는다.
  return manager.getRepository(UserEquippedCostume).findOne({
    where: { userId },
    order: { equippedAt: 'DESC', itemId: 'ASC' },
    relations: { costume: withCostume },
  });
}

module.exports = { findEquippedCostume };
