const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const asyncHandler = require('../../common/utils/asyncHandler');
const { AppDataSource } = require('../../config/database');
const schema = require('./quiz.schema');
const service = require('./quiz.service')(AppDataSource);
const controller = require('./quiz.controller')(service);
const abandon = require('./attempt-abandon.service')(AppDataSource);
const attemptDto = require('./dto/attemptResponse.dto');

const router = express.Router();

router.post('/stages/:stageId/attempts', auth, validate(schema.startNew), controller.start);
router.get('/attempts/:attemptId/current-question', auth, validate(schema.attempt), controller.getAttempt);
router.post('/attempts/:attemptId/answers', auth, validate(schema.newAnswer), controller.submitNew);
router.post('/attempts/:attemptId/abandon', auth, validate(schema.abandon), asyncHandler(async (req, res) => {
  const attempt = await abandon(req.user.sub, req.params.attemptId);
  res.json({ success: true, data: attemptDto.abandoned(attempt) });
}));
router.get('/attempts/:attemptId', auth, validate(schema.attempt), controller.getAttemptDetails);

module.exports = router;
