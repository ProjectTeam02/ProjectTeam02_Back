/**
 * 달력 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 */
const AppError = require('../../../common/errors/AppError');

const fields = ['scheduledDate', 'topicId', 'stageId', 'conceptId', 'planType', 'goal'];
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function uuid(value, name) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw AppError.validation(`${name}이(가) 올바른 UUID가 아닙니다.`);
  }
  return value.toLowerCase();
}

function dateOnly(value, name = 'scheduledDate') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw AppError.validation(`${name}는 YYYY-MM-DD 날짜여야 합니다.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw AppError.validation(`${name}가 유효한 날짜가 아닙니다.`);
  }
  // A Seoul calendar date is stored as PostgreSQL date; never convert it through UTC.
  return value;
}

function parse(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !fields.includes(key))) {
    throw AppError.validation('허용되지 않은 일정 요청 필드입니다.');
  }
  if (partial && !Object.keys(body).length) throw AppError.validation('수정할 필드가 필요합니다.');
  if (!partial) {
    for (const key of ['scheduledDate', 'topicId', 'planType', 'goal']) {
      if (!has(body, key)) throw AppError.validation(`${key}이(가) 필요합니다.`);
    }
  }
  const result = {};
  if (has(body, 'scheduledDate')) result.scheduledDate = dateOnly(body.scheduledDate);
  if (has(body, 'topicId')) result.topicId = uuid(body.topicId, 'topicId');
  for (const key of ['stageId', 'conceptId']) {
    if (has(body, key)) result[key] = body[key] === null ? null : uuid(body[key], key);
  }
  if (has(body, 'planType')) {
    if (!['NEW_LEARNING', 'REVIEW'].includes(body.planType)) throw AppError.validation('planType이 올바르지 않습니다.');
    result.planType = body.planType;
  }
  if (has(body, 'goal')) {
    if (typeof body.goal !== 'string' || !body.goal.trim() || [...body.goal.trim()].length > 30) {
      throw AppError.validation('goal은 앞뒤 공백을 제거한 1~30자의 목표여야 합니다.');
    }
    result.goal = body.goal.trim();
  }
  return result;
}

module.exports = { parse, uuid, dateOnly };
