/**
 * 기기(푸시 토큰) 등록·해제 요청 데이터 형식 파일
 * 대상: PUT /api/v1/users/me/devices, DELETE /api/v1/users/me/devices/{deviceUuid}
 * 백엔드 작업: 요청을 검사·정규화해서 Service에 넘긴다. 길이 제한은 account.user_devices 컬럼 기준
 * 주의: 허용하지 않은 필드·쿼리는 422
 *
 * 등록 Body
 *   deviceUuid             필수  앱 설치마다 한 번 만든 식별자, 1~100자 (공백 없음)
 *   platform               필수  IOS | ANDROID
 *   notificationPermission 필수  boolean (OS 알림 권한)
 *   pushToken              선택  Expo 푸시 토큰 'ExponentPushToken[...]', 512자 이하. null이면 토큰 해제, 생략하면 기존 값 유지
 *   osVersion, appVersion  선택  각 30자 이하 (null이면 비움)
 *   deviceModel            선택  100자 이하 (null이면 비움)
 */
const AppError = require('../../../common/errors/AppError');
const f = require('../../../common/dto/fields');

const PLATFORMS = ['IOS', 'ANDROID'];
const DEVICE_UUID = /^[A-Za-z0-9._:-]{1,100}$/;
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;
const REGISTER_FIELDS = ['deviceUuid', 'platform', 'notificationPermission', 'pushToken', 'osVersion', 'appVersion', 'deviceModel'];
const OPTIONAL_TEXT = { osVersion: 30, appVersion: 30, deviceModel: 100 };

function noQuery(query) {
  if (Object.keys(f.object(query, 'query')).length) throw AppError.validation('지원하지 않는 조회 조건입니다.');
}

function deviceUuid(value) {
  if (typeof value !== 'string' || !DEVICE_UUID.test(value)) {
    throw AppError.validation('deviceUuid는 공백 없는 1~100자 문자열이어야 합니다.');
  }
  return value;
}

function pushToken(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 512 || !EXPO_TOKEN.test(value)) {
    throw AppError.validation('pushToken은 Expo 푸시 토큰(ExponentPushToken[...]) 형식이어야 합니다.');
  }
  return value;
}

function parseRegister({ body, query }) {
  noQuery(query);
  const value = f.onlyKeys(f.object(body, 'body'), REGISTER_FIELDS, 'body');
  if (typeof value.notificationPermission !== 'boolean') throw AppError.validation('notificationPermission은 boolean이어야 합니다.');
  const result = {
    deviceUuid: deviceUuid(value.deviceUuid),
    platform: f.oneOf(value.platform, PLATFORMS, 'platform'),
    notificationPermission: value.notificationPermission,
  };
  // 보낸 선택 필드만 넘긴다 (생략하면 기존 값 유지)
  if (value.pushToken !== undefined) result.pushToken = pushToken(value.pushToken);
  for (const [key, max] of Object.entries(OPTIONAL_TEXT)) {
    if (value[key] !== undefined) result[key] = f.optionalString(value[key], key, max);
  }
  return { body: result };
}

function parseRemove({ params, query, body }) {
  noQuery(query);
  if (Object.keys(f.object(body, 'body')).length) throw AppError.validation('지원하지 않는 요청 필드입니다.');
  return { params: { deviceUuid: deviceUuid(f.object(params, 'params').deviceUuid) } };
}

module.exports = { PLATFORMS, parseRegister, parseRemove };
