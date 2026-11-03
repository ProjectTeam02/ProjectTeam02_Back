/**
 * 달력 기능별 API 라우터 파일
 * 백엔드 작업: 엔드포인트와 Controller를 연결
 * 주의: 기존 API 경로와 HTTP Method 변경 금지
 */
const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const schema = require('./calendar.schema');
const service = require('./calendar.service')();
const controller = require('./calendar.controller')(service);

const router = express.Router();
router.use(auth);
router.get('/', validate(schema.month), controller.month);
router.get('/days/:date', validate(schema.day), controller.day);
router.post('/plans', validate(schema.create), controller.create);
router.patch('/plans/:planId', validate(schema.update), controller.update);
router.delete('/plans/:planId', validate(schema.remove), controller.remove);
module.exports = router;
