/**
 * 학습 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 * 진도 변경 입력을 검증하고 정수 위치를 보장한다.
 */
const f = require('../../../common/dto/fields');
const AppError = require('../../../common/errors/AppError');

function parse({ params, query, body }) {
  if (Object.keys(f.object(query, 'query')).length) throw AppError.validation('지원하지 않는 조회 조건입니다.');
  const value = f.onlyKeys(f.object(body, 'body'), ['contentPosition'], 'body');
  if (!Number.isSafeInteger(value.contentPosition) || value.contentPosition < 1) throw AppError.validation('contentPosition은 1 이상의 정수여야 합니다.');
  return { params: { stageId: f.uuid(f.object(params, 'params').stageId, 'stageId') }, body: { contentPosition: value.contentPosition } };
}

module.exports = { parse };
