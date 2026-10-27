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
