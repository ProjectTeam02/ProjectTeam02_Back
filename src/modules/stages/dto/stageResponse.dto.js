/**
 * 스테이지 응답 DTO (피그마 13, 14번)
 */
function formatStageList(stages, userProgressMap = {}) {
  return stages.map((stage) => {
    const userProgress = userProgressMap[stage.id] || { completedSteps: 0, totalSteps: 3, isUnlocked: stage.orderNum === 1 };
    return {
      stageId: stage.id,
      stageNumber: stage.orderNum,
      title: stage.title,
      status: userProgress.isUnlocked ? (userProgress.completedSteps === userProgress.totalSteps ? 'COMPLETED' : 'IN_PROGRESS') : 'LOCKED',
      progressText: `${userProgress.completedSteps}/${userProgress.totalSteps} 완료`,
      requiredStageTitle: stage.requiredStageTitle || null,
    };
  });
}

function formatStepList(stage, steps, userStepMap = {}) {
  return {
    stageId: stage.id,
    stageTitle: `STAGE ${stage.orderNum} · ${stage.title}`,
    progressText: `${stage.completedSteps || 0}/${steps.length}단계 완료`,
    steps: steps.map((step) => {
      const isCompleted = userStepMap[step.id]?.isCompleted || false;
      const isUnlocked = userStepMap[step.id]?.isUnlocked ?? step.orderNum === 1;
      return {
        stepId: step.id,
        stepNumber: step.stepNumberText, // 예: '1-1', '1-2', 'BOSS'
        title: step.title,
        estimatedTime: step.estimatedTime || '3~5분',
        status: isCompleted ? 'COMPLETED' : isUnlocked ? 'AVAILABLE' : 'LOCKED',
        actionButtonText: isCompleted ? '다시 보기' : isUnlocked ? '학습 시작' : '앞 단계 완료 후 열림',
      };
    }),
  };
}

module.exports = { formatStageList, formatStepList };
