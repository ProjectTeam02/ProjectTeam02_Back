<<<<<<< HEAD
=======
/**
 * 사용자 API 라우터
 * 백엔드 작업: API 경로·검증·인증 미들웨어·Controller를 연결
 * 주의: 기존 HTTP Method와 경로를 변경하지 않는다.
 */
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { AppDataSource } = require('../../config/database');
const schema = require('./user.schema');
const service = require('./user.service')(AppDataSource);
const controller = require('./user.controller')(service);

const router = express.Router();
router.get('/me', auth, controller.me);
router.patch('/me/notifications', auth, validate(schema.notification), controller.notifications);
<<<<<<< HEAD

=======
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
module.exports = router;
