const test = require('node:test');
const assert = require('node:assert/strict');
const { assertApprovedTutorSources } = require('../src/modules/tutor/approvedSources');

const source = (documentId) => ({ documentId });

function fakeManager(rows) {
  const calls = [];
  return {
    calls,
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return rows;
    },
  };
}

test('no citations: do not query approval DB', async () => {
  const manager = fakeManager([]);
  await assertApprovedTutorSources(manager, []);
  assert.equal(manager.calls.length, 0);
});

test('approved citations: pass and query all document ids at once', async () => {
  const manager = fakeManager([
    { document_id: 'doc-a', review_status: 'approved' },
    { document_id: 'doc-b', review_status: 'APPROVED' },
  ]);
  await assertApprovedTutorSources(manager, [source('doc-a'), source('doc-b'), source('doc-a')]);
  assert.equal(manager.calls.length, 1);
  assert.deepEqual(manager.calls[0].parameters, [['doc-a', 'doc-b']]);
  assert.match(manager.calls[0].sql, /ai\.rag_documents/);
});

test('reject missing citation documents', async () => {
  const manager = fakeManager([{ document_id: 'doc-a', review_status: 'approved' }]);
  await assert.rejects(
    assertApprovedTutorSources(manager, [source('doc-a'), source('missing')]),
    (error) => error.statusCode === 503 && error.code === 'SERVICE_UNAVAILABLE',
  );
});

test('reject documents not approved for content', async () => {
  for (const review_status of ['pending', 'rejected', 'draft']) {
    const manager = fakeManager([{ document_id: 'doc-a', review_status }]);
    await assert.rejects(
      assertApprovedTutorSources(manager, [source('doc-a')]),
      (error) => error.statusCode === 503,
    );
  }
});

test('approval lookup failures are not swallowed', async () => {
  const manager = { async query() { throw new Error('database unavailable'); } };
  await assert.rejects(assertApprovedTutorSources(manager, [source('doc-a')]), /database unavailable/);
});
