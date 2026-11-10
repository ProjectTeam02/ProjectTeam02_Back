const AppError = require('../../common/errors/AppError');
const { pagination } = require('../../common/utils/pagination.util');

const statuses = ['IN_PROGRESS', 'PASSED', 'FAILED', 'ABANDONED'];
function integer(value, fallback, name, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)
    || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
    throw AppError.validation(`${name}이(가) 올바른 양의 정수가 아닙니다.`);
  }
  return Number(value);
}

function list({ query = {} }) {
  if (!query || typeof query !== 'object' || Array.isArray(query)
    || Object.keys(query).some(key => !['page', 'pageSize', 'size', 'status', 'type', 'dateFrom', 'dateTo'].includes(key))) {
    throw AppError.validation('허용되지 않은 학습 이력 조회 조건입니다.');
  }
  const page = integer(query.page, 1, 'page', 2147483647);
  const pageSizeValue = query.pageSize !== undefined ? query.pageSize : query.size;
  const pageSize = integer(pageSizeValue, 20, 'size', 100);
  if (query.status !== undefined && !statuses.includes(query.status)) {
    throw AppError.validation('status가 올바르지 않습니다.');
  }
  return { query: { page: String(page), pageSize: String(pageSize), ...(query.status ? { status: query.status } : {}), ...(query.type ? { type: query.type } : {}), ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}), ...(query.dateTo ? { dateTo: query.dateTo } : {}) } };
}

function detail({ params = {} }) {
  if (params.recordType !== 'LEARNING') {
    throw AppError.validation('이번 API는 LEARNING 이력만 지원합니다.');
  }
  if (typeof params.recordId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.recordId)) {
    throw AppError.validation('recordId가 올바른 UUID가 아닙니다.');
  }
  return { params: { recordType: 'LEARNING', recordId: params.recordId.toLowerCase() } };
}

function listOptions(query) {
  const validated = list({ query }).query;
  return { ...pagination(validated), ...(validated.status ? { status: validated.status } : {}) };
}

module.exports = { list, detail, listOptions };
