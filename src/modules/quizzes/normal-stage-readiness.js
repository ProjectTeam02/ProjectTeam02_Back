const { QuestionChoice, StageQuestion } = require('@leren/database');
const { normalRules, hasAnswerKey, hasPublishedSlots, hasConfiguredReward } = require('./question-pool-policy');

const slotMessage = `Stage에 공개된 문항 ${normalRules.questions}개가 필요합니다.`;
const failures = Object.freeze({
  configuration: { code: 'INVALID_STAGE_CONFIGURATION', message: '일반 Stage Quiz 설정이 올바르지 않습니다.' },
  reward: { code: 'REWARD_NOT_CONFIGURED', message: 'Stage 최초 통과 보상이 설정되지 않았습니다.' },
  slots: { code: 'INSUFFICIENT_ELIGIBLE_QUESTIONS', message: slotMessage },
  extraSlots: { code: 'INVALID_QUESTION_POOL', message: slotMessage },
  answers: { code: 'INVALID_QUESTION_POOL', message: '문항마다 선택지 4개와 정답 1개가 필요합니다.' },
});

function configurationFailure(stage) {
  if (stage.maxQuestionCount !== normalRules.questions || stage.requiredCorrectCount !== normalRules.correct
    || stage.initialMonsterHp !== normalRules.hp) return failures.configuration;
  return hasConfiguredReward(stage) ? null : failures.reward;
}

async function poolFailure(manager, stageId) {
  const mappings = await manager.getRepository(StageQuestion).find({
    where: { stageId }, relations: { question: true }, order: { questionOrder: 'ASC' },
  });
  // Fixed slots, not a draw from a larger bank. A fourth mapping is also invalid.
  const slots = mappings.map(row => ({ order: row.questionOrder, status: row.question?.status }));
  if (slots.length > normalRules.questions) return failures.extraSlots;
  if (!hasPublishedSlots(slots, normalRules.questions)) return failures.slots;
  const counts = await manager.getRepository(QuestionChoice).createQueryBuilder('choice')
    .select('choice.questionId', 'questionId')
    .addSelect('COUNT(*)::int', 'choices')
    .addSelect('COUNT(*) FILTER (WHERE choice.isCorrect)::int', 'correct')
    .where('choice.questionId IN (:...ids)', { ids: mappings.map(row => row.questionId) })
    .groupBy('choice.questionId')
    .getRawMany();
  const byQuestion = new Map(counts.map(row => [row.questionId, row]));
  return mappings.every(({ questionId }) => {
    const row = byQuestion.get(questionId);
    return row && hasAnswerKey(row.choices, row.correct);
  }) ? null : failures.answers;
}

async function describe(manager, stage) {
  const failure = configurationFailure(stage) ?? await poolFailure(manager, stage.stageId);
  return { quizReady: !failure, quizUnavailableReason: failure?.code ?? null };
}

module.exports = { configurationFailure, poolFailure, describe };
