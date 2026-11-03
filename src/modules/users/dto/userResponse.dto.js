/**
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
