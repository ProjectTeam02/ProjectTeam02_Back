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
