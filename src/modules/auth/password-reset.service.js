/** 이메일 발송 예약과 토큰 사용을 기존 계정·세션 트랜잭션에 연결한다. */
const { randomBytes } = require('node:crypto');
const { User } = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const { hashPassword } = require('../../common/utils/password.util');
const { hashToken } = require('../../common/utils/token.util');
const resetTokens = require('./repositories/passwordReset.repository');
const sessionRepository = require('./repositories/session.repository');
const delivery = require('./password-reset.delivery');

const minute = 60_000;
const lifetime = 30 * minute;
const hourlyLimit = 3;
const rejected = () => AppError.unauthorized('유효하지 않거나 만료된 재설정 토큰입니다.');
const eligible = (user, email) => user?.accountStatus === 'ACTIVE' && Boolean(user.passwordHash) && user.email === email;
const lockUser = (manager, where) => manager.getRepository(User).findOne({ where, lock: { mode: 'for_no_key_update' } });

function service(dataSource = AppDataSource) {
  const sessions = sessionRepository(dataSource);

  async function deliver(send, row, raw) {
    try {
      await send({ email: row.targetEmail, token: raw });
    } catch {
      console.warn('password_reset_delivery_failed');
      await resetTokens(dataSource.manager).discard(row.tokenId, new Date());
      return;
    }

    await dataSource.transaction(async manager => {
      const user = await lockUser(manager, { userId: row.userId });
      const tokens = resetTokens(manager);
      const pending = await tokens.byId(row.userId, row.tokenId);
      const now = new Date();
      if (!eligible(user, row.targetEmail) || !pending || pending.usedAt || pending.expiresAt <= now) return;
      await tokens.revokeOlder(pending, now);
      await tokens.recordSent(row.tokenId, now);
    });
  }

  return {
    async request(email) {
      const send = delivery.create();
      if (!send) throw AppError.unavailable('비밀번호 재설정 메일을 지금 보낼 수 없습니다.');

      const raw = randomBytes(32).toString('base64url');
      const pending = await dataSource.transaction(async manager => {
        const user = await lockUser(manager, { email });
        if (!eligible(user, email)) return null;
        const tokens = resetTokens(manager);
        const now = Date.now();
        const attempts = await tokens.recentAttempts(user.userId, new Date(now - 60 * minute), hourlyLimit);
        if (attempts.length >= hourlyLimit || attempts[0]?.createdAt.getTime() > now - minute) return null;
        return tokens.reserve({ userId: user.userId, targetEmail: email, tokenHash: hashToken(raw), expiresAt: new Date(now + lifetime) });
      });

      // HTTP 요청의 응답 시간에 SMTP 처리 시간을 포함하지 않는다.
      if (pending) void deliver(send, pending, raw).catch(() => console.warn('password_reset_delivery_state_failed'));
      return { accepted: true };
    },

    async confirm(raw, newPassword) {
      const tokenHash = hashToken(raw);
      return dataSource.transaction(async manager => {
        const tokens = resetTokens(manager);
        const candidate = await tokens.byHash(tokenHash);
        if (!candidate) throw rejected();
        // 토큰 상태를 다시 읽기 전에 로그인·Refresh와 같은 순서로 사용자 행을 잠근다.
        const user = await lockUser(manager, { userId: candidate.userId });
        const row = await tokens.byId(candidate.userId, candidate.tokenId);
        const now = new Date();
        if (!row || !eligible(user, row.targetEmail) || row.usedAt || row.expiresAt <= now || row.sendCount < 1) throw rejected();
        await manager.getRepository(User).update({ userId: user.userId }, { passwordHash: hashPassword(newPassword), passwordChangedAt: now });
        await tokens.revokeAll(user.userId, now);
        await sessions.revokeAll(user.userId, manager, 'SECURITY');
        return { reset: true };
      });
    },
  };
}

module.exports = service;
