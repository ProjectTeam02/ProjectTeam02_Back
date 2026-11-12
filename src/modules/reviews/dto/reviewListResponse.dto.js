/**
 * 복습 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 * 복습 항목과 임무의 공개 응답을 고정한다.
 */
const { reviewItem, mission } = require('../../extended-api/dto/extendedResponse.dto');
module.exports = { item: reviewItem, mission };
