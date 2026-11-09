const { fork } = require('node:child_process');

async function startOAuthProcess(options) {
  const child = fork(__filename, ['--oauth-worker'], { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const exited = new Promise(resolve => child.once('close', resolve));
  async function close() {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  }

  try {
    const base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('OAuth test process startup timed out')), 10_000);
      exited.then(() => reject(new Error('OAuth test process exited before startup')));
      child.once('error', reject);
      child.once('message', message => {
        if (message.base) resolve(message.base);
        else reject(new Error('OAuth test process failed to start'));
      });
      child.send(options);
      exited.then(() => clearTimeout(timeout));
      child.once('message', () => clearTimeout(timeout));
    });
    return { base, pid: child.pid, close };
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[2] === '--oauth-worker' && process.send) {
  process.once('disconnect', () => process.exit(0));
  process.once('message', async ({ db, config, providerUserId }) => {
    try {
      if (db.host !== '127.0.0.1' || db.database !== 'leren_kakao_it' || db.username !== 'kakao_it_app') {
        throw new Error('Isolated test database required');
      }
      const { AppDataSource } = require('@leren/database');
      const KakaoClient = require('../../src/clients/kakao.client');
      const env = require('../../src/config/env');
      AppDataSource.setOptions({
        ...db, ssl: false, synchronize: false, migrationsRun: false, logging: false,
        extra: { application_name: 'leren-kakao-oauth-worker' },
      });
      Object.assign(env, config);
      KakaoClient.prototype.getAccessToken = async () => ({ access_token: 'isolated-test-token' });
      KakaoClient.prototype.getProfile = async () => ({ id: providerUserId });
      await AppDataSource.initialize();
      const app = require('../../src/app');
      const server = await require('./listen-test-server')(app);
      process.send({ base: `http://127.0.0.1:${server.address().port}` });
    } catch {
      process.send({ failed: true });
    }
  });
}

module.exports = startOAuthProcess;
