/**
 * AI 튜터 개인화 정보(personalizedContext) 만들기
 * 백엔드 작업: 학습 기록으로 AI 서버에 보낼 개인화 정보를 모은다. 형식 검사는 dto/aiPersonalizedContext.dto.js가 한다.
 * 현재 포함: learnerProfile (BE-04). 오개념 가설·선수 개념 관계는 BE-05에서 추가
 * 주의: TUTOR_PERSONALIZATION_ENABLED가 꺼져 있으면 tutor.service가 이 함수를 부르지 않는다.
 *       모든 조회는 요청한 사용자(userId) 기록만 본다.
 */
const { buildLearnerProfile } = require('./learnerProfile');

function personalizationProvider() {
  return {
    async build(userId, input, manager) {
      const learnerProfile = await buildLearnerProfile(manager, userId, input);
      return learnerProfile ? { learnerProfile } : null;
    },
  };
}

module.exports = { personalizationProvider };
