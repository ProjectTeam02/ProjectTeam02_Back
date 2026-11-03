const asyncHandler = require('../../common/utils/asyncHandler');

function controller(service) {
  return {
    getConceptCard: asyncHandler(async (req, res) => {
      const { stepId } = req.params;
      const page = parseInt(req.query.page, 10) || 1;
      const data = await service.getCardByPage(stepId, page);
      return res.json({ success: true, data });
    }),
  };
}

module.exports = controller;
