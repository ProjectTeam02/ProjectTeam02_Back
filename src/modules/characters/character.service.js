/**
 * 캐릭터 비즈니스 로직 파일
 * 백엔드 작업: 유스케이스 흐름과 정책을 조합
 * 주의: DB 접근은 Repository, 외부 통신은 Client 사용
 */
const { ClassCode } = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const repository = require('./job.repository');
const formatJob = require('./dto/jobResponse.dto');

const classCodes = new Set(Object.values(ClassCode));
const classNotFound = () => AppError.notFound('선택할 수 있는 직업을 찾을 수 없습니다.');

module.exports = (dataSource = AppDataSource) => ({
  async list() {
    const classes = await repository(dataSource.manager).listActive();
    return { items: classes.map(formatJob) };
  },
  async select(userId, classCode) {
    if (!classCodes.has(classCode)) throw classNotFound();

    return dataSource.transaction('READ COMMITTED', async manager => {
      const jobs = repository(manager);
      // Lock the user first so every request sees the first committed selection.
      const user = await jobs.lockUser(userId);
      if (!user) throw AppError.notFound('사용자를 찾을 수 없습니다.');
      const existing = await jobs.findSelection(userId);

      let characterClass = existing?.characterClass;
      let firstSelectedAt = existing?.firstSelectedAt;
      if (characterClass?.classCode !== classCode) {
        characterClass = await jobs.findActiveForSelection(classCode);
        if (!characterClass) throw classNotFound();
        if (existing) throw AppError.conflict('이미 다른 직업을 선택했습니다.');
        firstSelectedAt = new Date();
        await jobs.insertSelection(userId, characterClass.classId, firstSelectedAt);
      }

      if (!user.onboardingCompletedAt) {
        await jobs.completeOnboarding(userId, firstSelectedAt);
      }
      return { characterClass: formatJob(characterClass), onboardingCompleted: true };
    });
  },
});
