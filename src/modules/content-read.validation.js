const AppError = require('../common/errors/AppError');

function uuid(value, name) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw AppError.validation(`${name}이(가) 올바른 UUID가 아닙니다.`);
  }
  return value.toLowerCase();
}

function noQuery({ query = {} }) {
  if (Object.keys(query).length) throw AppError.validation('지원하지 않는 조회 조건입니다.');
}

function resource(name) {
  return ({ params, query }) => {
    noQuery({ query });
    return { params: { [name]: uuid(params[name], name) } };
  };
}

module.exports = { noQuery, resource };
