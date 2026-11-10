/**
 * INTERNAL ingestion endpoint. Never expose this as an authenticated learner route:
 * it writes question records. Without QUESTION_IMPORT_API_KEY it is disabled.
 */
const express = require('express');
const asyncHandler = require('../../common/utils/asyncHandler');
const generation = require('./question-generation.service')();
const { createHash, timingSafeEqual } = require('node:crypto');
const AppError = require('../../common/errors/AppError');
const { AppDataSource } = require('../../config/database');
const env = require('../../config/env');
const service = require('./question.service')(AppDataSource);
const controller = require('./question.controller')(service);

function internalQuestionAuth(req, _res, next) {
  const expected = env.questionImportApiKey;
  if (!expected || typeof expected !== 'string' || expected.length < 24) {
    return next(AppError.unavailable('문제 적재 API의 서버 인증키가 설정되지 않았습니다.'));
  }
  const supplied = req.get('x-question-import-key') || '';
  const left = createHash('sha256').update(expected).digest();
  const right = createHash('sha256').update(supplied).digest();
  if (!timingSafeEqual(left, right)) {
    return next(AppError.unauthorized('내부 문제 적재 인증에 실패했습니다.'));
  }
  next();
}

const router = express.Router();
router.post('/drafts', internalQuestionAuth, controller.createGeneratedDraft);
router.post('/generate', internalQuestionAuth, asyncHandler(async (req, res) => {
  const response = await generation.generate(req.body, req.get('Idempotency-Key'));
  res.status(response.httpStatus).json(response.body);
}));
module.exports = router;
