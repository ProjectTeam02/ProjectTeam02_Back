/**
 * 학습 주제 기능별 API 라우터 파일
 * 백엔드 작업: 엔드포인트와 Controller를 연결
 * 주의: 기존 API 경로와 HTTP Method 변경 금지
 */
const express = require('express');

const router = express.Router();

const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { noQuery } = require('../content-read.validation');
const { topicStages } = require('../stages/stage.routes');
const service = require('./topic.service')();
const controller = require('./topic.controller')(service);

router.get('/', auth, validate(noQuery), controller.list);
router.get('/:topicId/stages', ...topicStages);
module.exports = router;
