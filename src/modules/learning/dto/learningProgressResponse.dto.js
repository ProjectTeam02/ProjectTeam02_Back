/**
 * 학습 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 * 학습 진도와 연결된 Stage를 공개 필드로 변환한다.
 */
const { iso } = require('../../../common/dto/fields');
const { stage } = require('../../extended-api/dto/extendedResponse.dto');

function item(row, stageRow) {
  return { stageId: row.stageId, stage: stageRow ? stage(stageRow) : null, progressStatus: row.progressStatus,
    contentPosition: row.contentPosition, contentPositionUpdatedAt: iso(row.contentPositionUpdatedAt), startedAt: iso(row.startedAt) };
}

function updated(row) { return { userId: row.userId, stageId: row.stageId, progressStatus: row.progressStatus,
  contentPosition: row.contentPosition, contentPositionUpdatedAt: iso(row.contentPositionUpdatedAt), startedAt: iso(row.startedAt) }; }

module.exports = { item, updated };
