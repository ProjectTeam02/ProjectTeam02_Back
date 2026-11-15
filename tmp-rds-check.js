const { Client } = require('pg');
const c = new Client({
  host: process.env.DB_HOST, port: +process.env.DB_PORT, database: process.env.DB_NAME,
  user: process.env.DB_MIGRATION_USER, password: process.env.DB_MIGRATION_PASSWORD,
  ssl: { rejectUnauthorized: true, ca: process.env.DB_SSL_CA },
  connectionTimeoutMillis: 10000,
});
const q = {
  version: `SELECT version()`,
  question_status_enum: `SELECT enum_range(NULL::app.question_status)::text AS v`,
  topics: `SELECT topic_code, title, status FROM app.topics ORDER BY topic_no`,
  stages: `SELECT stage_code, stage_type, status, max_question_count, required_correct_count, initial_monster_hp, reward_total_exp, reward_economy_exp, reward_coin FROM app.stages ORDER BY stage_code`,
  concepts: `SELECT concept_code, title, status FROM app.concepts ORDER BY concept_code`,
  stage_question_counts: `SELECT s.stage_code, count(*)::int FROM app.stage_questions sq JOIN app.stages s USING (stage_id) GROUP BY 1`,
  question_status_counts: `SELECT status, count(*)::int FROM app.questions GROUP BY 1`,
  published_mismatch: `SELECT count(*)::int FROM app.questions WHERE (status IN ('PUBLISHED','RETIRED')) <> (published_at IS NOT NULL)`,
  review_missing: `SELECT count(*)::int FROM app.questions WHERE status IN ('APPROVED','REJECTED','PUBLISHED') AND (reviewed_by IS NULL OR reviewed_at IS NULL)`,
  correct_not_one: `SELECT question_id, count(*)::int FROM app.question_choices WHERE is_correct GROUP BY 1 HAVING count(*) <> 1`,
  user_defaults_missing: `SELECT count(*)::int AS users,
      count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM app.user_wallets w WHERE w.user_id=u.user_id))::int AS no_wallet,
      count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM app.user_growth g WHERE g.user_id=u.user_id))::int AS no_growth,
      count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM app.user_settings s WHERE s.user_id=u.user_id))::int AS no_settings
    FROM app.users u`,
  ai_tables: `SELECT table_name FROM information_schema.tables WHERE table_schema='ai' ORDER BY 1`,
  rag_documents_columns: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='ai' AND table_name='rag_documents' ORDER BY ordinal_position`,
  rag_documents_count: `SELECT count(*)::int FROM ai.rag_documents`,
  rag_document_versions: `SELECT document_version, count(*)::int FROM ai.rag_documents GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
};
const fs = require('fs');
const path = require('path');
const os = require('os');
(async () => {
  await c.connect();
  const out = {};
  for (const [name, sql] of Object.entries(q)) {
    try { out[name] = (await c.query(sql)).rows; }
    catch (e) { out[name] = { error: e.message }; }
  }
  await c.end();
  const file = path.join(os.homedir(), 'rds-check-result.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
  console.log('저장 완료:', file);
})().catch((e) => { console.error('연결 실패:', e.message); process.exit(1); });