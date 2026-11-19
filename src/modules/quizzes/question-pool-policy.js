// Shared by the runtime and preflight; this is structural eligibility, not editorial approval.
const normalRules = Object.freeze({ questions: 3, correct: 2, hp: 2 });
const hasAnswerKey = (choices, correct) => choices === 4 && correct === 1;
const hasPublishedSlots = (rows, count) => rows.length === count && rows.every((row, i) => row.order === i + 1 && row.status === 'PUBLISHED');
const hasConfiguredReward = stage => [stage.rewardTotalExp, stage.rewardEconomyExp, stage.rewardCoin]
  .every(value => Number.isSafeInteger(value) && value >= 0);
module.exports = { normalRules, hasAnswerKey, hasPublishedSlots, hasConfiguredReward };
