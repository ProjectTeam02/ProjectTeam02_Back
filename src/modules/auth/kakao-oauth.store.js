const crypto = require('node:crypto');
const AppError = require('../../common/errors/AppError');

const digest = value => crypto.createHash('sha256').update(value).digest('hex');

// Development/test only. No await between verification and removal: one process consumes atomically.
class MemoryOAuthStore {
  constructor({ now = Date.now, maxEntries = 10000 } = {}) {
    this.now = now;
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  put(kind, value, ttlSeconds) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= this.now()) this.entries.delete(key);
    }
    if (this.entries.size >= this.maxEntries) throw AppError.unavailable('로그인 요청이 많습니다. 잠시 후 다시 시도하세요.');
    let token;
    let key;
    do {
      token = crypto.randomBytes(32).toString('base64url');
      key = `${kind}:${digest(token)}`;
    } while (this.entries.has(key));
    this.entries.set(key, { value: structuredClone(value), expiresAt: this.now() + ttlSeconds * 1000 });
    return token;
  }

  consume(kind, token, verify = () => true) {
    const key = `${kind}:${digest(token)}`;
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) { this.entries.delete(key); return null; }
    if (!verify(entry.value)) return null;
    this.entries.delete(key);
    return structuredClone(entry.value);
  }
}

module.exports = { MemoryOAuthStore, digest };
