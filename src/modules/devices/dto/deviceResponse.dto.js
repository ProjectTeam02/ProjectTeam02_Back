/**
 * 기기(푸시 토큰) 응답 데이터 형식 파일
 * 주의: 푸시 토큰 원문은 응답하지 않는다 (등록 여부만 pushTokenRegistered로 알려 줌)
 *
 * data: deviceId, deviceUuid, platform, notificationPermission, isActive, pushTokenRegistered, updatedAt
 */
function device(row) {
  return {
    deviceId: row.deviceId,
    deviceUuid: row.deviceUuid,
    platform: row.platform,
    notificationPermission: Boolean(row.notificationPermission),
    isActive: Boolean(row.isActive),
    pushTokenRegistered: Boolean(row.pushToken),
    updatedAt: row.updatedAt ?? null,
  };
}

function removed(deviceUuid) {
  return { deviceUuid, isActive: false };
}

module.exports = { device, removed };
