/**
 * 코스튬 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 * 장착 API는 path itemId만 허용한다.
 */
const f = require('../../../common/dto/fields');
const AppError = require('../../../common/errors/AppError');

function parse({ params, query, body }) {
  if (Object.keys(f.object(query, 'query')).length || Object.keys(f.object(body, 'body')).length) {
    throw AppError.validation('지원하지 않는 요청 필드입니다.');
  }
  return { params: { itemId: f.uuid(f.object(params, 'params').itemId, 'itemId') } };
}

module.exports = { parse };
