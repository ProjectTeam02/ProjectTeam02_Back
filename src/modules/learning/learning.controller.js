/**
 * 학습 HTTP 요청·응답 처리 파일
 * 백엔드 작업: 요청값 확인 후 Service를 호출하고 응답을 반환
 * 주의: DB 직접 접근과 비즈니스 로직 작성 금지
 */
const asyncHandler = require('../../common/utils/asyncHandler');

module.exports = service => ({
  history: asyncHandler(async (req, res) => res.json({ success: true, data: await service.history(req.user.sub, req.query) })),
  historyDetail: asyncHandler(async (req, res) => res.json({ success: true, data: await service.historyDetail(req.user.sub, req.params.recordType, req.params.recordId) })),
});
