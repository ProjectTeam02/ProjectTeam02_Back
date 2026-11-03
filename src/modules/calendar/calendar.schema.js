const request = require('./dto/scheduleRequest.dto');

module.exports = {
  day: ({ params, query = {} }) => {
    if (Object.keys(query).length) throw require('../../common/errors/AppError').validation('지원하지 않는 조회 조건입니다.');
    return { params: { date: request.dateOnly(params.date, 'date') } };
  },
  month: ({ query = {} }) => {
    if (Object.keys(query).some(key => key !== 'month')) throw require('../../common/errors/AppError').validation('지원하지 않는 조회 조건입니다.');
    require('./calendar-date').monthRange(query.month);
    return { query: { month: query.month } };
  },
  create: ({ body }) => ({ body: request.parse(body) }),
  update: ({ body, params }) => ({ body: request.parse(body, true), params: { planId: request.uuid(params.planId, 'planId') } }),
  remove: ({ params }) => ({ params: { planId: request.uuid(params.planId, 'planId') } }),
};
