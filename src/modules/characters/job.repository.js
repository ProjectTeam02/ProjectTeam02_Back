/**
 * 캐릭터 PostgreSQL 접근 계층 파일
 * 백엔드 작업: 조회·저장 로직과 쿼리를 관리
 * 주의: 기존 DB 스키마와 환경변수 유지
 */
const { CharacterClass, UserCharacter, User } = require('@leren/database');

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
});
