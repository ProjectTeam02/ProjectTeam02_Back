/**
 * 날짜 변환 유틸리티
 * 백엔드 작업: API 응답 날짜를 ISO 문자열로 정규화
 * 주의: 입력이 없을 때 null 응답 규칙을 유지
 */
function toISOStringOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

module.exports = { toISOStringOrNull };
function startOfSeoulDay(date = new Date()) {
  const seoul = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
  return new Date(`${seoul}T00:00:00+09:00`);
}

module.exports = { startOfSeoulDay };
