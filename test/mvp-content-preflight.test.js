const assert = require('node:assert/strict');
const test = require('node:test');
const { graphProblems } = require('../scripts/lib/mvp-content-audit');
const { options, run, markdown } = require('../scripts/mvp-content-preflight');

test('graph flags real cycles, missing legacy code references, and draft prerequisites', () => {
  const nodes = new Map([['A', { status: 'PUBLISHED' }], ['B', { status: 'PUBLISHED' }], ['C', { status: 'DRAFT' }]]);
  const found = [];
  graphProblems([{source:'A',target:'B'}, {source:'B',target:'A'}, {source:'A',target:'C'},
    {source:'C',target:'Q'}, {source:'B',target:'B'}, {source:'A',target:'B'}], nodes, 'CONCEPT', (_, code) => found.push(code));
  assert.deepEqual(found.sort(), ['CONCEPT_CYCLE', 'CONCEPT_DUPLICATE', 'CONCEPT_MISSING_NODE', 'CONCEPT_SELF', 'CONCEPT_UNPUBLISHED_REQUIRED']);
});

test('CLI requires explicit host and guards remote TLS and date validity', () => {
  const local = { PGHOST:'127.0.0.1', PGDATABASE:'fixture', PGUSER:'reader' };
  assert.equal(options(['--date','2026-11-19'], local).date, '2026-11-19');
  assert.throws(() => options(['--date','2026-02-30'], local));
  assert.throws(() => options([], { ...local, PGHOST:'example.test' }));
  assert.throws(() => options([], {}));
});

test('connection failure is sanitized and remaining sections are not tested', async () => {
  const report = await run({ connect: async () => { throw Object.assign(new Error('sensitive-value'), { code: 'ECONNREFUSED' }); }, end: async () => {} }, '2026-11-19');
  assert.equal(report.sections.connection, 'FAIL');
  assert.equal(report.sections.boss, 'NOT TESTED');
  assert.doesNotMatch(JSON.stringify(report) + markdown(report), /sensitive-value/);
});
