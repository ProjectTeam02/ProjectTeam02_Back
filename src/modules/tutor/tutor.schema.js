/**
 * AI Tutor 요청값 검증
 * 백엔드 작업: API 입력 데이터의 유효성 규칙을 관리
 * 주의: 기존 필드명과 오류 응답 형식을 유지한다. 실제 규칙은 dto/tutorRequest.dto.js에 있다.
 */
const request = require('./dto/tutorRequest.dto');

function message({ body, headers }) {
  return { body: request.parseMessage(body, headers) };
}

function conversation({ body }) {
  return { body: request.parseConversation(body) };
}

function list({ query }) {
  return { query: request.parseListQuery(query) };
}

function messages({ params, query }) {
  return { params: request.parseConversationId(params), query: request.parseListQuery(query) };
}

module.exports = { message, conversation, list, messages };
