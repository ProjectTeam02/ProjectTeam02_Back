/**
 * AI Tutor API 라우터
 * 백엔드 작업: API 경로·검증·인증 미들웨어·Controller를 연결
 * 주의: 기존 HTTP Method와 경로를 변경하지 않는다.
 */
const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { pagination } = require('../../common/utils/pagination.util');
const { AppDataSource } = require('../../config/database');
const schema = require('./tutor.schema');
const service = require('./tutor.service')(AppDataSource);
const controller = require('./tutor.controller')(service);

function paginationMiddleware(req, _res, next) { req.pagination = pagination(req.query); next(); }
const router = express.Router();
router.use(auth);
router.post('/conversations', validate(schema.conversation), controller.createConversation);
router.get('/conversations', paginationMiddleware, controller.listConversations);
router.get('/conversations/:id/messages', paginationMiddleware, controller.messages);
router.post('/messages', validate(schema.message), controller.sendMessage);
router.get('/usage', controller.usage);
module.exports = router;
