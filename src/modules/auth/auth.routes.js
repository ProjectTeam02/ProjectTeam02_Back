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
