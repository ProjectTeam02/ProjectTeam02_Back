const AppError = require('../../common/errors/AppError');

function notification({ body }) {
  if (typeof body.learningOn !== 'boolean') throw AppError.validation('learningOn은 boolean이어야 합니다.');
  return { body: { learningOn: body.learningOn } };
}

module.exports = { notification };
