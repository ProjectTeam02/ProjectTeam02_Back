/**
 * AI 튜터 개인화 정보(personalizedContext) 만들기
 * 백엔드 작업: 학습 기록으로 AI 서버에 보낼 개인화 정보를 모은다. 형식 검사는 dto/aiPersonalizedContext.dto.js가 한다.
 * 포함: learnerProfile (BE-04), conceptGraphContext·misconceptionHypotheses·diagnosisEvidence·recentAssessments (BE-05)
 * 주의: TUTOR_PERSONALIZATION_ENABLED가 꺼져 있으면 tutor.service가 이 함수를 부르지 않는다.
 *       모든 조회는 요청한 사용자(userId) 기록만 본다. 비어 있는 항목은 보내지 않는다.
 */
const { buildLearnerProfile, targetConceptCode } = require('./learnerProfile');
const { conceptGraphContext, misconceptionContext, recentAssessments } = require('./conceptContext');

function personalizationProvider() {
  return {
    async build(userId, input, manager) {
      const conceptCode = await targetConceptCode(manager, input);
      const learnerProfile = await buildLearnerProfile(manager, userId, input);
      const graph = await conceptGraphContext(manager, conceptCode);
      const { misconceptionHypotheses, diagnosisEvidence } = await misconceptionContext(manager, userId, conceptCode);
      const assessments = await recentAssessments(manager, userId, conceptCode);
      return {
        learnerProfile,
        conceptGraphContext: graph,
        misconceptionHypotheses,
        diagnosisEvidence,
        recentAssessments: assessments,
      };
    },
  };
}

module.exports = { personalizationProvider };
