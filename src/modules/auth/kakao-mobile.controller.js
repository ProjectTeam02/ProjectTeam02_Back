const asyncHandler = require('../../common/utils/asyncHandler');

module.exports = service => ({
  start: asyncHandler(async (req, res) => res.json({ success: true, data: await service.start(req.body) })),
  callback: asyncHandler(async (req, res) => {
    const location = await service.callback(req.query);
    // An empty redirect body avoids reflecting even the short-lived exchange code into HTML.
    res.status(302).set('Location', location).end();
  }),
  exchange: asyncHandler(async (req, res) => res.json({ success: true, data: await service.exchange(req.body) })),
});
