/**
 * 인증 HTTP 요청·응답 처리
 * 백엔드 작업: 요청값을 확인하고 Service를 호출
 * 주의: DB 직접 접근과 비즈니스 로직을 작성하지 않는다.
 */
const asyncHandler = require('../../common/utils/asyncHandler');

function controller(service) {
  return {
    signup: asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.signup(req.body) })),
    login: asyncHandler(async (req, res) => res.json({ success: true, data: await service.login(req.body) })),
    refresh: asyncHandler(async (req, res) => res.json({ success: true, data: await service.refresh(req.body.refreshToken) })),
    logout: asyncHandler(async (req, res) => res.json({ success: true, data: await service.logout(req.user.sub) })),
    kakao: asyncHandler(async (req, res) => res.json({ success: true, data: await service.kakao(req.body.accessToken) })),
  };
}

module.exports = controller;
