const AppError = require('../../common/errors/AppError');
const { dateOnly } = require('./dto/scheduleRequest.dto');
const { seoulDate } = require('../learning/dto/historyResponse.dto');

const start = date => new Date(`${date}T00:00:00+09:00`);
function nextDate(date) {
  const instant = start(date);
  instant.setUTCDate(instant.getUTCDate() + 1);
  return seoulDate(instant);
}
function dayRange(date) {
  dateOnly(date, 'date');
  return { start: start(date), end: new Date(start(date).getTime() + 86400000) };
}
function monthRange(month) {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) throw AppError.validation('month는 YYYY-MM이어야 합니다.');
  const first = dateOnly(`${month}-01`, 'month');
  const [year, number] = month.split('-').map(Number);
  // Upper boundary can be year 10000; use Date arithmetic instead of a five-digit ISO literal.
  const end = new Date(0);
  end.setUTCFullYear(number === 12 ? year + 1 : year, number % 12, 1);
  end.setUTCHours(-9, 0, 0, 0);
  const dates = [];
  let cursor = start(first);
  while (cursor < end) {
    dates.push(seoulDate(cursor));
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return { year, month: number, first, next: number === 12 ? `${String(year + 1).padStart(4, '0')}-01-01` : `${month.slice(0, 4)}-${String(number + 1).padStart(2, '0')}-01`, start: start(first), end, dates };
}
module.exports = { dayRange, monthRange, nextDate, seoulDate };
