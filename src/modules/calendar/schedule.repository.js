/**
 * 달력 PostgreSQL 접근 계층 파일
 * 백엔드 작업: 조회·저장 로직과 쿼리를 관리
 * 주의: 기존 DB 스키마와 환경변수 유지
 */
const { StudyPlan } = require('@leren/database');
const { IsNull } = require('typeorm');

module.exports = function repository(manager) {
  const repo = manager.getRepository(StudyPlan);
  const activeWhere = (userId, planId) => ({ userId, planId, deletedAt: IsNull() });
  return {
    findActive: (userId, planId, lock = false) => repo.findOne({
      where: activeWhere(userId, planId), ...(lock ? { lock: { mode: 'pessimistic_write' } } : {}),
    }),
    create: data => repo.save(repo.create(data)),
    updateActive: (userId, planId, values) => repo.update(activeWhere(userId, planId), values),
  };
};
