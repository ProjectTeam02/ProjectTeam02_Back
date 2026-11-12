/** 직업 변경 응답 DTO. */
function response(value) {
  return { userId: value.userId, classId: value.classId, classCode: value.classCode };
}

module.exports = { response };
