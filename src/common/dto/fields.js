/**
 * DTO 공통 필드 검사·변환 파일
 * 백엔드 작업: 여러 모듈 DTO가 같이 쓰는 uuid·문자열·정수·객체 검사와 시각 변환을 한곳에서 관리
 * 주의: 검증 실패는 AppError.validation(422 VALIDATION_ERROR)으로 던진다.
 *       길이 제한은 각 DTO에서 DB 컬럼 길이에 맞춰 넘긴다.
 */
const AppError = require('../errors/AppError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 객체가 아니면 422. 없으면(undefined·null) 빈 객체로 본다 */
function object(value, name) {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) throw AppError.validation(`${name}은(는) 객체여야 합니다.`);
  return value;
}

/** 허용하지 않은 키가 있으면 422 */
function onlyKeys(value, allowed, name) {
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length) throw AppError.validation(`${name}에 허용되지 않은 필드가 있습니다: ${unknown.join(', ')}`);
  return value;
}

/** uuid 문자열 (소문자로 정규화) */
function uuid(value, name) {
  if (typeof value !== 'string' || !UUID.test(value.trim())) {
    throw AppError.validation(`${name}이(가) 올바른 UUID가 아닙니다.`);
  }
  return value.trim().toLowerCase();
}

/** 선택 uuid: undefined·null이면 null */
function optionalUuid(value, name) {
  return value === undefined || value === null ? null : uuid(value, name);
}

/** 앞뒤 공백 제거 후 1~max자 문자열 */
function string(value, name, max) {
  if (typeof value !== 'string' || !value.trim()) {
    throw AppError.validation(`${name}은(는) 비어 있지 않은 문자열이어야 합니다.`);
  }
  const trimmed = value.trim();
  if ([...trimmed].length > max) throw AppError.validation(`${name}은(는) ${max}자 이하여야 합니다.`);
  return trimmed;
}

function optionalString(value, name, max) {
  return value === undefined || value === null ? null : string(value, name, max);
}

/** 정해진 값 중 하나 */
function oneOf(value, allowed, name) {
  if (!allowed.includes(value)) throw AppError.validation(`${name}은(는) ${allowed.join(', ')} 중 하나여야 합니다.`);
  return value;
}

function integer(value, name, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw AppError.validation(`${name}은(는) ${min}~${max} 범위의 정수여야 합니다.`);
  }
  return value;
}

function dateOnly(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw AppError.validation(`${name}은(는) YYYY-MM-DD 형식이어야 합니다.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw AppError.validation(`${name}은(는) 유효한 날짜여야 합니다.`);
  }
  return value;
}

function time(value, name) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    throw AppError.validation(`${name}은(는) HH:MM 또는 HH:MM:SS 형식이어야 합니다.`);
  }
  return value;
}

/** Query 문자열 양의 정수 (예: page). 없으면 fallback */
function positiveIntQuery(value, name, { fallback, max = 2147483647 }) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) {
    throw AppError.validation(`${name}은(는) 1 이상 ${max} 이하의 정수여야 합니다.`);
  }
  return Number(value);
}

/** Date·문자열 → ISO 문자열, 없으면 null */
function iso(value) {
  if (value === undefined || value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

module.exports = {
  UUID, isObject, object, onlyKeys, uuid, optionalUuid, string, optionalString, oneOf,
  integer, dateOnly, time, positiveIntQuery, iso,
};
