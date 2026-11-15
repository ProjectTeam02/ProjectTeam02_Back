/**
 * 기기(푸시 토큰) 등록·해제 라우터 — /api/v1/users/me/devices
 * 앱 시작·로그인 때 등록(PUT), 로그아웃·알림 거부 때 해제(DELETE)
 */
const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const asyncHandler = require('../../common/utils/asyncHandler');
const { AppDataSource } = require('../../config/database');
const request = require('./dto/deviceRequest.dto');
const service = require('./device.service')(AppDataSource);

const router = express.Router();
router.use(auth);
router.put('/', validate(request.parseRegister), asyncHandler(async (req, res) => res.json({ success: true, data: await service.register(req.user.sub, req.body) })));
router.delete('/:deviceUuid', validate(request.parseRemove), asyncHandler(async (req, res) => res.json({ success: true, data: await service.deactivate(req.user.sub, req.params.deviceUuid) })));

module.exports = router;
