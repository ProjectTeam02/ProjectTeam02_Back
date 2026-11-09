/**
 * 학습 알림 설정 요청·응답 데이터 형식 파일 (PATCH /api/v1/users/me/notifications)
 * 백엔드 작업: 외부 데이터와 user_settings 엔티티의 변환 규칙을 관리
 * 주의: 기존 요청 필드(learningOn)와 응답 필드 유지. 응답에 엔티티를 그대로 넘기지 않고 필드를 고정한다.
 *
 * 요청 Body   learningOn boolean 필수 (user_settings.reminder_enabled에 저장)
 * 응답 data
 *   userId          uuid
 *   learningOn      boolean   요청과 같은 이름 (추가 필드, reminderEnabled와 같은 값)
 *   reminderEnabled boolean   기존 필드
 *   reminderTime    string | null  'HH:MM:SS' (설정 API 추가 전까지 null)
 *   timezone        string    기본 'Asia/Seoul'
 *   dailyGoalCount  number | null  주간 목표 횟수 (DB rev.8: user_settings.goal_count, goal_period = WEEKLY). 미설정이면 null
 *   createdAt, updatedAt   ISO 시각 문자열
 */
const AppError = require('../../../common/errors/AppError');

function parse(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (typeof source.learningOn !== 'boolean') throw AppError.validation('learningOn은 boolean이어야 합니다.');
  return { learningOn: source.learningOn };
}

function response(setting) {
  return {
    userId: setting.userId,
    learningOn: Boolean(setting.reminderEnabled),
    reminderEnabled: Boolean(setting.reminderEnabled),
    reminderTime: setting.reminderTime ?? null,
    timezone: setting.timezone ?? 'Asia/Seoul',
    dailyGoalCount: setting.goalCount ?? null,
    createdAt: setting.createdAt ?? null,
    updatedAt: setting.updatedAt ?? null,
  };
}

module.exports = { parse, response };
