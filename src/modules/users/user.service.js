const prismaDefault = require('../../config/prisma');
const AppError = require('../../common/errors/AppError');
const { publicUser } = require('../auth/auth.service');
const userRepository = require('./user.repository');

function service(db = prismaDefault) {
  const repository = userRepository(db);
  return {
    async me(userId) {
      const user = await repository.findWithGrowth(userId);
      if (!user) throw AppError.notFound('사용자를 찾을 수 없습니다.');
      return publicUser(user, user.growth);
    },
    async updateNotifications(userId, learningOn) {
      return db.notificationSetting.upsert({ where: { userId }, update: { learningOn }, create: { userId, learningOn } });
    },
  };
}

module.exports = service;
