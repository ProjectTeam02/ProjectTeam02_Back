/** Server-owned approved evidence corpus; never accept source mappings from HTTP input.
 * Uses the canonical EvidenceSource JSONL fields from the AI repository.
 * This verifies document identity against the corpus, not against a remote AI DB.
 */
const { readFile } = require('node:fs/promises');
const AppError = require('../../common/errors/AppError');
async function loadEvidence(path) {
  if (!path) throw AppError.unavailable('승인 근거 문서 파일이 설정되지 않았습니다.');
  let lines;
  try { lines = (await readFile(path, 'utf8')).split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)); }
  catch (_error) { throw AppError.unavailable('승인 근거 문서 파일을 읽을 수 없습니다.'); }
  const mappings = new Map();
  const valid = (value, max) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;
  for (const row of lines) {
    if (typeof row?.review_status !== 'string' || row.review_status.toLowerCase() !== 'approved') continue;
    if (!valid(row.source_id, 200) || !valid(row.document_id, 200)
      || !valid(row.document_version, 120) || !valid(row.content, 30000)) {
      throw AppError.unavailable('승인 근거 문서 형식이 올바르지 않습니다.');
    }
    const previous = mappings.get(row.source_id);
    if (previous && (previous.document_id !== row.document_id || previous.document_version !== row.document_version)) {
      throw AppError.unavailable('출처에 대응하는 문서 또는 버전이 여러 개입니다.');
    }
    mappings.set(row.source_id, { document_id: row.document_id, document_version: row.document_version });
  }
  if (!mappings.size) throw AppError.unavailable('사용 가능한 승인 근거 문서가 없습니다.');
  return {
    resolve(ids) {
      if (ids.some(id => !mappings.has(id))) throw AppError.unavailable('AI 출처를 승인 근거 문서에서 확인할 수 없습니다.');
      return [...new Set(ids.map(id => mappings.get(id).document_id))];
    },
    // Retain the exact identity/version mapping used for this generation.
    metadata(ids) { return Object.fromEntries(ids.map(id => [id, mappings.get(id)])); },
  };
}
module.exports = { loadEvidence };
