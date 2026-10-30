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

const router = express.Router();
const controller = authController(authService(AppDataSource, new KakaoClient()));
router.post('/signup', validate(authSchema.signup), controller.signup);
router.post('/login', validate(authSchema.login), controller.login);
router.post('/refresh', validate(authSchema.refresh), controller.refresh);
router.post('/logout', authMiddleware, controller.logout);
router.post('/kakao', validate(authSchema.kakao), controller.kakao);
module.exports = router;
