/**
 * 경제 개념 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 */
module.exports = (concept, cards) => ({
  conceptId: concept.conceptId, topicId: concept.topicId, conceptCode: concept.conceptCode,
  version: concept.version, title: concept.title, shortDefinition: concept.shortDefinition,
  summary: concept.summary, estimatedMinutes: concept.estimatedMinutes,
  cards: cards.map(card => ({
    sectionId: card.sectionId, conceptId: card.conceptId, pageNo: card.pageNo,
    sortOrder: card.sortOrder, sectionType: card.sectionType, title: card.title,
    body: card.body, cardTone: card.cardTone,
  })),
  ...(!cards.length ? { emptyMessage: '이 개념에 등록된 학습 카드가 없습니다.' } : {}),
});
