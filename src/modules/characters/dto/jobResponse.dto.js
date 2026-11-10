/**
 * 캐릭터 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 */
module.exports = ({ classId, classCode, name, imageKey }) => ({ classId, classCode, name, imageKey });
