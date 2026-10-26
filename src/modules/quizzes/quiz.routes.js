const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const prisma = require('../../config/prisma');
const schema = require('./quiz.schema');
const service = require('./quiz.service')(prisma);
const controller = require('./quiz.controller')(service);

const router = express.Router();
router.get('/generate', auth, controller.generate);
router.post('/:id/submit', auth, validate(schema.submit), controller.submit);
module.exports = router;
