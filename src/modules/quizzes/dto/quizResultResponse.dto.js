/**
 * 퀴즈 결과 응답 데이터 형식 파일
 * 대상: GET /quizzes/attempts/:attemptId/result (PASSED·FAILED 응시만)
 * 백엔드 작업: 완료된 LearningAttempt를 결과 화면용으로 변환
 * 주의: 기존 응답 필드명과 JSON 구조 유지 (attemptResponse.dto.js의 attempt와 같은 필드)
 *
 * data: attemptId, stageId, status, mode, attemptNo, maxQuestionCount, submittedCount,
 *       correctCount, hp, endReason, endedAt, rewardGranted
 */
const { summary } = require('./attemptResponse.dto');

function result(attempt) {
  return summary(attempt);
}

module.exports = { result };
