const initialHp = 6;
const minimumCorrectCount = initialHp - 1;

function initialState() {
  return {
    consecutiveCorrectCount: 0,
    criticalUsed: false,
    defeatedAtQuestion: null,
    bonusQuestionCount: 0,
    bonusCorrectCount: 0,
  };
}

function transition(attempt, isCorrect) {
  const previous = attempt.bossCombatState;
  const hpBefore = attempt.finalHp ?? attempt.initialHp;
  const submittedCount = attempt.submittedCount + 1;
  const correctCount = attempt.correctCount + Number(isCorrect);
  const consecutiveCorrectCount = isCorrect ? previous.consecutiveCorrectCount + 1 : 0;
  const isBonusQuestion = previous.defeatedAtQuestion !== null;
  const criticalTriggered = !isBonusQuestion && !previous.criticalUsed && consecutiveCorrectCount === 2;
  const hpAfter = Math.max(0, hpBefore - Number(isCorrect) - Number(criticalTriggered));
  const defeatedAtQuestion = previous.defeatedAtQuestion ?? (hpAfter === 0 ? submittedCount : null);
  const bossCombatState = {
    consecutiveCorrectCount,
    criticalUsed: previous.criticalUsed || criticalTriggered,
    defeatedAtQuestion,
    bonusQuestionCount: defeatedAtQuestion === null ? 0 : attempt.maxQuestionCount - defeatedAtQuestion,
    bonusCorrectCount: previous.bonusCorrectCount + Number(isBonusQuestion && isCorrect),
  };
  const finished = submittedCount === attempt.maxQuestionCount;
  const status = finished ? (hpAfter === 0 ? 'PASSED' : 'FAILED') : 'IN_PROGRESS';
  return { hpBefore, hpAfter, submittedCount, correctCount, status, bossCombatState, isBonusQuestion, criticalTriggered };
}

function replay(attempt, submissions) {
  const cursor = { initialHp: attempt.initialHp, maxQuestionCount: attempt.maxQuestionCount,
    finalHp: null, submittedCount: 0, correctCount: 0, bossCombatState: initialState() };
  let result;
  for (const submission of submissions) {
    result = transition(cursor, submission.isCorrect);
    cursor.finalHp = result.hpAfter;
    cursor.submittedCount = result.submittedCount;
    cursor.correctCount = result.correctCount;
    cursor.bossCombatState = result.bossCombatState;
  }
  return result;
}

function answerDetails(combat) {
  if (!combat) return undefined;
  return { ...combat.bossCombatState, isBonusQuestion: combat.isBonusQuestion, criticalTriggered: combat.criticalTriggered };
}

module.exports = { initialHp, minimumCorrectCount, initialState, transition, replay, answerDetails };
