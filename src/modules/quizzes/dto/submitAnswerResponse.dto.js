/**
 * 퀴즈 답안 제출 응답 데이터 형식 파일
 * 대상: POST /quizzes/:id/submit (201)
 * 백엔드 작업: 채점 결과를 앱에 보낼 형태로 변환
 * 주의: 기존 응답 필드명과 JSON 구조 유지.
 *
 * data
 *   attemptId       uuid
 *   quizId          uuid     제출한 문항 ID (questionId)
 *   choiceId        uuid
 *   isCorrect       boolean
 *   score           number   정답 100, 오답 0
 *   explanation     string | null  문항 해설 (제출 후에만 공개)
 *   hpBefore        number
 *   hpAfter         number
 *   submittedCount  number   이 제출까지 푼 문항 수
 *   correctCount    number   이 제출까지 맞힌 문항 수
 *   status          'IN_PROGRESS' | 'PASSED' | 'FAILED'
 *   endReason       'MONSTER_DEFEATED' | 'QUESTIONS_EXHAUSTED' | null
 *   rewardGranted   boolean  최초 통과 보상 지급 여부
 *   duplicate       true     같은 Idempotency-Key 재요청일 때만 포함
 */
function endReasonFor(status) {
  if (status === 'PASSED') return 'MONSTER_DEFEATED';
  if (status === 'FAILED') return 'QUESTIONS_EXHAUSTED';
  return null;
}

function submitted({
  attemptId, questionId, choiceId, isCorrect, explanation, hpBefore, hpAfter,
  submittedCount, correctCount, status, endReason, rewardGranted, duplicate = false, currentQuestion,
}) {
  return {
    attemptId,
    quizId: questionId,
    choiceId,
    isCorrect: Boolean(isCorrect),
    score: isCorrect ? 100 : 0,
    explanation: explanation ?? null,
    hpBefore,
    hpAfter,
    submittedCount,
    correctCount,
    status,
    endReason: endReason === undefined ? endReasonFor(status) : endReason,
    rewardGranted: Boolean(rewardGranted),
    ...(duplicate ? { duplicate: true } : {}),
    ...(currentQuestion !== undefined ? { nextQuestion: currentQuestion } : {}),
  };
}

module.exports = { endReasonFor, submitted };
