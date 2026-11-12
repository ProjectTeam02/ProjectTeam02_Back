/**
 * 인증 API 라우터
 * 백엔드 작업: API 경로·검증·인증 미들웨어·Controller를 연결
 * 주의: 기존 HTTP Method와 경로를 변경하지 않는다.
 */
const express = require('express');
const authSchema = require('./auth.schema');
const authService = require('./auth.service');
const authController = require('./auth.controller');
const validate = require('../../common/middleware/validate.middleware');
const authMiddleware = require('../../common/middleware/auth.middleware');
const { AppDataSource } = require('../../config/database');
const KakaoClient = require('../../clients/kakao.client');
const mobileService = require('./kakao-mobile.service');
const mobileController = require('./kakao-mobile.controller');
const { PostgresOAuthStore } = require('./kakao-postgres-oauth.store');
const asyncHandler = require('../../common/utils/asyncHandler');

const router = express.Router();
const service = authService(AppDataSource, new KakaoClient());
const controller = authController(service);
const mobile = mobileController(mobileService(service, { postgresStore: new PostgresOAuthStore(AppDataSource) }));
function privateResponse(_req, res, next) {
  res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache').set('Referrer-Policy', 'no-referrer');
  next();
}
router.post('/kakao/start', privateResponse, mobile.start);
router.get('/kakao/callback', privateResponse, mobile.callback);
router.post('/kakao/exchange', privateResponse, mobile.exchange);
router.post('/signup', validate(authSchema.signup), controller.signup);
router.post('/login', validate(authSchema.login), controller.login);
router.post('/refresh', validate(authSchema.refresh), controller.refresh);
router.post('/logout', asyncHandler(async (req, res, next) => {
  const token = String(req.headers.cookie || '').split(';').map(value => value.trim().split('='))
    .find(([name]) => name === 'refreshToken')?.[1];
  if (!token) return next();
  const result = await service.logoutByRefreshToken(token);
  res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'lax' });
  return res.json({ success: true, data: result });
}));
router.post('/logout', authMiddleware, controller.logout);
router.post('/kakao', privateResponse, validate(authSchema.kakao), controller.kakao);
module.exports = router;
