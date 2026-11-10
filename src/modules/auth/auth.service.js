/**
 * 인증 비즈니스 로직
 * 백엔드 작업: 유스케이스 흐름과 기존 정책을 유지
 * 주의: DB는 Repository, 외부 통신은 Client를 사용한다.
 */
const crypto = require('node:crypto');
const { User, UserGrowth, UserSetting, SocialAccount } = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const env = require('../../config/env');
const AppError = require('../../common/errors/AppError');
const { hashPassword, verifyPassword } = require('../../common/utils/password.util');
const { hashToken, issueAccessToken, issueRefreshToken, verifyRefreshToken } = require('../../common/utils/token.util');
const sessionRepository = require('./repositories/session.repository');
const authSchema = require('./auth.schema');
const loginResponse = require('./dto/loginResponse.dto');

const publicUser = (user, growth = null) => loginResponse.user(user, growth);

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
          return loginResponse.session({ user, growth: await growthFor(user.userId, manager), issued: await issueTokens(user, 'EMAIL', manager) });
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
      return loginResponse.session({ user, growth: await growthFor(user.userId), issued: await issueTokens(user, 'EMAIL') });
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
        return loginResponse.session({ user, growth: await growthFor(user.userId, manager), issued: await issueTokens(user, session.loginMethod || 'EMAIL', manager) });
      });
    },
    async logout(userId) { await sessions.revokeAll(userId); return { loggedOut: true }; },
    async logoutByRefreshToken(refreshToken) {
      let payload;
      try { payload = verifyRefreshToken(refreshToken); } catch (_error) { throw AppError.unauthorized('유효하지 않은 Refresh Token입니다.'); }
      const session = await sessions.findActive(payload.sid, payload.sub);
      if (!session || session.refreshTokenHash !== hashToken(refreshToken)) throw AppError.unauthorized('Refresh Token이 만료되었거나 폐기되었습니다.');
      await sessions.revoke(session.sessionId, 'LOGOUT');
      return { loggedOut: true };
    },
    async kakao(input) {
      if (!['development', 'test'].includes(env.nodeEnv) || !env.kakaoLegacyDirectLoginEnabled) {
        throw AppError.forbidden('카카오 로그인은 start/callback/exchange 흐름을 사용하세요.');
      }
      return this.prepareKakaoLogin(input, true);
    },
    async completeKakaoLogin({ userId, providerUserId, isNewUser }) {
      return transaction(async (manager) => {
        const userRepo = manager.getRepository(User);
        const social = await manager.getRepository(SocialAccount).findOne({
          where: { provider: 'KAKAO', providerUserId, userId }, lock: { mode: 'pessimistic_write' },
        });
        const user = await userRepo.findOne({
          where: { userId }, lock: { mode: 'pessimistic_write' },
        });
        if (!social || social.disconnectedAt || !user || user.accountStatus !== 'ACTIVE') {
          throw AppError.forbidden('로그인할 수 없는 계정입니다.');
        }
        user.failedLoginCount = 0;
        user.lastLoginAt = new Date();
        user.lastLoginMethod = 'KAKAO';
        await userRepo.save(user);
        return loginResponse.session({ user, growth: await growthFor(userId, manager), isNewUser,
          issued: await issueTokens(user, 'KAKAO', manager) });
      });
    },
    async prepareKakaoLogin(input, issueSession = false) {
      const { authorizationCode, redirectUri } = authSchema.kakao({ body: input }).body;
      if (!kakaoClient) throw AppError.unavailable('Kakao OAuth가 설정되지 않았습니다.');
      const token = await kakaoClient.getAccessToken(authorizationCode, redirectUri);
      if (typeof token?.access_token !== 'string' || !token.access_token.trim()) {
        throw AppError.unavailable('Kakao 토큰 발급 응답이 올바르지 않습니다.');
      }
      const profile = await kakaoClient.getProfile(token.access_token);
      const id = profile?.id;
      if (!((typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
        || (typeof id === 'string' && /^[1-9]\d*$/.test(id) && id.length <= 255))) {
        throw AppError.unavailable('Kakao 사용자 검증에 실패했습니다.');
      }
      const providerUserId = String(id);
      const providerEmail = typeof profile.kakao_account?.email === 'string'
        ? profile.kakao_account.email.slice(0, 255) : null;
      const providerNickname = typeof profile.kakao_account?.profile?.nickname === 'string'
        ? profile.kakao_account.profile.nickname.trim().slice(0, 100) : null;

      const persistLogin = () => transaction(async (manager) => {
        const socialRepo = manager.getRepository(SocialAccount);
        const userRepo = manager.getRepository(User);
        let social = await socialRepo.findOne({
          where: { provider: 'KAKAO', providerUserId }, lock: { mode: 'pessimistic_write' },
        });
        const isNewUser = !social;
        let user;
        if (social) {
          if (social.disconnectedAt) throw AppError.forbidden('연결 해제된 소셜 계정입니다.');
          user = await userRepo.findOne({ where: { userId: social.userId }, lock: { mode: 'pessimistic_write' } });
          if (!user || user.accountStatus !== 'ACTIVE') throw AppError.forbidden('로그인할 수 없는 계정입니다.');
        } else {
          // 이메일은 계정 식별/자동 연결에 사용하지 않는다. 소셜 전용 회원의 이메일은 null이다.
          user = await userRepo.save(userRepo.create({
            email: null, passwordHash: null, nickname: (providerNickname || '카카오 사용자').slice(0, 30),
            accountStatus: 'ACTIVE', lastLoginMethod: 'KAKAO',
          }));
          social = socialRepo.create({ provider: 'KAKAO', providerUserId, userId: user.userId });
        }
        if (issueSession) {
          user.failedLoginCount = 0;
          user.lastLoginAt = new Date();
          user.lastLoginMethod = 'KAKAO';
          await userRepo.save(user);
        }
        Object.assign(social, { providerEmail, providerNickname, lastUsedAt: new Date() });
        await socialRepo.save(social);
        await ensureUserRows(manager, user);
        if (!issueSession) return { userId: user.userId, providerUserId, isNewUser };
        return loginResponse.session({ user, growth: await growthFor(user.userId, manager), isNewUser,
          issued: await issueTokens(user, 'KAKAO', manager) });
      });
      try {
        return await persistLogin();
      } catch (error) {
        // 동시 최초 로그인 충돌은 롤백 후 DB 처리만 한 번 재실행한다. 인가 코드는 재사용하지 않는다.
        if (isUniqueViolation(error)
          && (error.constraint || error.driverError?.constraint) === 'social_accounts_provider_provider_user_id_idx') {
          return persistLogin();
        }
        throw error;
      }
    },
  };
}

module.exports = service;
module.exports.publicUser = publicUser;
