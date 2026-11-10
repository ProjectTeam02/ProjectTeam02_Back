/**
 * 퀴즈 요청값 검증
 * 백엔드 작업: API 입력 데이터의 유효성 규칙을 관리
 * 주의: 기존 필드명과 오류 응답 형식을 유지한다. 실제 규칙은 dto/ 파일에 있다.
 */
const submitRequest = require('./dto/submitAnswerRequest.dto');
const attemptRequest = require('./dto/attemptRequest.dto');

module.exports = {
  submit: submitRequest.parse,
  start: attemptRequest.parseStart,
  attempt: attemptRequest.parseAttempt,
  generate: attemptRequest.parseGenerate,
};
