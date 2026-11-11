/**
 * 복습 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 * 복습 답안 입력을 검증하고 UUID를 정규화한다.
 */
const f = require('../../../common/dto/fields');
const AppError = require('../../../common/errors/AppError');

function parse({ params, body, query }) {
  if (Object.keys(f.object(query, 'query')).length) throw AppError.validation('지원하지 않는 조회 조건입니다.');
  const value = f.onlyKeys(f.object(body, 'body'), ['questionId', 'choiceId', 'submissionId'], 'body');
  return { params: { reviewAttemptId: f.uuid(f.object(params, 'params').reviewAttemptId, 'reviewAttemptId') }, body: {
    questionId: f.uuid(value.questionId, 'questionId'), choiceId: f.uuid(value.choiceId, 'choiceId'),
    submissionId: f.uuid(value.submissionId, 'submissionId'),
  } };
}

module.exports = { parse };
