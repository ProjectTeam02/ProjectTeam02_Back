/** Internal HTTP ingress for AI-generated question drafts (not a public learner API). */
const asyncHandler = require('../../common/utils/asyncHandler');

function controller(service) {
  return {
    createGeneratedDraft: asyncHandler(async (req, res) => {
      const result = await service.createGeneratedDraft(req.body);
      res.status(201).json({ success: true, data: result });
    }),
  };
}

module.exports = controller;
