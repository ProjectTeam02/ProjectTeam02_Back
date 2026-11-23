const assert = require('node:assert/strict');
const test = require('node:test');

const { verifiedContext } = require('../src/modules/tutor/verified-context.repository');
const aiRequestDto = require('../src/modules/tutor/dto/aiInternalRequest.dto');

const concept = {
  concept_id: 'concept-1',
  concept_code: 'ECO-01',
  version: 2,
  title: '기회비용',
  short_definition: '선택으로 포기한 대안의 가치',
  source_document_ids: ['doc-1'],
  reviewed_by: 'reviewer-1',
  reviewed_at: '2026-11-23T00:00:00.000Z',
};

function managerFor({ sourceStatus = 'approved', licenseStatus = 'approved', prerequisiteStatus = 'APPROVED' } = {}) {
  return {
    async query(sql) {
      if (sql.includes('FROM content.concepts')) return [concept];
      if (sql.includes('FROM ai.rag_documents')) {
        return [{ document_id: 'doc-1', version: 'v1', title: '한국은행 자료', review_status: sourceStatus, license_review_status: licenseStatus }];
      }
      if (sql.includes('FROM content.concept_prerequisites')) {
        return [{ concept_code: 'ECO-01', prerequisite_concept_code: 'ECO-00', review_status: prerequisiteStatus, reviewed_by: 'reviewer-1', reviewed_at: '2026-11-23T00:00:00.000Z', display_order: 1 }];
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

test('backend builds a VERIFIED context only from approved rows with review history', async () => {
  const result = await verifiedContext(managerFor(), { conceptCode: 'ECO-01' });

  assert.equal(result.verificationStatus, 'VERIFIED');
  assert.deepEqual(result.sourceDocumentIds, ['doc-1']);
  assert.equal(result.sources[0].documentId, 'doc-1');
  assert.equal(result.prerequisiteConcepts[0].conceptCode, 'ECO-00');
});

test('pending license or prerequisite review blocks the AI context', async () => {
  const result = await verifiedContext(managerFor({ licenseStatus: 'PENDING' }), { conceptCode: 'ECO-01' });

  assert.equal(result.verificationStatus, 'BLOCKED');
  assert.equal(result.sourceDocumentIds.length, 0);
  assert.ok(result.blockingReasons.some(reason => reason.startsWith('LICENSE_REVIEW_NOT_APPROVED')));
});

test('AI request keeps the optional verified context boundary in the internal contract', () => {
  const body = aiRequestDto.build({
    requestId: 'request-1',
    userId: 'user-1',
    conversation: { conversationId: 'conversation-1', summary: null, summaryUntilSeq: null },
    input: { question: 'q', modelTier: 'BASIC', context: null, knowledgeScope: null },
    historyRows: [],
    verifiedContext: { verificationStatus: 'BLOCKED', conceptCode: 'ECO-01' },
  });

  assert.equal(body.verifiedContext.verificationStatus, 'BLOCKED');
  assert.equal(aiRequestDto.build({
    requestId: 'request-2',
    userId: 'user-1',
    conversation: { conversationId: 'conversation-1', summary: null, summaryUntilSeq: null },
    input: { question: 'q', modelTier: 'BASIC', context: null, knowledgeScope: null },
    historyRows: [],
  }).verifiedContext, undefined);
});
