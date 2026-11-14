const crypto = require('node:crypto');
const { KakaoOAuthEntry } = require('@leren/database');
const AppError = require('../../common/errors/AppError');
const { digest } = require('./kakao-oauth.store');

const CLEANUP_INTERVAL_MS = 60_000;
const CLEANUP_BATCH_SIZE = 1_000;

class PostgresOAuthStore {
  constructor(dataSource) {
    this.dataSource = dataSource;
    this.nextCleanupAt = 0;
  }

  async put(kind, value, ttlSeconds) {
    const token = crypto.randomBytes(32).toString('base64url');
    return this.withDatabase(async () => {
      await this.pruneExpired();
      await this.dataSource.createQueryBuilder()
        .insert()
        .into(KakaoOAuthEntry)
        .values({
          kind,
          tokenHash: digest(token),
          payload: value,
          expiresAt: () => "statement_timestamp() + CAST(:ttl AS integer) * interval '1 second'",
        })
        .setParameter('ttl', ttlSeconds)
        .execute();
      return token;
    });
  }

  async consume(kind, token, verify = () => true) {
    const key = { kind, tokenHash: digest(token) };
    return this.withDatabase(() => this.dataSource.transaction('READ COMMITTED', async manager => {
      const entries = manager.getRepository(KakaoOAuthEntry);
      const entry = await entries.createQueryBuilder('entry')
        .where(key)
        .andWhere('entry.expires_at > statement_timestamp()')
        .setLock('pessimistic_write')
        .getOne();

      if (!entry || !verify(entry.payload)) return null;

      // Check the DB clock again after any lock wait and before consuming the row.
      const deletion = await entries.createQueryBuilder()
        .delete()
        .where(key)
        .andWhere('"expires_at" > clock_timestamp()')
        .execute();
      return deletion.affected === 1 ? entry.payload : null;
    }));
  }

  async pruneExpired() {
    const now = Date.now();
    if (now < this.nextCleanupAt) return;
    this.nextCleanupAt = now + CLEANUP_INTERVAL_MS;
    // Bound each batch and skip rows being processed by another instance.
    const [{ removed }] = await this.dataSource.query(`
      WITH expired AS (
        SELECT kind, token_hash FROM account.kakao_oauth_entries
        WHERE expires_at <= statement_timestamp()
        ORDER BY expires_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      ), deleted AS (
        DELETE FROM account.kakao_oauth_entries AS entry USING expired
        WHERE entry.kind = expired.kind AND entry.token_hash = expired.token_hash
        RETURNING 1
      )
      SELECT count(*)::int AS removed FROM deleted
    `, [CLEANUP_BATCH_SIZE]);
    if (removed === CLEANUP_BATCH_SIZE) this.nextCleanupAt = 0;
  }

  async withDatabase(operation) {
    if (!this.dataSource.isInitialized) {
      throw AppError.unavailable('OAuth 상태 저장소에 연결할 수 없습니다.');
    }
    try {
      return await operation();
    } catch (error) {
      const code = error.driverError?.code ?? error.code;
      if (code === '42P01' || code === '42703') {
        throw AppError.unavailable('OAuth 상태 저장소 마이그레이션이 적용되지 않았습니다.');
      }
      throw AppError.unavailable('OAuth 상태 저장소에 연결할 수 없습니다.');
    }
  }
}

module.exports = { PostgresOAuthStore };
