/**
 * 코스튬 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 * 코스튬 목록과 개별 항목의 공개 필드를 고정한다.
 */
const { costume } = require('../../extended-api/dto/extendedResponse.dto');

function list(items, page, size, total) { return { items, page, size, total }; }
module.exports = { item: costume, list };
