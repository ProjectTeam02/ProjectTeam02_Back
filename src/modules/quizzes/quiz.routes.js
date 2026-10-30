/**
 * 퀴즈 API 라우터
 * 백엔드 작업: API 경로·검증·인증 미들웨어·Controller를 연결
 * 주의: 기존 HTTP Method와 경로를 변경하지 않는다.
 */
const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { AppDataSource } = require('../../config/database');
const schema = require('./quiz.schema');
const service = require('./quiz.service')(AppDataSource);
const controller = require('./quiz.controller')(service);

const router = express.Router();
router.get('/generate', auth, controller.generate);
router.post('/:id/submit', auth, validate(schema.submit), controller.submit);
module.exports = router;
