/**
 * 퀴즈 HTTP 요청·응답 처리
 * 백엔드 작업: 요청값을 확인하고 Service를 호출
 * 주의: DB 직접 접근과 비즈니스 로직을 작성하지 않는다.
 */
const asyncHandler = require('../../common/utils/asyncHandler');

function controller(service) {
  return {
    generate: asyncHandler(async (req, res) => res.json({ success: true, data: await service.generate(req.query) })),
    start: asyncHandler(async (req, res) => {
      const data = await service.start(req.user.sub, req.params.stageId);
      res.status(data.resumed ? 200 : 201).json({ success: true, data });
    }),
    getAttempt: asyncHandler(async (req, res) => res.json({ success: true, data: await service.getAttempt(req.user.sub, req.params.attemptId) })),
    result: asyncHandler(async (req, res) => res.json({ success: true, data: await service.result(req.user.sub, req.params.attemptId) })),
    submit: asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.submit(req.user.sub, req.params.id, req.body) })),
  };
}

module.exports = controller;
