const crypto = require('node:crypto');
const prismaDefault = require('../../config/prisma');
const env = require('../../config/env');
const AppError = require('../../common/errors/AppError');
const { hashPassword, verifyPassword } = require('../../common/utils/password.util');
const { hashToken, issueAccessToken, issueRefreshToken, verifyRefreshToken } = require('../../common/utils/token.util');
const sessionRepository = require('./repositories/session.repository');

function publicUser(user, growth = null) {
  return {
    userId: user.id, nickname: user.nickname, email: user.email,
    level: growth?.level ?? 1, totalExp: growth?.totalExp ?? 0,
    economyLevel: growth?.economyLevel ?? 1, economyExp: growth?.economyExp ?? 0,
    plan: growth?.plan ?? 'FREE',
  };
}

function service(db = prismaDefault, kakaoClient = null) {
  const sessions = sessionRepository(db);
  async function issueTokens(user) {
    const sessionId = crypto.randomUUID();
    const refreshToken = issueRefreshToken(user, sessionId);
    await sessions.create({ id: sessionId, userId: user.id, refreshTokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + env.refreshTokenTtlSeconds * 1000) });
    return { accessToken: issueAccessToken(user, sessionId), refreshToken };
  }
  return {
    async signup({ email, password, nickname }) {
      if (await db.user.findUnique({ where: { email } })) throw AppError.conflict('이미 가입된 이메일입니다.');
      const user = await db.user.create({ data: { email, nickname, passwordHash: hashPassword(password), growth: { create: {} }, notificationSetting: { create: {} } }, include: { growth: true } });
      return { user: publicUser(user, user.growth), ...(await issueTokens(user)) };
    },
    async login({ email, password }) {
      const user = await db.user.findUnique({ where: { email }, include: { growth: true } });
      if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) throw AppError.unauthorized('이메일 또는 비밀번호가 올바르지 않습니다.');
      if (user.status !== 'ACTIVE') throw AppError.forbidden('정지된 계정입니다.');
      return { user: publicUser(user, user.growth), ...(await issueTokens(user)) };
    },
    async refresh(refreshToken) {
      let payload;
      try { payload = verifyRefreshToken(refreshToken); } catch (_error) { throw AppError.unauthorized('유효하지 않은 Refresh Token입니다.'); }
      const session = await sessions.findActive(payload.sid);
      if (!session || session.refreshTokenHash !== hashToken(refreshToken) || session.expiresAt <= new Date()) throw AppError.unauthorized('Refresh Token이 만료되었거나 폐기되었습니다.');
      await sessions.revoke(session.id);
      const user = await db.user.findUnique({ where: { id: payload.sub }, include: { growth: true } });
      if (!user || user.status !== 'ACTIVE') throw AppError.unauthorized();
      return { user: publicUser(user, user.growth), ...(await issueTokens(user)) };
    },
    async logout(userId) { await sessions.revokeAll(userId); return { loggedOut: true }; },
    async kakao(accessToken) {
      if (!kakaoClient) throw AppError.unavailable('Kakao OAuth가 설정되지 않았습니다.');
      const profile = await kakaoClient.getProfile(accessToken);
      if (!profile?.id) throw AppError.unauthorized('Kakao 사용자 검증에 실패했습니다.');
      const email = profile.kakao_account?.email || `kakao-${profile.id}@local.invalid`;
      const nickname = profile.kakao_account?.profile?.nickname || `kakao-${profile.id}`;
      const user = await db.user.upsert({ where: { email }, update: { nickname }, create: { email, nickname, growth: { create: {} }, notificationSetting: { create: {} } }, include: { growth: true } });
      return { user: publicUser(user, user.growth), ...(await issueTokens(user)) };
    },
  };
}

module.exports = service;
module.exports.publicUser = publicUser;
