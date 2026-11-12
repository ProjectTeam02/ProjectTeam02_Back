/**
 * P0~P2 확장 API 요청 DTO.
 * 라우터가 직접 req 값을 서비스에 넘기지 않도록 path/query/body를 한 곳에서
 * 허용 필드·타입·범위·enum으로 검증하고 정규화한다.
 */
const AppError = require('../../../common/errors/AppError');
const f = require('../../../common/dto/fields');
const authFields = require('../../auth/dto/authFields');

function noQuery(query, name = 'query') {
  if (Object.keys(f.object(query, name)).length) throw AppError.validation('지원하지 않는 조회 조건입니다.');
}

function noBody(body, name = 'body') {
  if (Object.keys(f.object(body, name)).length) throw AppError.validation('지원하지 않는 요청 필드입니다.');
}

function path(params, key) {
  return { [key]: f.uuid(f.object(params, 'params')[key], key) };
}

function paging(query = {}) {
  const value = f.onlyKeys(f.object(query, 'query'), ['page', 'size', 'limit'], 'query');
  const page = f.positiveIntQuery(value.page, 'page', { fallback: 1 });
  const size = f.positiveIntQuery(value.size ?? value.limit, 'size', { fallback: 20, max: 100 });
  return { page, size, skip: (page - 1) * size };
}

function pathOnly(key) {
  return ({ params, query, body }) => {
    noQuery(query); noBody(body);
    return { params: path(params, key) };
  };
}

function stageStart({ params, query, body }) {
  noQuery(query);
  const value = f.onlyKeys(f.object(body, 'body'), ['mode'], 'body');
  return { params: path(params, 'stageId'), body: { mode: f.oneOf(value.mode, ['START', 'RETRY'], 'mode') } };
}



function reviewItems({ query }) {
  const value = f.onlyKeys(f.object(query, 'query'), ['source', 'conceptId', 'topicId', 'page', 'size', 'limit'], 'query');
  const result = paging({ page: value.page, size: value.size, limit: value.limit });
  if (value.source !== undefined) result.source = f.oneOf(value.source, ['BOOKMARK', 'WRONG'], 'source');
  if (value.conceptId !== undefined) result.conceptId = f.uuid(value.conceptId, 'conceptId');
  if (value.topicId !== undefined) result.topicId = f.uuid(value.topicId, 'topicId');
  return { query: result };
}

function todayKst() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function due({ query }) {
  const value = f.onlyKeys(f.object(query, 'query'), ['date'], 'query');
  return { query: { date: value.date === undefined ? todayKst() : f.dateOnly(value.date, 'date') } };
}



function rewardLedger({ query }) { return { query: paging(query) }; }



function notificationUpdate({ params, query, body }) {
  noQuery(query);
  const value = f.onlyKeys(f.object(body, 'body'), ['reminderEnabled', 'reminderTime', 'timezone'], 'body');
  if (typeof value.reminderEnabled !== 'boolean') throw AppError.validation('reminderEnabled는 boolean이어야 합니다.');
  const result = { reminderEnabled: value.reminderEnabled };
  if (value.reminderTime !== undefined && value.reminderTime !== null) result.reminderTime = f.time(value.reminderTime, 'reminderTime');
  else if (value.reminderTime === null) result.reminderTime = null;
  if (value.timezone !== undefined) {
    result.timezone = f.string(value.timezone, 'timezone', 50);
    try { new Intl.DateTimeFormat('en-US', { timeZone: result.timezone }).format(); } catch { throw AppError.validation('timezone은 IANA 시간대여야 합니다.'); }
  }
  return { params, body: result };
}

function classUpdate({ params, query, body }) {
  noQuery(query);
  const value = f.onlyKeys(f.object(body, 'body'), ['classId'], 'body');
  return { params, body: { classId: f.uuid(value.classId, 'classId') } };
}

function shopList({ query }) {
  const value = f.onlyKeys(f.object(query, 'query'), ['category', 'page', 'size', 'limit'], 'query');
  const result = paging({ page: value.page, size: value.size, limit: value.limit });
  if (value.category !== undefined) result.category = f.oneOf(value.category, ['TOP', 'BOTTOM'], 'category');
  return { query: result };
}


function passwordResetRequest({ params, query, body }) {
  noQuery(query);
  const value = f.onlyKeys(f.object(body, 'body'), ['email'], 'body');
  return { params, body: { email: authFields.email(value.email) } };
}

function passwordResetConfirm({ params, query, body }) {
  noQuery(query);
  const value = f.onlyKeys(f.object(body, 'body'), ['resetToken', 'newPassword'], 'body');
  return { params, body: { resetToken: f.string(value.resetToken, 'resetToken', 4096), newPassword: authFields.password(value.newPassword) } };
}



function statisticsOverall({ query }) {
  const value = f.onlyKeys(f.object(query, 'query'), ['from', 'to'], 'query');
  const from = value.from === undefined ? undefined : f.dateOnly(value.from, 'from');
  const to = value.to === undefined ? undefined : f.dateOnly(value.to, 'to');
  if (from && to && from > to) throw AppError.validation('from은 to보다 늦을 수 없습니다.');
  return { query: { ...(from ? { from } : {}), ...(to ? { to } : {}) } };
}

function statisticsConcepts({ query }) {
  const value = f.onlyKeys(f.object(query, 'query'), ['sort', 'limit', 'topicId'], 'query');
  const result = {};
  if (value.sort !== undefined) result.sort = f.oneOf(value.sort, ['title', 'accuracy', 'attempts'], 'sort');
  if (value.limit !== undefined) result.limit = f.positiveIntQuery(value.limit, 'limit', { fallback: 1, max: 100 });
  if (value.topicId !== undefined) result.topicId = f.uuid(value.topicId, 'topicId');
  return { query: result };
}

function passwordless({ params, query, body }) { noQuery(query); noBody(body); return { params }; }

function empty(input) { return passwordless(input); }

function bossStart({ params, query, body }) {
  noQuery(query);
  const value = f.onlyKeys(f.object(body, 'body'), ['mode'], 'body');
  return { params: path(params, 'bossId'), body: { mode: f.oneOf(value.mode, ['START', 'RETRY'], 'mode') } };
}

module.exports = {
  noQuery, noBody, pathOnly, stageStart, reviewItems, due, rewardLedger,
  notificationUpdate, classUpdate, shopList,
  passwordResetRequest, passwordResetConfirm, statisticsOverall,
  statisticsConcepts, passwordless, empty, bossStart,
  topic: pathOnly('topicId'), boss: pathOnly('bossId'), mission: pathOnly('missionId'),
  reviewAttempt: pathOnly('reviewAttemptId'), question: pathOnly('questionId'), item: pathOnly('itemId'),
  attempt: pathOnly('attemptId'),
};
