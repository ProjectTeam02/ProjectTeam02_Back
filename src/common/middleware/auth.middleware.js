/**
 * 사용자 인증 미들웨어
 * 백엔드 작업: JWT와 활성 세션을 검증
 * 주의: 기존 인증 정책과 오류 코드를 유지한다.
 */
const AppError = require('../errors/AppError');
const { verifyAccessToken } = require('../utils/token.util');
const { AppDataSource } = require('../../config/database');
const { UserSession } = require('@leren/database');
const { IsNull, MoreThan } = require('typeorm');

module.exports = function authMiddleware(req, _res, next) {
  const authorization = req.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return next(AppError.unauthorized());
  }
  Promise.resolve()
    .then(() => verifyAccessToken(authorization.slice(7).trim()))
    .then(async (payload) => {
      if (!payload.sid) throw AppError.unauthorized('세션 정보가 없는 Access Token입니다.');
      const session = await AppDataSource.getRepository(UserSession).findOne({
        where: { sessionId: payload.sid, userId: payload.sub, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      });
      if (!session) throw AppError.unauthorized('로그아웃되었거나 만료된 세션입니다.');
      req.user = payload;
      next();
    })
    .catch((error) => {
      if (error instanceof AppError) return next(error);
      if (['ECONNREFUSED', '57P01', '28P01'].includes(error?.code) || error?.name === 'QueryFailedError') {
        return next(AppError.unavailable('데이터베이스를 사용할 수 없습니다.'));
      }
      return next(AppError.unauthorized('유효하지 않거나 만료된 Access Token입니다.'));
    });
};
