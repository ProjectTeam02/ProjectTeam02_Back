/**
 * 스테이지 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 */
function summary(stage, progress, isUnlocked) {
  return {
    stageId: stage.stageId, topicId: stage.topicId, stageCode: stage.stageCode,
    stageNo: stage.stageNo, stageType: stage.stageType, title: stage.title,
    description: stage.description, estimatedMinMinutes: stage.estimatedMinMinutes,
    estimatedMaxMinutes: stage.estimatedMaxMinutes,
    progressStatus: progress?.progressStatus || 'NOT_STARTED', isUnlocked,
  };
}

function detail(stage, progress, isUnlocked, concepts) {
  return {
    ...summary(stage, progress, isUnlocked),
    maxQuestionCount: stage.maxQuestionCount, requiredCorrectCount: stage.requiredCorrectCount,
    initialMonsterHp: stage.initialMonsterHp, monsterName: stage.monsterName,
    monsterImageKey: stage.monsterImageKey, rewardTotalExp: stage.rewardTotalExp,
    rewardEconomyExp: stage.rewardEconomyExp, rewardCoin: stage.rewardCoin,
    concepts: concepts.map(link => ({
      conceptId: link.conceptId, title: link.concept.title,
      shortDefinition: link.concept.shortDefinition, summary: link.concept.summary,
      displayOrder: link.displayOrder, isPrimary: link.isPrimary,
    })),
    ...(!concepts.length ? { emptyMessage: '이 Stage에 공개된 학습 개념이 없습니다.' } : {}),
  };
}

module.exports = { summary, detail };
