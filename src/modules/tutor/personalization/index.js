/**
 * AI 튜터 개인화 정보(personalizedContext) 만들기
 * 백엔드 작업: 학습 기록으로 AI 서버에 보낼 개인화 정보를 모은다. 형식 검사는 dto/aiPersonalizedContext.dto.js가 한다.
 * 포함: learnerProfile (BE-04), conceptGraphContext·misconceptionHypotheses·diagnosisEvidence·recentAssessments (BE-05),
 *       취약도·숙련도·불확실성·teachingStrategy (#179, weakness.js 정책)
 * 주의: TUTOR_PERSONALIZATION_ENABLED가 꺼져 있으면 tutor.service가 이 함수를 부르지 않는다.
 *       모든 조회는 요청한 사용자(userId) 기록만 본다. 비어 있는 항목은 보내지 않는다.
 */
const { buildLearnerProfile, targetConceptCode } = require('./learnerProfile');
const { conceptGraphContext, misconceptionContext, recentAssessments } = require('./conceptContext');
const { calculateWeakness } = require('./weakness');
const { learnerWeakness, profileSignals } = require('./service');
const { strategyFor, STRATEGY_VERSION } = require('./diagnosis');

function withPrerequisiteMastery(graph, weaknessMap) {
  if (!graph) return graph;
  const mastery = {};
  const annotate = node => {
    const value = weaknessMap.get(node.conceptCode)?.estimatedMastery;
    if (value === null || value === undefined) return node; // 기록 없는 선수 개념은 숙련도를 만들지 않는다
    mastery[node.conceptCode] = value;
    return { ...node, learnerConceptMastery: value };
  };
  return {
    ...graph,
    prerequisiteConcepts: (graph.prerequisiteConcepts || []).map(annotate),
    relatedConcepts: graph.relatedConcepts || [],
    learnerConceptMastery: mastery,
  };
}

function personalizationProvider({ now = () => new Date() } = {}) {
  return {
    async build(userId, input, manager) {
      const conceptCode = await targetConceptCode(manager, input);
      const learnerProfile = await buildLearnerProfile(manager, userId, input);
      const weaknessMap = await learnerWeakness(manager, userId, now());
      const graph = withPrerequisiteMastery(await conceptGraphContext(manager, conceptCode), weaknessMap);
      const { misconceptionHypotheses, diagnosisEvidence } = await misconceptionContext(manager, userId, conceptCode);
      const assessments = await recentAssessments(manager, userId, conceptCode);
      const weakness = conceptCode ? (weaknessMap.get(conceptCode) || calculateWeakness({}, now())) : null;
      return {
        learnerProfile: learnerProfile && weakness ? { ...learnerProfile, ...profileSignals(weakness) } : learnerProfile,
        conceptGraphContext: graph,
        misconceptionHypotheses,
        diagnosisEvidence,
        recentAssessments: assessments,
        // 학습 신호가 하나도 없는 학습자는 기존 요청 모양(personalizedContext 없음)을 유지한다
        teachingStrategy: weakness && (learnerProfile || misconceptionHypotheses.length) ? {
          strategyId: strategyFor({
            weaknessScore: weakness.weaknessScore,
            dataSufficiency: weakness.dataSufficiency,
            hypotheses: misconceptionHypotheses,
          }),
          strategyVersion: STRATEGY_VERSION,
        } : null,
      };
    },
  };
}

module.exports = { personalizationProvider, withPrerequisiteMastery };
