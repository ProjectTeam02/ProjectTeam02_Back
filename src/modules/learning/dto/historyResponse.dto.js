const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
});

function validDate(value) {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
const iso = value => validDate(value)?.toISOString() ?? null;
function seoulDate(value) {
  const date = validDate(value);
  if (!date) return null;
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function counts(rows) {
  const submittedCount = rows.length;
  const correctCount = rows.filter(row => row.isCorrect === true).length;
  return { submittedCount, correctCount,
    accuracyPercentage: submittedCount === 0 ? null : Math.round(correctCount * 1000 / submittedCount) / 10 };
}

function summary(attempt, submissionRows) {
  const start = validDate(attempt.startedAt);
  const end = validDate(attempt.endedAt);
  const completedAt = attempt.status === 'PASSED' ? iso(attempt.endedAt) : null;
  return {
    recordType: 'LEARNING', recordId: attempt.attemptId,
    attemptNo: attempt.attemptNo, attemptType: attempt.attemptType, mode: attempt.mode,
    status: attempt.status, endReason: attempt.endReason ?? null,
    isFinished: ['PASSED', 'FAILED', 'ABANDONED'].includes(attempt.status),
    learningDate: seoulDate(attempt.startedAt), timeZone: 'Asia/Seoul',
    startedAt: iso(attempt.startedAt), endedAt: iso(attempt.endedAt), completedAt,
    elapsedSeconds: start && end && end >= start ? (end.getTime() - start.getTime()) / 1000 : null,
    topic: attempt.stage?.topic ? { topicId: attempt.stage.topic.topicId, title: attempt.stage.topic.title } : null,
    stage: attempt.stage ? { stageId: attempt.stage.stageId, stageCode: attempt.stage.stageCode,
      title: attempt.stage.title, stageType: attempt.stage.stageType } : null,
    ...counts(submissionRows),
  };
}

function submission(row) {
  const question = row.question;
  return {
    submissionId: row.submissionId, sequenceNo: row.sequenceNo, questionId: row.questionId,
    question: question ? {
      questionId: question.questionId, questionCode: question.questionCode, version: question.version,
      questionText: question.questionText ?? null,
      concept: question.concept ? { conceptId: question.concept.conceptId, conceptCode: question.concept.conceptCode,
        version: question.concept.version, title: question.concept.title } : null,
    } : null,
    selectedAnswer: { choiceId: row.choiceId, choiceText: row.choice?.choiceText ?? null, selectedPosition: row.selectedPosition },
    isCorrect: row.isCorrect, explanation: question?.explanation ?? null,
    displayedChoiceOrder: row.displayedChoiceOrder ?? null,
    submittedAt: iso(row.submittedAt), responseTimeMs: row.responseTimeMs ?? null,
  };
}

module.exports = { summary, submission, seoulDate };
