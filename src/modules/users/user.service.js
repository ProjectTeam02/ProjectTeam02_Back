/**
 * 사용자 비즈니스 로직
 * 백엔드 작업: 유스케이스 흐름과 기존 정책을 유지
 * 주의: DB는 Repository, 외부 통신은 Client를 사용한다.
 */
const { UserSetting } = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const userRepository = require('./user.repository');
const { formatMyPage } = require('./dto/userResponse.dto');
const notificationSetting = require('../notifications/dto/notificationSetting.dto');

function service(dataSource = AppDataSource) {
  const repository = userRepository(dataSource);
  return {
    async me(userId) {
      // Read the profile and progress from a consistent database snapshot.
      const result = await dataSource.transaction('REPEATABLE READ', manager => repository.findMyPage(userId, manager));
      if (!result) throw AppError.notFound('사용자를 찾을 수 없습니다.');
      return formatMyPage(result);
    },
    async updateNotifications(userId, learningOn) {
      const repo = dataSource.getRepository(UserSetting);
      let setting = await repo.findOneBy({ userId });
      if (!setting) setting = repo.create({ userId });
      setting.reminderEnabled = learningOn;
      return notificationSetting.response(await repo.save(setting));
    },
  };
}

module.exports = service;
