/**
 * 학습 주제 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 */
module.exports = topic => ({
  topicId: topic.topicId, topicCode: topic.topicCode, topicNo: topic.topicNo,
  title: topic.title, description: topic.description, iconKey: topic.iconKey,
  mapRow: topic.mapRow, mapColumn: topic.mapColumn,
});
