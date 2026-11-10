/**
 * 퀴즈 응시 시작·조회 요청 데이터 형식 파일
 * 대상: POST /quizzes/stages/:stageId/attempts, GET /quizzes/attempts/:attemptId,
 *       GET /quizzes/attempts/:attemptId/result, GET /quizzes/generate(레거시)
 * 백엔드 작업: 경로·Query를 검사·정규화해서 Service에 넘긴다.
 * 주의: 기존 오류 메시지 형식 유지.
 *
 * 신규 응시 시작 Path stageId uuid, Body mode START|RETRY
 * 레거시 응시 시작 Path stageId uuid, Body 없음(빈 객체만 허용)
 * 응시 조회   Path attemptId uuid, Query 없음
 * 레거시 조회 Query conceptId uuid (선택)
 */
const AppError = require('../../../common/errors/AppError');
const f = require('../../../common/dto/fields');

function noQuery(query) {
  if (query && Object.keys(query).length) throw AppError.validation('지원하지 않는 조회 조건입니다.');
}

function parseStart({ params, body }) {
  if (body && Object.keys(body).length) throw AppError.validation('응시 시작 본문은 비어 있어야 합니다.');
  return { params: { stageId: f.uuid(f.object(params, 'params').stageId, 'stageId') } };
}

function parseStartNew({ params, body }) {
  const value = f.onlyKeys(f.object(body, 'body'), ['mode'], 'body');
  return {
    params: { stageId: f.uuid(f.object(params, 'params').stageId, 'stageId') },
    body: { mode: f.oneOf(value.mode, ['START', 'RETRY'], 'mode') },
  };
}

function parseAttempt({ params, query }) {
  noQuery(query);
  return { params: { attemptId: f.uuid(f.object(params, 'params').attemptId, 'attemptId') } };
}

function parseGenerate({ query }) {
  const value = f.onlyKeys(f.object(query, 'query'), ['conceptId'], 'query');
  return { query: value.conceptId === undefined ? {} : { conceptId: f.uuid(value.conceptId, 'conceptId') } };
}

function parseNewAnswer({ params, body }) {
  const value = f.onlyKeys(f.object(body, 'body'), ['questionId', 'choiceId', 'submissionId'], 'body');
  return {
    params: { attemptId: f.uuid(f.object(params, 'params').attemptId, 'attemptId') },
    body: {
      questionId: f.uuid(value.questionId, 'questionId'),
      choiceId: f.uuid(value.choiceId, 'choiceId'),
      submissionId: f.uuid(value.submissionId, 'submissionId'),
    },
  };
}

module.exports = { parseStart, parseStartNew, parseAttempt, parseGenerate, parseNewAnswer };
