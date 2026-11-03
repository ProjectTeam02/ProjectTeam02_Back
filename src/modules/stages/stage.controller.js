const asyncHandler = require('../../common/utils/asyncHandler');

function controller(service) {
  return {
    getStages: asyncHandler(async (req, res) => res.json({ success: true, data: await service.getStageMap(req.user.sub) })),
    getStageSteps: asyncHandler(async (req, res) => res.json({ success: true, data: await service.getStageSteps(req.params.stageId, req.user.sub) })),
  };
}

module.exports = controller;
