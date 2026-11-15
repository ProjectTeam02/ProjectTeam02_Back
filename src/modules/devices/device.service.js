/**
 * 기기(푸시 토큰) 비즈니스 로직 파일
 * 백엔드 작업: 기기 등록·갱신·비활성화 (account.user_devices)
 * 주의: 행은 지우지 않고 비활성화한다 (is_active = false, push_token = null)
 *       push_token은 전체 사용자에서 UNIQUE라, 한 휴대폰에서 계정을 바꿔 로그인하면 이전 행의 토큰을 같은 트랜잭션에서 비운다
 */
const { UserDevice } = require('@leren/database');
const { Not } = require('typeorm');
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const response = require('./dto/deviceResponse.dto');

const isUniqueViolation = error => error?.code === '23505' || error?.driverError?.code === '23505';
const OPTIONAL_TEXT = ['osVersion', 'appVersion', 'deviceModel'];

/** 그 사용자의 기기를 모두 비활성화 (로그아웃 등). manager를 넘기면 같은 트랜잭션에서 실행 */
async function deactivateAll(userId, manager) {
  await manager.getRepository(UserDevice).update(
    { userId, isActive: true },
    { isActive: false, pushToken: null, pushTokenUpdatedAt: new Date() },
  );
}

module.exports = function service(dataSource = AppDataSource) {
  return {
    async register(userId, input) {
      try {
        return await dataSource.transaction(async manager => {
          const repo = manager.getRepository(UserDevice);
          const now = new Date();
          let device = await repo.findOne({ where: { userId, deviceUuid: input.deviceUuid }, lock: { mode: 'pessimistic_write' } });
          if (input.pushToken) {
            // 같은 토큰을 가진 다른 행(다른 계정·다른 설치)의 토큰을 먼저 비운다
            const others = await repo.find({ where: { pushToken: input.pushToken, ...(device ? { deviceId: Not(device.deviceId) } : {}) } });
            for (const other of others) {
              await repo.update({ deviceId: other.deviceId }, { pushToken: null, pushTokenUpdatedAt: now });
            }
          }
          if (!device) device = repo.create({ userId, deviceUuid: input.deviceUuid });
          device.platform = input.platform;
          device.notificationPermission = input.notificationPermission;
          device.permissionCheckedAt = now;
          device.isActive = true;
          device.lastSeenAt = now;
          if (input.pushToken !== undefined && input.pushToken !== device.pushToken) {
            device.pushToken = input.pushToken;
            device.pushTokenUpdatedAt = now;
          }
          for (const key of OPTIONAL_TEXT) if (input[key] !== undefined) device[key] = input[key];
          return response.device(await repo.save(device));
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw AppError.conflict('같은 기기 등록이 동시에 처리되었습니다. 다시 시도해 주세요.');
        throw error;
      }
    },
    async deactivate(userId, deviceUuid) {
      await dataSource.getRepository(UserDevice).update(
        { userId, deviceUuid },
        { isActive: false, pushToken: null, pushTokenUpdatedAt: new Date() },
      );
      return response.removed(deviceUuid);
    },
  };
};

module.exports.deactivateAll = deactivateAll;
