function toISOStringOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

module.exports = { toISOStringOrNull };
