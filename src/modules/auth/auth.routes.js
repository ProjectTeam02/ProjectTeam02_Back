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
<<<<<<< HEAD

const router = express.Router();
const controller = authController(authService(AppDataSource, new KakaoClient()));
=======
const mobileService = require('./kakao-mobile.service');
const mobileController = require('./kakao-mobile.controller');

const router = express.Router();
const service = authService(AppDataSource, new KakaoClient());
const controller = authController(service);
const mobile = mobileController(mobileService(service));
function privateResponse(_req, res, next) {
  res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache').set('Referrer-Policy', 'no-referrer');
  next();
}
router.post('/kakao/start', privateResponse, mobile.start);
router.get('/kakao/callback', privateResponse, mobile.callback);
router.post('/kakao/exchange', privateResponse, mobile.exchange);
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
router.post('/signup', validate(authSchema.signup), controller.signup);
router.post('/login', validate(authSchema.login), controller.login);
router.post('/refresh', validate(authSchema.refresh), controller.refresh);
router.post('/logout', authMiddleware, controller.logout);
<<<<<<< HEAD
router.post('/kakao', validate(authSchema.kakao), controller.kakao);
=======
router.post('/kakao', privateResponse, validate(authSchema.kakao), controller.kakao);
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
module.exports = router;
