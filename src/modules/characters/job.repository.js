/**
 * 캐릭터 PostgreSQL 접근 계층 파일
 * 백엔드 작업: 조회·저장 로직과 쿼리를 관리
 * 주의: 기존 DB 스키마와 환경변수 유지
 */
const {
  CharacterClass, UserCharacter, User, UserCostume, UserEquippedCostume, CostumeAcquireType, CostumeCategory,
} = require('@leren/database');

module.exports = manager => ({
  listActive: () => manager.find(CharacterClass, {
    where: { isActive: true },
    order: { sortOrder: 'ASC', classCode: 'ASC' },
  }),
  lockUser: userId => manager.findOne(User, {
    where: { userId }, lock: { mode: 'pessimistic_write' },
  }),
  findSelection: userId => manager.findOne(UserCharacter, {
    where: { userId }, relations: { characterClass: true },
  }),
  findActiveForSelection: classCode => manager.findOne(CharacterClass, {
    where: { classCode, isActive: true }, lock: { mode: 'pessimistic_read' },
  }),
  insertSelection: (userId, classId, firstSelectedAt) =>
    manager.insert(UserCharacter, { userId, classId, firstSelectedAt }),
  completeOnboarding: (userId, onboardingCompletedAt) =>
    manager.update(User, { userId }, { onboardingCompletedAt }),
  // 직업 기본 한벌옷 지급. 이미 보유하면 그대로 둠 (직업 선택·직업 변경 공통)
  grantDefaultCostume: (userId, itemId) => manager.createQueryBuilder()
    .insert().into(UserCostume)
    .values({ userId, itemId, acquireType: CostumeAcquireType.Default })
    .orIgnore().execute(),
  // 장착한 한벌옷이 없을 때만 장착. 이미 장착한 옷은 바꾸지 않음
  equipIfEmpty: (userId, itemId) => manager.createQueryBuilder()
    .insert().into(UserEquippedCostume)
    .values({ userId, category: CostumeCategory.Outfit, itemId })
    .orIgnore().execute(),
});
