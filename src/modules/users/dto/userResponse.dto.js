/**
<<<<<<< HEAD
 * 마이페이지 응답 DTO (피그마 19번)
 */
function formatUserProfile(user, growth) {
  return {
    user: {
      id: user.userId,
      nickname: user.nickname || 'pia',
      job: user.job || '마법사',
      costume: user.costume || '별빛 로브',
      coin: user.coin ?? 840,
    },
    level: {
      totalLevel: growth?.totalLevel ?? 12,
      economyLevel: growth?.economyLevel ?? 8,
      completedStepsCount: growth?.completedStepsCount ?? 8,
    },
    growth: {
      totalExp: growth?.totalExp ?? 240,
      maxTotalExp: 400,
      economyExp: growth?.economyExp ?? 120,
      maxEconomyExp: 200,
    },
    stats: {
      monthlyStudyDays: growth?.monthlyStudyDays ?? 7,
      consecutiveDays: growth?.consecutiveDays ?? 4,
      accuracyRate: growth?.accuracyRate ?? 80,
    },
  };
}

module.exports = { formatUserProfile };
=======
 * 사용자 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 * 현재 상태: 구현 전 스캐폴드이며 역할별 코드를 이 파일에 작성합니다.
 */
module.exports = {};
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
