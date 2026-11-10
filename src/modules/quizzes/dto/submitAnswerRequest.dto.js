/**
 * 퀴즈 답안 제출 요청 데이터 형식 파일
 * 대상: POST /quizzes/:id/submit
 * 백엔드 작업: 경로·Body·헤더를 검사·정규화해서 Service에 넘긴다.
 * 주의: 기존 필드명 유지. 허용하지 않은 Body 필드는 거절한다(422).
 *
 * Path    id               uuid  현재 제출할 문항 ID (questionId, 응답의 quizId)
 * Body    attemptId        uuid  (필수) 응시 시작 API가 준 attemptId
 *         choiceId         uuid  (필수) 고른 선택지 ID
 * Header  Idempotency-Key  string 1~200자 (선택) 답안마다 다른 값. 같은 키 재요청은 원래 채점 결과 + duplicate:true
 *                          (DB에는 해시로 만든 submissionId만 저장하므로 길이 제한이 DB 컬럼과 무관)
 */
const f = require('../../../common/dto/fields');

const LIMITS = Object.freeze({ idempotencyKey: 200 });

function parse({ params, body, headers = {} }) {
  const value = f.onlyKeys(f.object(body, 'body'), ['attemptId', 'choiceId'], 'body');
  const key = headers['idempotency-key'];
  return {
    params: { id: f.uuid(f.object(params, 'params').id, 'quizId') },
    body: {
      attemptId: f.uuid(value.attemptId, 'attemptId'),
      choiceId: f.uuid(value.choiceId, 'choiceId'),
      idempotencyKey: key === undefined ? null : f.string(key, 'Idempotency-Key', LIMITS.idempotencyKey),
    },
  };
}

module.exports = { LIMITS, parse };
