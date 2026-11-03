/**
 * 달력 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 */
module.exports = function scheduleResponse(plan, topic) {
  return {
    planId: plan.planId,
    scheduledDate: plan.scheduledDate,
    topic: topic ? { topicId: topic.topicId, title: topic.title } : null,
    stageId: plan.stageId,
    conceptId: plan.conceptId,
    planType: plan.planType,
    goal: plan.title,
    status: plan.status,
    completedAt: plan.completedAt,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
};
