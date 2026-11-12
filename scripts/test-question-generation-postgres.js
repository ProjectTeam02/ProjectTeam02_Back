/** Starts only a labelled, loopback-bound, disposable local PostgreSQL container. */
const { execFileSync, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const dockerEnv = { ...process.env };
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
const docker = args => execFileSync('docker', args, {
  env: dockerEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
const name = `leren-question-it-${randomBytes(4).toString('hex')}`;
const password = randomBytes(24).toString('hex');
let created = false;
(async () => {
  try {
    docker(['info', '--format', '{{.ServerVersion}}']);
    // Image download is allowed; there are no external AI requests.
    docker(['pull', 'postgres:18']);
    execFileSync('docker', ['run', '-d', '--rm', '--name', name,
      '--label', 'codex.purpose=leren-question-generation-integration',
      '--tmpfs', '/var/lib/postgresql:rw', '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=leren_question_it', 'postgres:18'],
    { env: { ...dockerEnv, POSTGRES_PASSWORD: password }, stdio: ['ignore', 'pipe', 'pipe'] });
    created = true;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { docker(['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'leren_question_it']); ready = true; break; }
      catch (_) { await new Promise(resolve => setTimeout(resolve, 200)); }
    }
    if (!ready) throw new Error('Disposable PostgreSQL did not become ready.');
    const [container] = JSON.parse(docker(['inspect', name]));
    const port = Number(container.NetworkSettings.Ports['5432/tcp'][0].HostPort);
    const result = spawnSync(process.execPath, ['--test', path.resolve(__dirname, '../test/integration/question-generation-postgres.test.js')], {
      stdio: 'inherit', env: { ...process.env, LEREN_QUESTION_PG_TEST_CONFIG: JSON.stringify({ name, port, password }) },
    });
    process.exitCode = result.status ?? 1;
  } catch (error) {
    // Do not print command arguments/environment or Docker's possibly sensitive error object.
    console.error('Local question-generation integration runner failed:', error.code || error.name);
    process.exitCode = 1;
  } finally {
    if (created) {
      const [container] = JSON.parse(docker(['inspect', name]));
      if (container.Config.Labels['codex.purpose'] === 'leren-question-generation-integration') docker(['rm', '-f', name]);
    }
  }
})();
