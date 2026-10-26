const AppError = require('../errors/AppError');
const { verifyAccessToken } = require('../utils/token.util');
const prisma = require('../../config/prisma');

module.exports = function authMiddleware(req, _res, next) {
  const authorization = req.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return next(AppError.unauthorized());
  }
  Promise.resolve()
    .then(() => verifyAccessToken(authorization.slice(7).trim()))
    .then(async (payload) => {
      if (!payload.sid) throw AppError.unauthorized('세션 정보가 없는 Access Token입니다.');
      const session = await prisma.authSession.findFirst({
        where: {
          id: payload.sid,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!session) throw AppError.unauthorized('로그아웃되었거나 만료된 세션입니다.');
      req.user = payload;
      next();
    })
    .catch((error) => {
      if (error instanceof AppError) return next(error);
      if (error?.name?.startsWith('PrismaClient') || ['P1000', 'P1001', 'P1002', 'P1008'].includes(error?.code)) {
        return next(AppError.unavailable('데이터베이스를 사용할 수 없습니다.'));
      }
      return next(AppError.unauthorized('유효하지 않거나 만료된 Access Token입니다.'));
    });
};
