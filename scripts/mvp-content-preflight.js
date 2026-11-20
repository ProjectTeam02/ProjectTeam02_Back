#!/usr/bin/env node
const { readFileSync, readdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { sections, audit } = require('./lib/mvp-content-audit');
const queries = require('./lib/mvp-content-queries');
const boss = require('../src/modules/quizzes/boss-question.repository');

const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
const state = () => Object.fromEntries(sections.map(name => [name, 'NOT TESTED']));
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
function options(argv, env) {
  const out = { date: today() };
  if (argv.length % 2 !== 0) throw new Error('Expected --date, --json, or --markdown followed by a value');
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].slice(2);
    if (!['--date', '--json', '--markdown'].includes(argv[i]) || !argv[i + 1]) throw new Error('Invalid output or date option');
    out[key] = argv[i + 1];
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.date)) throw new Error('Use --date YYYY-MM-DD');
  const date = new Date(out.date);
  if (Number.isNaN(+date) || date.toISOString().slice(0, 10) !== out.date) throw new Error('Invalid calendar date');
  if (out.json && out.markdown && path.resolve(out.json) === path.resolve(out.markdown)) throw new Error('Use distinct report paths');
  if (!env.PGHOST || !env.PGDATABASE || !env.PGUSER) throw new Error('Set PGHOST, PGDATABASE, and PGUSER explicitly');
  const local = localHosts.has(env.PGHOST);
  if (!local && (env.LEREN_PREFLIGHT_REMOTE_READONLY !== '1' || env.PGSSLMODE !== 'verify-full')) {
    throw new Error('Remote scan requires explicit opt-in and PGSSLMODE=verify-full');
  }
  const port = Number(env.PGPORT ?? 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PGPORT');
  const ssl = local ? false : { rejectUnauthorized: true, ...(env.PGSSLROOTCERT ? { ca: readFileSync(env.PGSSLROOTCERT) } : {}) };
  out.db = { host: env.PGHOST, database: env.PGDATABASE, user: env.PGUSER, port, ssl, connectionTimeoutMillis: 5000 };
  return out;
}

async function run(client, date, migrationsDir = path.resolve(__dirname, '../database/dist/migrations')) {
  const report = { status: 'NOT TESTED', asOfDateKst: date, sections: state(), postgres: null, stages: [], findings: [],
    scopeNotes: ['Review: original wrong/bookmarked items only; similar/unseen-first not implemented on this baseline.',
      'No editorial approval, asset existence, live HTTP or operating readiness implied by a data pass.'] };
  const add = (section, code, id, severity, actual, expected, recommendation) => {
    report.findings.push({ section, code, id, severity, actual, expected, cause: code, recommendation });
    if (severity === 'FAIL') report.sections[section] = 'FAIL';
  };
  const query = async (sql, params) => (await client.query(sql, params)).rows;
  let current = 'connection', started = false;
  try {
    await client.connect();
    await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    started = true;
    await query("SET LOCAL statement_timeout = '30s'");
    await query("SET LOCAL lock_timeout = '3s'");
    const [connection] = await query("SELECT current_setting('server_version') AS version, current_setting('transaction_read_only') AS readonly");
    if (connection.readonly !== 'on') throw new Error('READ_ONLY_REQUIRED');
    report.postgres = connection.version;
    report.sections.connection = 'PASS';
    current = 'migration';
    const expected = readdirSync(migrationsDir).map(name => /^(\d+)-.+\.js$/.exec(name)?.[1]).filter(Boolean).sort();
    if (!expected.length) throw new Error('MIGRATION_BUILD_REQUIRED');
    const [table] = await query("SELECT to_regclass('app.migrations')::text AS name");
    const applied = table.name ? (await query('SELECT timestamp::text FROM app.migrations ORDER BY timestamp')).map(row => row.timestamp) : [];
    const pending = expected.filter(t => !applied.includes(t));
    const unknown = applied.filter(t => !expected.includes(t));
    report.migrations = { expected: expected.length, applied: applied.length, pending, unknown };
    if (pending.length || unknown.length) {
      add('migration', 'MIGRATION_SET_DIFFERS', null, 'FAIL', { pending, unknown }, 'matching migrations',
        'npm run db:build 및 배포 대상 브랜치의 Migration 상태를 확인하세요. 도구는 적용하지 않습니다.');
    } else {
      report.sections.migration = 'PASS';
      const snap = {};
      const single = new Set(['outfitIntegrity', 'ledgers', 'reviewIntegrity']);
      const domain = { topics: 'concept_graph', concepts: 'concept_graph', stages: 'normal_stage', questions: 'question_quality',
        links: 'concept_graph', topicEdges: 'concept_graph', conceptEdges: 'concept_graph', slots: 'normal_stage', levels: 'reward_seed',
        costumes: 'costume_seed', reviewItems: 'review', reviewMissions: 'review', reviewIntegrity: 'review',
        bossSnapshots: 'boss', outfitIntegrity: 'costume_seed', ledgers: 'reward_seed' };
      for (const [name, sql] of Object.entries(queries)) {
        current = domain[name];
        const rows = await query(sql, name === 'reviewMissions' ? [date] : undefined);
        snap[name] = single.has(name) ? rows[0] : rows;
      }
      current = 'boss';
      snap.bossCounts = await boss.eligibleCounts({ query });
      snap.bossRequired = boss.questionCount;
      for (const name of sections.slice(2)) report.sections[name] = 'PASS';
      report.stages = audit(snap, add);
      report.inventory = { topics: snap.topics.length, concepts: snap.concepts.length, questions: snap.questions.length, costumes: snap.costumes.length,
        dueUnfinishedReviewMissions: snap.reviewMissions.length };
      if (!snap.topics.length && report.sections.concept_graph === 'PASS') report.sections.concept_graph = 'NOT TESTED';
      if (!snap.questions.some(q => q.status === 'PUBLISHED') && report.sections.question_quality === 'PASS') report.sections.question_quality = 'NOT TESTED';
      if (!snap.reviewMissions.length && !snap.reviewItems.length && !snap.reviewIntegrity.bad) {
        report.sections.review = 'NOT APPLICABLE';
        report.scopeNotes.push('No due unfinished mission or bad review reference was observed; use the HTTP regression to verify eligible-item flows.');
      }
    }
  } catch (error) {
    const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'CHECK_ERROR';
    add(current, 'CHECK_EXECUTION_FAILED', null, 'FAIL', code, 'readable snapshot',
      'DB 접속·SELECT 권한·컴파일된 Migration 및 스키마를 확인하세요. 연결 설정과 원본 오류는 출력하지 않습니다.');
    report.executionError = true;
  } finally {
    try { if (started) await query('ROLLBACK'); }
    finally { await client.end(); }
  }
  report.status = Object.values(report.sections).includes('FAIL') ? 'FAIL' : 'PASS';
  return report;
}

function markdown(report) {
  const cell = v => JSON.stringify(v ?? null).replace(/[|\r\n]/g, ' ');
  const rows = [
    '# Leren MVP content preflight', '', `- Result: **${report.status}**`, `- KST review date: ${report.asOfDateKst}`,
    `- PostgreSQL: ${report.postgres ?? 'not connected'}`, '', '| Check | Result |', '|---|---|',
    ...Object.entries(report.sections).map(([k, v]) => `| ${k} | ${v} |`),
    '', '| Stage | Topic | Eligible | Required | Shortage |', '|---|---|---:|---:|---:|',
    ...report.stages.map(s => `| ${cell(s.code)} | ${cell(s.topicCode)} | ${s.eligible} | ${s.required} | ${s.shortage} |`),
    '', '| Severity / check | ID | Observed | Expected | Action |', '|---|---|---|---|---|',
    ...report.findings.map(f => `| ${f.severity} / ${f.section} / ${f.code} | ${cell(f.id)} | ${cell(f.actual)} | ${cell(f.expected)} | ${f.recommendation} |`),
    '', ...(report.scopeNotes ?? []).map(s => '- ' + s), '',
  ];
  return rows.join('\n');
}

async function main() {
  try {
    const config = options(process.argv.slice(2), process.env);
    const report = await run(new Client(config.db), config.date);
    const json = JSON.stringify(report, null, 2) + '\n';
    if (config.json) writeFileSync(config.json, json, { mode: 0o600 });
    if (config.markdown) writeFileSync(config.markdown, markdown(report), { mode: 0o600 });
    if (!config.json && !config.markdown) process.stdout.write(json);
    else console.log(`MVP preflight: ${report.status} (${report.findings.length} findings)`);
    process.exitCode = report.executionError ? 2 : report.status === 'FAIL' ? 1 : 0;
  } catch (error) {
    console.error('Preflight could not run or write reports.', error.code ? String(error.code) : 'Check usage or DB connection settings.');
    process.exitCode = 2;
  }
}

if (require.main === module) void main();
module.exports = { run, markdown, options };
