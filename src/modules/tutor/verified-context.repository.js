/**
 * Backend-owned verification boundary for concept-scoped AI retrieval.
 *
 * This module only reads existing content and AI metadata. It never promotes
 * a concept, source, or prerequisite relationship to an approved state.
 */
const APPROVED_LICENSE_STATUSES = new Set(['approved', 'cleared', 'verified']);

const unique = values => [...new Set((values || []).filter(value => typeof value === 'string' && value.trim()))];

function blocked(status, concept, reasons) {
  return {
    verificationStatus: 'BLOCKED',
    conceptId: concept?.concept_id || null,
    conceptCode: concept?.concept_code || 'UNKNOWN',
    version: concept?.version || 1,
    title: concept?.title || '검증되지 않은 개념',
    shortDefinition: concept?.short_definition || null,
    sourceDocumentIds: [],
    sources: [],
    prerequisiteConcepts: [],
    blockingReasons: unique([status, ...reasons]),
  };
}

async function loadConcept(manager, { conceptId, conceptCode }) {
  if (!conceptId && !conceptCode) return null;
  const where = conceptId ? 'c.concept_id = $1' : 'c.concept_code = $1';
  const [row] = await manager.query(`
    SELECT c.concept_id, c.concept_code, c.version, c.title,
           c.short_definition, c.source_document_ids, c.reviewed_by, c.reviewed_at
      FROM content.concepts c
      JOIN content.topics t ON t.topic_id = c.topic_id
     WHERE ${where}
       AND c.status = 'PUBLISHED'
       AND t.status = 'PUBLISHED'
     ORDER BY c.version DESC
     LIMIT 1
  `, [conceptId || conceptCode]);
  return row || null;
}

async function loadSources(manager, documentIds) {
  if (!documentIds.length) return [];
  return manager.query(`
    SELECT document_id, version, title, review_status,
           metadata_json ->> 'license_review_status' AS license_review_status
      FROM ai.rag_documents
     WHERE document_id = ANY($1::varchar[])
  `, [documentIds]);
}

async function loadPrerequisites(manager, conceptCode) {
  return manager.query(`
    SELECT concept_code, prerequisite_concept_code, review_status,
           reviewed_by, reviewed_at, display_order
      FROM content.concept_prerequisites
     WHERE concept_code = $1
     ORDER BY display_order ASC, prerequisite_concept_code ASC
  `, [conceptCode]);
}

function sourceProblems(documentIds, rows) {
  const byId = new Map(rows.map(row => [row.document_id, row]));
  const reasons = [];
  for (const documentId of documentIds) {
    const row = byId.get(documentId);
    if (!row) {
      reasons.push(`SOURCE_DOCUMENT_NOT_FOUND:${documentId}`);
      continue;
    }
    if (String(row.review_status || '').toLowerCase() !== 'approved') {
      reasons.push(`SOURCE_REVIEW_NOT_APPROVED:${documentId}`);
    }
    const licenseStatus = String(row.license_review_status || '').toLowerCase();
    if (!APPROVED_LICENSE_STATUSES.has(licenseStatus)) {
      reasons.push(`LICENSE_REVIEW_NOT_APPROVED:${documentId}`);
    }
  }
  return reasons;
}

function prerequisiteProblems(rows) {
  return rows
    .filter(row => (
      String(row.review_status || '').toUpperCase() !== 'APPROVED'
      || !row.reviewed_by
      || !row.reviewed_at
    ))
    .map(row => `PREREQUISITE_REVIEW_NOT_APPROVED:${row.concept_code}->${row.prerequisite_concept_code}`);
}

async function verifiedContext(manager, identifiers) {
  const concept = await loadConcept(manager, identifiers);
  if (!concept) return blocked('CONCEPT_NOT_PUBLISHED', null, []);
  if (!concept.reviewed_by || !concept.reviewed_at) {
    return blocked('CONCEPT_REVIEW_HISTORY_MISSING', concept, []);
  }

  const sourceDocumentIds = unique(concept.source_document_ids);
  if (!sourceDocumentIds.length) return blocked('CONCEPT_SOURCE_DOCUMENTS_MISSING', concept, []);
  const [sources, prerequisites] = await Promise.all([
    loadSources(manager, sourceDocumentIds),
    loadPrerequisites(manager, concept.concept_code),
  ]);
  const reasons = [
    ...sourceProblems(sourceDocumentIds, sources),
    ...prerequisiteProblems(prerequisites),
  ];
  if (reasons.length) return blocked('VERIFIED_CONTEXT_BLOCKED', concept, reasons);

  const sourceById = new Map(sources.map(row => [row.document_id, row]));
  return {
    verificationStatus: 'VERIFIED',
    conceptId: concept.concept_id,
    conceptCode: concept.concept_code,
    version: concept.version,
    title: concept.title,
    shortDefinition: concept.short_definition || null,
    sourceDocumentIds,
    sources: sourceDocumentIds.map(documentId => {
      const row = sourceById.get(documentId);
      return {
        documentId,
        documentVersion: row.version || null,
        title: row.title || null,
        reviewStatus: row.review_status,
        licenseReviewStatus: row.license_review_status,
      };
    }),
    prerequisiteConcepts: prerequisites.map(row => ({
      conceptCode: row.prerequisite_concept_code,
      relationshipType: 'PREREQUISITE',
      relationReviewStatus: row.review_status,
      depth: 1,
    })),
    blockingReasons: [],
  };
}

module.exports = {
  APPROVED_LICENSE_STATUSES,
  verifiedContext,
};
