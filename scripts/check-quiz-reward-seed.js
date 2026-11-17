/** 최초 Stage 통과 전에 격리 로컬 DB의 레벨 기준 데이터가 준비됐는지 확인합니다. */
const SQL = `
  SELECT expected.scope, EXISTS (
    SELECT 1 FROM reward.level_thresholds t
    WHERE t.scope::text = expected.scope AND t.level = 1 AND t.required_exp = 0
  ) AS ready
  FROM (VALUES ('ACCOUNT'), ('ECONOMY')) AS expected(scope)
  ORDER BY expected.scope
`;

/** 기존 기준표의 레벨 1 / 0 EXP 행만 검사하고 데이터는 수정하지 않습니다. */
async function checkQuizRewardSeed(dataSource) {
  const runner = dataSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    await runner.query('SET TRANSACTION READ ONLY');
    const scopes = await runner.query(SQL);
    return { ready: scopes.every(scope => scope.ready), scopes };
  } finally {
    try { if (runner.isTransactionActive) await runner.rollbackTransaction(); }
    finally { await runner.release(); }
  }
}

/** .env에 우연히 있는 원격 DB로 요청하지 않도록 명시적인 로컬 설정을 먼저 확인합니다. */
function assertLocalCheck(env) {
  if (env.LEREN_LOCAL_SEED_CHECK !== '1' || !['127.0.0.1', '::1'].includes(env.DB_HOST)
    || !env.DB_NAME || !/^[1-9][0-9]{0,4}$/.test(env.DB_PORT ?? '') || Number(env.DB_PORT) > 65535) {
    throw new Error('격리 DB의 숫자 loopback 주소·포트·이름과 LEREN_LOCAL_SEED_CHECK=1을 지정하세요.');
  }
}

async function main() {
  try { assertLocalCheck(process.env); }
  catch (error) { console.error(error.message); process.exitCode = 2; return; }
  let dataSource;
  try {
    ({ AppDataSource: dataSource } = require('@leren/database'));
    await dataSource.initialize();
    const result = await checkQuizRewardSeed(dataSource);
    console.log(JSON.stringify(result));
    if (!result.ready) {
      console.error('누락된 레벨 1 기준을 확인하세요: database/sql/seed/01_master_data.sql');
      process.exitCode = 1;
    }
  } catch {
    // 접속 문자열이나 드라이버 오류에 포함될 수 있는 환경 값은 출력하지 않습니다.
    console.error('DB 접속·마이그레이션·읽기 권한 또는 DB 패키지 빌드를 확인하세요.');
    process.exitCode = 2;
  } finally {
    try { if (dataSource?.isInitialized) await dataSource.destroy(); }
    catch { console.error('DB 연결을 정상적으로 정리하지 못했습니다.'); process.exitCode = 2; }
  }
}

if (require.main === module) void main();
module.exports = { assertLocalCheck, checkQuizRewardSeed };
