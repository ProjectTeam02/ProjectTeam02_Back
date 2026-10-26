const { UserSetting } = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const { publicUser } = require('../auth/auth.service');
const userRepository = require('./user.repository');

function service(dataSource = AppDataSource) {
  const repository = userRepository(dataSource);
  return {
    async me(userId) {
      const result = await repository.findWithGrowth(userId);
      if (!result) throw AppError.notFound('사용자를 찾을 수 없습니다.');
      return publicUser(result.user, result.growth);
    },
    async updateNotifications(userId, learningOn) {
      const repo = dataSource.getRepository(UserSetting);
      let setting = await repo.findOneBy({ userId });
      if (!setting) setting = repo.create({ userId });
      setting.reminderEnabled = learningOn;
      return repo.save(setting);
    },
  };
}

module.exports = service;
