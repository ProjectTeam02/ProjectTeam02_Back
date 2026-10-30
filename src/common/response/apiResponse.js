/**
 * 공통 API 응답 형식
 * 백엔드 작업: 성공·실패 응답 구조를 일관되게 생성
 * 주의: 클라이언트와 합의된 필드명을 유지
 */
function success(data, message = 'OK') {
  return { success: true, message, data };
}

function failure(message, code, details) {
  return { success: false, message, code, details };
}

module.exports = { success, failure };
