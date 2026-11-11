/**
 * 코스튬 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 * 구매 API의 서버 검증 입력을 정규화한다.
 */
const f = require('../../../common/dto/fields');
const AppError = require('../../../common/errors/AppError');

function parse({ body, params, query }) {
  if (Object.keys(f.object(params, 'params')).length || Object.keys(f.object(query, 'query')).length) {
    throw AppError.validation('지원하지 않는 요청 필드입니다.');
  }
  const value = f.onlyKeys(f.object(body, 'body'), ['itemId', 'requestId'], 'body');
  return { body: { itemId: f.uuid(value.itemId, 'itemId'), requestId: f.string(value.requestId, 'requestId', 100) } };
}

module.exports = { parse };
