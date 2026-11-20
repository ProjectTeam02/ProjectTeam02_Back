// Question.status distinguishes editorial approval from learner-facing publication.
const PUBLIC_QUESTION_STATUS = 'PUBLISHED';
const normalRules = Object.freeze({ questions: 3, correct: 2, hp: 2 });
const hasAnswerKey = (choices, correct) => choices === 4 && correct === 1;
const hasPublishedSlots = (rows, count) => rows.length === count && rows.every((row, i) => row.order === i + 1 && row.status === PUBLIC_QUESTION_STATUS);
const hasConfiguredReward = stage => [stage.rewardTotalExp, stage.rewardEconomyExp, stage.rewardCoin]
  .every(value => Number.isSafeInteger(value) && value >= 0);

module.exports = { PUBLIC_QUESTION_STATUS, normalRules, hasAnswerKey, hasPublishedSlots, hasConfiguredReward };
