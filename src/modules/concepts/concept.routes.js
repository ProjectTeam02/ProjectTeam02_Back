/**
 * 경제 개념 기능별 API 라우터 파일
 * 백엔드 작업: 엔드포인트와 Controller를 연결
 * 주의: 기존 API 경로와 HTTP Method 변경 금지
 */
const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { resource } = require('../content-read.validation');
const controller = require('./concept.controller')(require('./concept.service')());

const router = express.Router();
router.get('/:conceptId', auth, validate(resource('conceptId')), controller.detail);

module.exports = router;
