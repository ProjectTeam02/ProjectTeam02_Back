/**
 * 사용자 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 * 프로필 변경 입력과 공개 응답을 고정한다.
 */
const f = require('../../../common/dto/fields');
const AppError = require('../../../common/errors/AppError');

function parse({ body, query }) {
  if (Object.keys(f.object(query, 'query')).length) throw AppError.validation('지원하지 않는 조회 조건입니다.');
  const value = f.onlyKeys(f.object(body, 'body'), ['nickname'], 'body');
  return { body: { nickname: f.string(value.nickname, 'nickname', 30) } };
}

function response(user) { return { userId: user.userId, nickname: user.nickname }; }

module.exports = { parse, response };