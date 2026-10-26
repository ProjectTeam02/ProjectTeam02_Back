const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { pagination } = require('../../common/utils/pagination.util');
const prisma = require('../../config/prisma');
const schema = require('./tutor.schema');
const service = require('./tutor.service')(prisma);
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
