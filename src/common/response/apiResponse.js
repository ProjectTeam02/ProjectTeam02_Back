function success(data, message = 'OK') {
  return { success: true, message, data };
}

function failure(message, code, details) {
  return { success: false, message, code, details };
}

module.exports = { success, failure };
