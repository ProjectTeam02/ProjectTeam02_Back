/**
 * 복습 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 * 제출 결과와 응시 결과를 공개 필드로 변환한다.
 */
const { reviewAttempt } = require('../../extended-api/dto/extendedResponse.dto');

function result(value) {
  return {
    isCorrect: Boolean(value?.isCorrect),
    explanation: value?.explanation ?? null,
    ...(value?.duplicate === true ? { duplicate: true } : {}),
  };
}

function response(value) {
  const { result: submitted, ...attempt } = value;
  return { ...attempt, result: result(submitted) };
}

module.exports = { attempt: reviewAttempt, result, response };
