/**
 * 사용자 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 * 현재 상태: 구현 전 스캐폴드이며 역할별 코드를 이 파일에 작성합니다.
 */
const formatJob = require('../../characters/dto/jobResponse.dto');

// First screen (Figma 19-01) only. Growth/wallet/character data that has not
// been created yet stays null: the client must not display fabricated values.
function formatMyPage({ user, growth, wallet, character, equippedCostumes, completedStageCount }) {
  const selectedClass = character?.characterClass || null;
  return {
    // Keep the existing /users/me public fields for existing consumers.
    userId: user.userId,
    nickname: user.nickname,
    email: user.email,
    plan: user.plan,
    level: growth?.totalLevel ?? null,
    totalExp: growth?.totalExp ?? null,
    economyLevel: growth?.economyLevel ?? null,
    economyExp: growth?.economyExp ?? null,
    // Fields needed for Figma 19-01.
    characterClass: selectedClass ? formatJob(selectedClass) : null,
    equippedCostumes: (equippedCostumes || []).map(({ category, itemId, costume }) => ({
      category, itemId,
      name: costume?.name ?? null,
      imageKey: costume?.imageKey ?? null,
    })),
    coinBalance: wallet?.coinBalance ?? null,
    completedStageCount,
  };
}

module.exports = { formatMyPage };
