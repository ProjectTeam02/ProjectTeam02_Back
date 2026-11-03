/**
 * 사용자 PostgreSQL 접근
 * 백엔드 작업: 조회·저장 로직과 TypeORM Repository를 관리
 * 주의: 기존 DB 스키마와 트랜잭션 정책을 유지한다.
 */
const {
  User, UserGrowth, UserWallet, UserCharacter, UserEquippedCostume,
  UserStageProgress, ProgressStatus,
} = require('@leren/database');

function repository(dataSource) {
  async function findWithGrowth(id, manager = dataSource.manager) {
    const user = await manager.getRepository(User).findOneBy({ userId: id });
    if (!user) return null;
    const growth = await manager.getRepository(UserGrowth).findOneBy({ userId: id });
    return { user, growth };
  }

  return {
    findWithGrowth,
    async findMyPage(userId, manager = dataSource.manager) {
      const base = await findWithGrowth(userId, manager);
      if (!base) return null;

      // Each query is scoped to the authenticated user; no cross-user data is read.
      const wallet = await manager.getRepository(UserWallet).findOneBy({ userId });
      const character = await manager.getRepository(UserCharacter).findOne({
        where: { userId }, relations: { characterClass: true },
      });
      const equippedCostumes = await manager.getRepository(UserEquippedCostume).find({
        where: { userId }, relations: { costume: true },
      });
      const completedStageCount = await manager.getRepository(UserStageProgress).count({
        where: { userId, progressStatus: ProgressStatus.Passed },
      });

      return { ...base, wallet, character, equippedCostumes, completedStageCount };
    },
  };
}

module.exports = repository;
