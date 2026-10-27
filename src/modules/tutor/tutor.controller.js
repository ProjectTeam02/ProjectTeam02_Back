const asyncHandler = require('../../common/utils/asyncHandler');

function controller(service) {
  return {
    createConversation: asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.createConversation(req.user.sub, req.body) })),
    listConversations: asyncHandler(async (req, res) => res.json({ success: true, data: await service.listConversations(req.user.sub, req.pagination) })),
    messages: asyncHandler(async (req, res) => res.json({ success: true, data: await service.messages(req.user.sub, req.params.id, req.pagination) })),
    sendMessage: asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.sendMessage(req.user.sub, req.body, req.get('idempotency-key')) })),
    usage: asyncHandler(async (req, res) => res.json({ success: true, data: await service.usage(req.user.sub) })),
  };
}

module.exports = controller;
