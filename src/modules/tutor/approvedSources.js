/**
 * Verify that all AI Tutor citation documents exist and have been content-approved.
 * License review is a separate policy from content review, and is not checked here.
 */
const AppError = require('../../common/errors/AppError');

async function assertApprovedTutorSources(manager, sources) {
  if (!sources?.length) return;

  const documentIds = [...new Set(sources.map((source) => source.documentId))];
  const rows = await manager.query(
    `SELECT document_id, review_status
       FROM ai.rag_documents
      WHERE document_id = ANY($1::varchar[])`,
    [documentIds],
  );
  const approved = new Set(
    rows.filter((row) => String(row.review_status).toLowerCase() === 'approved')
      .map((row) => row.document_id),
  );
  if (documentIds.some((documentId) => !approved.has(documentId))) {
    throw AppError.unavailable('AI 답변의 출처 문서를 검증할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }
}

module.exports = { assertApprovedTutorSources };
