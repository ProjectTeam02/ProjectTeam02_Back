/**
 * 경제 개념 PostgreSQL 접근 계층 파일
 * 백엔드 작업: 조회·저장 로직과 쿼리를 관리
 * 주의: 기존 DB 스키마와 환경변수 유지
 */
const { Concept, ConceptSection } = require('@leren/database');

module.exports = manager => ({
  publishedConcept: conceptId => manager.getRepository(Concept).findOneBy({
    conceptId, status: 'PUBLISHED', topic: { status: 'PUBLISHED' },
  }),
  cards: conceptId => manager.getRepository(ConceptSection).find({
    where: { conceptId }, order: { pageNo: 'ASC', sortOrder: 'ASC' },
  }),
});
