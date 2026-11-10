/**
 * 스테이지 기능별 API 라우터 파일
 * 백엔드 작업: 엔드포인트와 Controller를 연결
 * 주의: 기존 API 경로와 HTTP Method 변경 금지
 */
const express = require('express');

const router = express.Router();

const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const schema = require('../content-read.validation');
const service = require('./stage.service')();
const controller = require('./stage.controller')(service);

router.get('/:stageId', auth, validate(schema.resource('stageId')), controller.detail);
module.exports = router;
module.exports.topicStages = [auth, validate(schema.resource('topicId')), controller.list];
