const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { AppDataSource } = require('../../config/database');
const schema = require('./quiz.schema');
const service = require('./quiz.service')(AppDataSource);
const controller = require('./quiz.controller')(service);

const router = express.Router();

router.post('/stages/:stageId/attempts', auth, validate(schema.startNew), controller.start);
router.get('/attempts/:attemptId/current-question', auth, validate(schema.attempt), controller.getAttempt);
router.post('/attempts/:attemptId/answers', auth, validate(schema.newAnswer), controller.submitNew);
router.get('/attempts/:attemptId', auth, validate(schema.attempt), controller.getAttemptDetails);

module.exports = router;
