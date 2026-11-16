/** 검사 명령이 원격 설정을 거부하고, 쿼리 실패 후에도 롤백·해제하는지 확인합니다. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { assertLocalCheck, checkQuizRewardSeed } = require('../scripts/check-quiz-reward-seed');

test('격리된 루프백 DB를 명시한 경우만 허용한다', () => {
  const env = { LEREN_LOCAL_SEED_CHECK: '1', DB_HOST: '127.0.0.1', DB_PORT: '5432', DB_NAME: 'leren_it' };
  assert.doesNotThrow(() => assertLocalCheck(env));
  for (const overrides of [{ LEREN_LOCAL_SEED_CHECK: '' }, { DB_HOST: 'example.test' }, { DB_PORT: '65536' }, { DB_NAME: '' }]) {
    assert.throws(() => assertLocalCheck({ ...env, ...overrides }));
  }
});

test('권한·SQL 오류가 나면 활성 읽기 전용 트랜잭션을 정리한다', async () => {
  const trace = [];
  const runner = {
    isTransactionActive: false,
    async connect() {},
    async startTransaction() { this.isTransactionActive = true; },
    async query(sql) {
      if (sql === 'SET TRANSACTION READ ONLY') { trace.push('readonly'); return; }
      throw new Error('database error');
    },
    async rollbackTransaction() { trace.push('rollback'); this.isTransactionActive = false; },
    async release() { trace.push('release'); },
  };
  await assert.rejects(checkQuizRewardSeed({ createQueryRunner: () => runner }), /database error/);
  assert.deepEqual(trace, ['readonly', 'rollback', 'release']);
});
