
/**
 * 복습 API 전용 PostgreSQL 통합 테스트 실행기.
 *
 * 1. 임시 PostgreSQL Docker 컨테이너 생성
 * 2. 테스트 DB 스키마 및 마이그레이션 적용
 * 3. 복습 API PostgreSQL 통합 테스트 실행
 * 4. 테스트 종료 후 임시 컨테이너 삭제
 *
 * 운영 DB에는 연결하지 않는다.
 */

const { execFileSync, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const { AppDataSource: db } = require('@leren/database');

// Windows Docker Desktop의 기본 Docker 연결 사용
const dockerEnv = { ...process.env };

for (const key of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
]) {
  delete dockerEnv[key];
}

const docker = args => execFileSync('docker', args, {
  env: dockerEnv,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

// 임시 테스트 컨테이너 설정
const name = `leren-review-it-${randomBytes(4).toString('hex')}`;
const password = randomBytes(24).toString('hex');
const database = 'leren_review_it';
const label = 'leren-review-integration';

let created = false;
let stage = '초기화';

// 오류 출력 시 DB 비밀번호 숨기기
function safeMessage(error) {
  return String(
    error?.message || error?.code || error?.name || 'Unknown error'
  ).replaceAll(password, '[REDACTED]');
}

(async () => {
  try {
    // 1. Docker 서버 연결 확인
    stage = 'Docker 연결 확인';

    docker([
      'info',
      '--format',
      '{{.ServerVersion}}',
    ]);

    // 2. PostgreSQL 이미지 준비
    stage = 'PostgreSQL 이미지 준비';

    docker(['pull', 'postgres:18']);

    // 3. 임시 PostgreSQL 컨테이너 생성
    stage = 'PostgreSQL 컨테이너 생성';

    execFileSync('docker', [
      'run',
      '-d',
      '--rm',
      '--name', name,
      '--label', `codex.purpose=${label}`,
      '--tmpfs', '/var/lib/postgresql:rw',
      '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_PASSWORD',
      '-e', `POSTGRES_DB=${database}`,
      'postgres:18',
    ], {
      env: {
        ...dockerEnv,
        POSTGRES_PASSWORD: password,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    created = true;

    // 4. PostgreSQL TCP 연결 준비 확인
    stage = 'PostgreSQL 준비 대기';

    let ready = false;

    for (let i = 0; i < 100; i++) {
      try {
        docker([
          'exec',
          name,
          'pg_isready',
          '-h', '127.0.0.1',
          '-U', 'postgres',
          '-d', database,
        ]);

        ready = true;
        break;
      } catch (_) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    if (!ready) {
      throw new Error('PostgreSQL TCP server not ready');
    }

    // 5. 컨테이너 정보 확인
    stage = 'Docker 컨테이너 검증';

    const [container] = JSON.parse(
      docker(['inspect', name])
    );

    if (container.Config.Labels['codex.purpose'] !== label) {
      throw new Error('Unexpected container label');
    }

    if (container.HostConfig.AutoRemove !== true) {
      throw new Error('Container auto-remove is not enabled');
    }

    const bindings =
      container.NetworkSettings.Ports['5432/tcp'];

    if (!bindings || bindings.length !== 1) {
      throw new Error('Unexpected PostgreSQL port binding');
    }

    const binding = bindings[0];

    if (binding.HostIp !== '127.0.0.1') {
      throw new Error('Database is not loopback-bound');
    }

    const port = Number(binding.HostPort);

    if (!Number.isInteger(port) || port <= 0) {
      throw new Error('Invalid PostgreSQL port');
    }

    // 6. 임시 PostgreSQL DB 연결
    stage = 'PostgreSQL DB 연결';

    db.setOptions({
      host: '127.0.0.1',
      port,
      username: 'postgres',
      password,
      database,
      ssl: false,
      synchronize: false,
      migrationsRun: false,
      logging: false,
      migrations: [
        path.resolve(
          __dirname,
          '../database/dist/migrations/*.js'
        ),
      ],
      extra: {
        options:
          '-c search_path=app,account,character,content,learning,reward,review,tutor,public',
      },
    });

    await db.initialize();

    // 7. 테스트 DB 연결 여부 재확인
    stage = '테스트 DB 이름 검증';

    const current = await db.query(
      'SELECT current_database() AS name'
    );

    if (current[0].name !== database) {
      throw new Error('Unexpected database');
    }

    // 8. PostgreSQL 스키마 초기화
    stage = 'DB 스키마 초기화';

    const schemaSql = await readFile(
      path.resolve(
        __dirname,
        '../database/sql/init/01_app_schema.sql'
      ),
      'utf8'
    );

    await db.query(schemaSql);

    // 9. DB 마이그레이션 실행
    stage = 'DB 마이그레이션';

    await db.runMigrations();

    if (await db.showMigrations()) {
      throw new Error('Pending database migrations');
    }

    // 실행기에서 사용한 DB 연결 종료
    await db.destroy();

    // 10. 복습 API 통합 테스트 실행
    stage = '복습 API 통합 테스트';

    console.log('PostgreSQL 테스트 DB 준비 완료');
    console.log('복습 API 통합 테스트 시작');

    const result = spawnSync(
      process.execPath,
      [
        '--test',
        path.resolve(
          __dirname,
          '../test/integration/wrong-answer-collection-postgres.test.js'
        ),
      ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          LEREN_EXTENDED_API_PG_TEST_CONFIG: JSON.stringify({
            port,
            database,
            username: 'postgres',
            password,
          }),
        },
      }
    );

    if (result.error) {
      throw result.error;
    }

    process.exitCode = result.status ?? 1;

  } catch (error) {
    console.error(`[실패 단계] ${stage}`);

    console.error(
      'Local review integration runner failed:',
      safeMessage(error)
    );

    process.exitCode = 1;

  } finally {
    // 11. DB 연결 정리
    if (db.isInitialized) {
      try {
        await db.destroy();
      } catch (error) {
        console.error(
          'DB 연결 종료 실패:',
          safeMessage(error)
        );

        process.exitCode = 1;
      }
    }

    // 12. 임시 Docker 컨테이너 삭제
    if (created) {
      try {
        const [container] = JSON.parse(
          docker(['inspect', name])
        );

        if (
          container.Config.Labels['codex.purpose'] === label
        ) {
          docker(['rm', '-f', name]);

          console.log(
            '임시 PostgreSQL 컨테이너 정리 완료'
          );
        } else {
          console.error(
            '컨테이너 라벨 불일치로 삭제하지 않음:',
            name
          );

          process.exitCode = 1;
        }
      } catch (error) {
        console.error(
          'Temporary container cleanup failed:',
          name,
          safeMessage(error)
        );

        process.exitCode = 1;
      }
    }
  }
})();
