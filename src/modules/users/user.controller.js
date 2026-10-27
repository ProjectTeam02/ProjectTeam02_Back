const asyncHandler = require('../../common/utils/asyncHandler');

function controller(service) {
  return {
    me: asyncHandler(async (req, res) => res.json({ success: true, data: await service.me(req.user.sub) })),
    notifications: asyncHandler(async (req, res) => res.json({ success: true, data: await service.updateNotifications(req.user.sub, req.body.learningOn) })),
  };
}

module.exports = controller;
