/**
 * 학습 알림 발송 비즈니스 로직 (E-2)
 * 백엔드 작업: 설정 시각이 된 사용자를 골라 하루 한 번 학습 알림을 보낸다
 *
 * 대상: account.user_settings에서
 *   - reminder_enabled = true, reminder_time 있음 (시각이 없으면 발송 안 함)
 *   - 사용자 시간대(timezone) 기준 현재 시:분 = reminder_time 시:분
 *   - 계정 상태 ACTIVE
 *   - 발송 가능한 기기(활성, 알림 권한 허용, 푸시 토큰 있음)가 1개 이상
 * 중복 방지: account.notification_logs에 PENDING으로 먼저 INSERT (사용자·종류·날짜 UNIQUE, 충돌하면 건너뜀)
 *           → 새로 들어간 사용자에게만 발송 → SENT/FAILED·기기 수·성공 수 기록
 * 주의: SQL을 직접 쓰므로 스키마 이름(account.)을 붙인다 (#98)
 */
const { AppDataSource } = require('../../config/database');
const message = require('./reminder.message');

const DUE_AND_RESERVE = `
WITH due AS (
  SELECT s.user_id, ($1::timestamptz AT TIME ZONE s.timezone)::date AS target_date
  FROM account.user_settings s
  JOIN account.users u ON u.user_id = s.user_id AND u.account_status = 'ACTIVE'
  WHERE s.reminder_enabled
    AND s.reminder_time IS NOT NULL
    AND s.timezone IN (SELECT name FROM pg_timezone_names)
    AND to_char($1::timestamptz AT TIME ZONE s.timezone, 'HH24:MI') = to_char(s.reminder_time, 'HH24:MI')
    AND EXISTS (
      SELECT 1 FROM account.user_devices d
      WHERE d.user_id = s.user_id AND d.is_active AND d.notification_permission AND d.push_token IS NOT NULL
    )
)
INSERT INTO account.notification_logs (user_id, notification_type, target_date)
SELECT user_id, 'LEARNING_REMINDER'::account.notification_type, target_date FROM due
ON CONFLICT ON CONSTRAINT uq_notification_logs_user_type_date DO NOTHING
RETURNING notification_log_id AS "logId", user_id AS "userId"`;

const TARGET_DEVICES = `
SELECT device_id AS "deviceId", user_id AS "userId", push_token AS "pushToken"
FROM account.user_devices
WHERE user_id = ANY($1::uuid[]) AND is_active AND notification_permission AND push_token IS NOT NULL
ORDER BY user_id, device_id`;

const DEACTIVATE_DEVICES = `
UPDATE account.user_devices SET is_active = false, push_token = NULL, push_token_updated_at = now(), updated_at = now()
WHERE device_id = ANY($1::uuid[])`;

const FINISH_LOG = `
UPDATE account.notification_logs
SET status = $2::account.notification_status, device_count = $3, success_count = $4, error_code = $5, sent_at = now()
WHERE notification_log_id = $1`;

function buildMessage(device) {
  return { to: device.pushToken, title: message.title, body: message.body, data: message.data, sound: message.sound, channelId: message.channelId };
}

module.exports = function reminderService({ dataSource = AppDataSource, pushClient } = {}) {
  if (!pushClient) throw new Error('pushClient가 필요합니다.');
  const query = (sql, params) => dataSource.query(sql, params);

  return {
    /** now 기준으로 한 번 실행. 결과 요약을 돌려준다 (토큰은 포함하지 않음) */
    async runOnce(now = new Date()) {
      const reserved = await query(DUE_AND_RESERVE, [now.toISOString()]);
      if (!reserved.length) return { reserved: 0, sent: 0, failed: 0, deactivated: 0 };

      const devices = await query(TARGET_DEVICES, [reserved.map(row => row.userId)]);
      const byUser = new Map(reserved.map(row => [row.userId, { logId: row.logId, deviceCount: 0, successCount: 0, errorCode: null }]));
      for (const device of devices) byUser.get(device.userId).deviceCount += 1;

      let tickets = [];
      let sendError = null;
      if (devices.length) {
        try {
          tickets = await pushClient.send(devices.map(buildMessage));
        } catch (error) {
          sendError = String(error?.code || 'SEND_ERROR').slice(0, 50);
        }
      }

      const unregistered = [];
      devices.forEach((device, index) => {
        const result = byUser.get(device.userId);
        const ticket = tickets[index];
        if (sendError) { result.errorCode = sendError; return; }
        if (ticket?.status === 'ok') { result.successCount += 1; return; }
        const code = String(ticket?.details?.error || 'EXPO_ERROR').slice(0, 50);
        result.errorCode ??= code;
        if (code === 'DeviceNotRegistered') unregistered.push(device.deviceId);
      });
      if (unregistered.length) await query(DEACTIVATE_DEVICES, [unregistered]);

      let sent = 0;
      let failed = 0;
      for (const result of byUser.values()) {
        const ok = result.successCount > 0;
        if (ok) sent += 1; else failed += 1;
        // 기기가 사이에 모두 해제된 경우도 FAILED로 남긴다 (같은 날 다시 보내지 않음)
        const errorCode = ok ? null : (result.errorCode || (result.deviceCount ? 'EXPO_ERROR' : 'NO_DEVICE'));
        await query(FINISH_LOG, [result.logId, ok ? 'SENT' : 'FAILED', result.deviceCount, result.successCount, errorCode]);
      }
      return { reserved: reserved.length, sent, failed, deactivated: unregistered.length };
    },
  };
};

module.exports.buildMessage = buildMessage;
