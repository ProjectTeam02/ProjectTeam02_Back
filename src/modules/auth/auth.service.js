/**
 * 인증 비즈니스 로직
 * 백엔드 작업: 유스케이스 흐름과 기존 정책을 유지
 * 주의: DB는 Repository, 외부 통신은 Client를 사용한다.
 */
const crypto = require('node:crypto');
const { User, UserGrowth, UserSetting } = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const env = require('../../config/env');
const AppError = require('../../common/errors/AppError');
const { hashPassword, verifyPassword } = require('../../common/utils/password.util');
const { hashToken, issueAccessToken, issueRefreshToken, verifyRefreshToken } = require('../../common/utils/token.util');
const sessionRepository = require('./repositories/session.repository');

function publicUser(user, growth = null) {
  return {
    userId: user.userId || user.id, nickname: user.nickname, email: user.email,
    level: growth?.totalLevel ?? 1, totalExp: growth?.totalExp ?? 0,
    economyLevel: growth?.economyLevel ?? 1, economyExp: growth?.economyExp ?? 0,
    plan: user.plan || 'FREE',
  };
}

function isUniqueViolation(error) { return error?.code === '23505' || error?.driverError?.code === '23505'; }

function service(dataSource = AppDataSource, kakaoClient = null) {
  const sessions = sessionRepository(dataSource);
  const transaction = (callback) => dataSource.transaction(callback);

  async function growthFor(userId, manager = dataSource.manager) {
    return manager.getRepository(UserGrowth).findOneBy({ userId });
  }

  async function issueTokens(user, loginMethod = 'EMAIL', manager = dataSource.manager) {
    const sessionId = crypto.randomUUID();
    const refreshToken = issueRefreshToken(user, sessionId);
    await sessions.create({ sessionId, userId: user.userId, refreshTokenHash: hashToken(refreshToken), loginMethod,
      expiresAt: new Date(Date.now() + env.refreshTokenTtlSeconds * 1000) }, manager);
    return { accessToken: issueAccessToken(user, sessionId), refreshToken };
  }

  async function ensureUserRows(manager, user) {
    const growthRepo = manager.getRepository(UserGrowth);
    const settingRepo = manager.getRepository(UserSetting);
    if (!await growthRepo.findOneBy({ userId: user.userId })) await growthRepo.save(growthRepo.create({ userId: user.userId }));
    if (!await settingRepo.findOneBy({ userId: user.userId })) await settingRepo.save(settingRepo.create({ userId: user.userId }));
  }

  return {
    async signup({ email, password, nickname }) {
      try {
        return await transaction(async (manager) => {
          const userRepo = manager.getRepository(User);
          if (await userRepo.findOneBy({ email })) throw AppError.conflict('이미 가입된 이메일입니다.');
          const user = await userRepo.save(userRepo.create({ email, nickname, passwordHash: hashPassword(password) }));
          await ensureUserRows(manager, user);
          return { user: publicUser(user, await growthFor(user.userId, manager)), ...(await issueTokens(user, 'EMAIL', manager)) };
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (isUniqueViolation(error)) throw AppError.conflict('이미 가입된 이메일입니다.');
        throw error;
      }
    },
    async login({ email, password }) {
      const userRepo = dataSource.getRepository(User);
      const user = await userRepo.findOneBy({ email });
      if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) throw AppError.unauthorized('이메일 또는 비밀번호가 올바르지 않습니다.');
      if (user.accountStatus !== 'ACTIVE') throw AppError.forbidden('정지된 계정입니다.');
      user.failedLoginCount = 0; user.lastLoginAt = new Date(); user.lastLoginMethod = 'EMAIL';
      await userRepo.save(user); await ensureUserRows(dataSource.manager, user);
      return { user: publicUser(user, await growthFor(user.userId)), ...(await issueTokens(user, 'EMAIL')) };
    },
    async refresh(refreshToken) {
      let payload;
      try { payload = verifyRefreshToken(refreshToken); } catch (_error) { throw AppError.unauthorized('유효하지 않은 Refresh Token입니다.'); }
      const session = await sessions.findActive(payload.sid, payload.sub);
      if (!session || session.refreshTokenHash !== hashToken(refreshToken)) throw AppError.unauthorized('Refresh Token이 만료되었거나 폐기되었습니다.');
      return transaction(async (manager) => {
        await sessions.revoke(session.sessionId, 'ROTATED', manager);
        const user = await manager.getRepository(User).findOneBy({ userId: payload.sub });
        if (!user || user.accountStatus !== 'ACTIVE') throw AppError.unauthorized();
        await ensureUserRows(manager, user);
        return { user: publicUser(user, await growthFor(user.userId, manager)), ...(await issueTokens(user, 'EMAIL', manager)) };
      });
    },
    async logout(userId) { await sessions.revokeAll(userId); return { loggedOut: true }; },
    async kakao(accessToken) {
      if (!kakaoClient) throw AppError.unavailable('Kakao OAuth가 설정되지 않았습니다.');
      const profile = await kakaoClient.getProfile(accessToken);
      if (!profile?.id) throw AppError.unauthorized('Kakao 사용자 검증에 실패했습니다.');
      const email = profile.kakao_account?.email || `kakao-${profile.id}@local.invalid`;
      const nickname = profile.kakao_account?.profile?.nickname || `kakao-${profile.id}`;
      return transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        let user = await userRepo.findOneBy({ email });
        if (!user) user = await userRepo.save(userRepo.create({ email, nickname, lastLoginMethod: 'KAKAO' }));
        else { user.nickname = nickname; user.lastLoginMethod = 'KAKAO'; user.lastLoginAt = new Date(); user = await userRepo.save(user); }
        await ensureUserRows(manager, user);
        return { user: publicUser(user, await growthFor(user.userId, manager)), ...(await issueTokens(user, 'KAKAO', manager)) };
      });
    },
  };
}

module.exports = service;
module.exports.publicUser = publicUser;
