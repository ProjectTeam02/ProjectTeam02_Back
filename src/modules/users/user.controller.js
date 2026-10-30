/**
 * 사용자 HTTP 요청·응답 처리
 * 백엔드 작업: 요청값을 확인하고 Service를 호출
 * 주의: DB 직접 접근과 비즈니스 로직을 작성하지 않는다.
 */
const asyncHandler = require('../../common/utils/asyncHandler');

function controller(service) {
  return {
    me: asyncHandler(async (req, res) => res.json({ success: true, data: await service.me(req.user.sub) })),
    notifications: asyncHandler(async (req, res) => res.json({ success: true, data: await service.updateNotifications(req.user.sub, req.body.learningOn) })),
  };
}

module.exports = controller;
