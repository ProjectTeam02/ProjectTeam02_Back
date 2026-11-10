/** Manual, local-only recovery. Defaults to inspection; never calls AI.
 * Explicit QUESTION_RECOVERY_DB_CONFIG is required; no .env DB fallback.
 */
const { AppDataSource } = require('@leren/database');
const repository = require('../src/modules/questions/question-generation-request.repository');
async function main() {
  const args = process.argv.slice(2);
  const requestId = args[0];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId || '')) throw Error('INVALID_REQUEST_ID');
  const apply = args.includes('--mark-failed');
  const allowed = new Set(['--mark-failed', '--confirm-worker-stopped', '--expected-reserved-at', '--reason']);
  for (let i = 1; i < args.length; i++) {
    if (!allowed.has(args[i])) throw Error('INVALID_ARGUMENT');
    if (['--expected-reserved-at', '--reason'].includes(args[i])) i++;
  }
  const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  const expected = value('--expected-reserved-at');
  const reason = value('--reason');
  if (apply && (!args.includes('--confirm-worker-stopped') || !expected || !reason?.trim())) throw Error('RECOVERY_CONFIRMATION_REQUIRED');
  const config = JSON.parse(process.env.QUESTION_RECOVERY_DB_CONFIG || '{}');
  if (config.host !== '127.0.0.1' || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535
    || !config.database || !config.username || typeof config.password !== 'string') throw Error('EXPLICIT_LOCAL_DB_CONFIG_REQUIRED');
  // Override every connection setting; don't inherit production SSL, pool extras or replication.
  const { DataSource } = require('typeorm');
  const db = new DataSource({ type: 'postgres', schema: 'app', entities: AppDataSource.options.entities,
    host: config.host, port: config.port, database: config.database, username: config.username, password: config.password,
    ssl: false, synchronize: false, migrationsRun: false, installExtensions: false, logging: false });
  try {
    await db.initialize();
    const jobs = repository(db);
    const before = await jobs.inspect(requestId);
    if (apply) {
      await jobs.recover(requestId, expected, reason);
      console.log(JSON.stringify({ before, after: await jobs.inspect(requestId) }, null, 2));
    } else console.log(JSON.stringify(before, null, 2));
  } finally { if (db.isInitialized) await db.destroy(); }
}
main().catch(error => {
  // No connection configuration, SQL or upstream/driver error text in command output.
  console.error('Question recovery stopped:', /^[A-Z_]+$/.test(error.message) ? error.message : (error.code || 'RECOVERY_FAILED'));
  process.exitCode = 1;
});
