function toISOStringOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

module.exports = { toISOStringOrNull };
function startOfSeoulDay(date = new Date()) {
  const seoul = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
  return new Date(`${seoul}T00:00:00+09:00`);
}

module.exports = { startOfSeoulDay };
