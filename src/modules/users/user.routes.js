const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const prisma = require('../../config/prisma');
const schema = require('./user.schema');
const service = require('./user.service')(prisma);
const controller = require('./user.controller')(service);

const router = express.Router();
router.get('/me', auth, controller.me);
router.patch('/me/notifications', auth, validate(schema.notification), controller.notifications);
module.exports = router;
