const asyncHandler = require('../../common/utils/asyncHandler');

function controller(service) {
  return {
    generate: asyncHandler(async (req, res) => res.json({ success: true, data: await service.generate(req.query) })),
    submit: asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.submit(req.user.sub, req.params.id, req.body) })),
  };
}

module.exports = controller;
