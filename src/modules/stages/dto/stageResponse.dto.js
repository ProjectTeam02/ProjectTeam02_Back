/**
<<<<<<< HEAD
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
=======
 * 스테이지 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 * 현재 상태: 구현 전 스캐폴드이며 역할별 코드를 이 파일에 작성합니다.
 */
module.exports = {};
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
