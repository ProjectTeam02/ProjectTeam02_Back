/**
 * 달력 HTTP 요청·응답 처리 파일
 * 백엔드 작업: 요청값 확인 후 Service를 호출하고 응답을 반환
 * 주의: DB 직접 접근과 비즈니스 로직 작성 금지
<<<<<<< HEAD
 * 현재 상태: 구현 전 스캐폴드이며 역할별 코드를 이 파일에 작성합니다.
 */
module.exports = {};
=======
 */
const asyncHandler = require('../../common/utils/asyncHandler');

module.exports = service => ({
  day: asyncHandler(async (req, res) => res.json({ success: true, data: await service.day(req.user.sub, req.params.date) })),
  month: asyncHandler(async (req, res) => res.json({ success: true, data: await service.month(req.user.sub, req.query.month) })),
  create: asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.create(req.user.sub, req.body) })),
  update: asyncHandler(async (req, res) => res.json({ success: true, data: await service.update(req.user.sub, req.params.planId, req.body) })),
  remove: asyncHandler(async (req, res) => res.json({ success: true, data: await service.remove(req.user.sub, req.params.planId) })),
});
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
