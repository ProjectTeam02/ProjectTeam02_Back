/** 북마크 변경 응답 DTO. */
function response(value) {
  return {
    questionId: value.questionId,
    bookmarked: Boolean(value.bookmarked),
    reviewItemId: value.reviewItemId ?? null,
  };
}

module.exports = { response };
