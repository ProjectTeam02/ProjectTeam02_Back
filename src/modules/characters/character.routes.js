/**
 * 캐릭터 기능별 API 라우터 파일
 * 백엔드 작업: 엔드포인트와 Controller를 연결
 * 주의: 기존 API 경로와 HTTP Method 변경 금지
 */
const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const controller = require('./character.controller')(require('./character.service')());

const router = express.Router();
router.get('/', auth, controller.list);

module.exports = router;
