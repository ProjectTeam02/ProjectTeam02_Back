/**
 * 학습 알림 설정 요청·응답 데이터 형식 파일
 * 대상
 *   공식   GET/PATCH /api/v1/users/me/notification-settings  (parseUpdate, response)
 *   호환   PATCH /api/v1/users/me/notifications              (parse, legacyResponse) — 앱 전환 후 정리 이슈에서 삭제
 * 백엔드 작업: 외부 데이터와 user_settings 엔티티(account 스키마)의 변환 규칙을 관리
 * 주의: 응답에 엔티티를 그대로 넘기지 않고 필드를 고정한다. 목표(goal_count)는 알림 설정이 아니므로 응답하지 않는다.
 *
 * 공식 PATCH Body (모두 선택, 최소 1개)
 *   reminderEnabled boolean                       user_settings.reminder_enabled
 *   reminderTime    'HH:MM' | 'HH:MM:SS' | null   user_settings.reminder_time (null이면 알림 시각 해제 → 발송 안 함)
 *   timezone        IANA 시간대, 1~50자            user_settings.timezone
 * 공식 응답 data: reminderEnabled, reminderTime('HH:MM:SS' | null), timezone, updatedAt
 */
const AppError = require('../../../common/errors/AppError');
const f = require('../../../common/dto/fields');

const UPDATE_FIELDS = ['reminderEnabled', 'reminderTime', 'timezone'];

/** 호환 경로 요청: learningOn boolean 필수 */
function parse(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (typeof source.learningOn !== 'boolean') throw AppError.validation('learningOn은 boolean이어야 합니다.');
  return { learningOn: source.learningOn };
}

/** 'HH:MM'은 'HH:MM:SS'로 맞춰 저장·응답 형식을 GET과 같게 한다 */
function normalizeTime(value) {
  const time = f.time(value, 'reminderTime');
  return time.length === 5 ? `${time}:00` : time;
}

/** 공식 PATCH 요청: 보낸 필드만 반환 (보내지 않은 필드는 기존 값 유지) */
function parseUpdate(input) {
  const value = f.onlyKeys(f.object(input, 'body'), UPDATE_FIELDS, 'body');
  if (!Object.keys(value).length) throw AppError.validation('변경할 알림 설정 필드가 필요합니다.');
  const result = {};
  if (value.reminderEnabled !== undefined) {
    if (typeof value.reminderEnabled !== 'boolean') throw AppError.validation('reminderEnabled는 boolean이어야 합니다.');
    result.reminderEnabled = value.reminderEnabled;
  }
  if (value.reminderTime !== undefined) result.reminderTime = value.reminderTime === null ? null : normalizeTime(value.reminderTime);
  if (value.timezone !== undefined) {
    result.timezone = f.string(value.timezone, 'timezone', 50);
    try { new Intl.DateTimeFormat('en-US', { timeZone: result.timezone }).format(); } catch { throw AppError.validation('timezone은 IANA 시간대여야 합니다.'); }
  }
  return result;
}

/** 공식 응답 */
function response(setting) {
  return {
    reminderEnabled: Boolean(setting.reminderEnabled),
    reminderTime: setting.reminderTime ?? null,
    timezone: setting.timezone ?? 'Asia/Seoul',
    updatedAt: setting.updatedAt ?? null,
  };
}

/** 호환 경로 응답: 앱이 읽는 learningOn 유지 (dailyGoalCount는 제거) */
function legacyResponse(setting) {
  return {
    userId: setting.userId,
    learningOn: Boolean(setting.reminderEnabled),
    ...response(setting),
    createdAt: setting.createdAt ?? null,
  };
}

module.exports = { UPDATE_FIELDS, parse, parseUpdate, response, legacyResponse };
