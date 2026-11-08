/**
 * 학습 주제 PostgreSQL 접근 계층 파일
 * 백엔드 작업: 조회·저장 로직과 쿼리를 관리
 * 주의: 기존 DB 스키마와 환경변수 유지
 */
const { Topic } = require('@leren/database');

module.exports = manager => ({
  published: () => manager.getRepository(Topic).find({
    where: { status: 'PUBLISHED' }, order: { topicNo: 'ASC', topicId: 'ASC' },
  }),
});
