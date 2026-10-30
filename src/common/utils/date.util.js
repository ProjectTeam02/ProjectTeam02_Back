/**
 * 날짜 변환 유틸리티
 * 백엔드 작업: API 응답 날짜를 ISO 문자열로 정규화
 * 주의: 입력이 없을 때 null 응답 규칙을 유지
 */
function toISOStringOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

module.exports = { toISOStringOrNull };
