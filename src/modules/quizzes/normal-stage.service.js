const crypto = require('node:crypto');
const {
  User, TopicPrerequisite, Stage, StageQuestion, QuestionChoice, LearningAttempt,
  QuestionSubmission, UserStageProgress, UserGrowth, UserWallet, LevelThreshold,
  ExpLedger, CoinLedger,
} = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');

const normalRules = { questions: 3, correct: 2, hp: 2 };
const repository = (manager, entity) => manager.getRepository(entity);

function submissionIdFor(attemptId, key) {
  const bytes = crypto.createHash('sha256').update(attemptId).update('\0').update(key).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function publicQuestion(question, choices) {
  return {
    id: question.questionId,
    title: question.questionText,
    difficulty: question.difficulty,
    conceptId: question.conceptId,
    choices: choices.map(choice => ({
      id: choice.choiceId,
      label: String.fromCharCode(64 + choice.baseOrder),
      content: choice.choiceText,
    })),
  };
}

function summary(attempt) {
  return {
    attemptId: attempt.attemptId, stageId: attempt.stageId, status: attempt.status,
    mode: attempt.mode, attemptNo: attempt.attemptNo,
    maxQuestionCount: attempt.maxQuestionCount, submittedCount: attempt.submittedCount,
    correctCount: attempt.correctCount, hp: attempt.finalHp ?? attempt.initialHp,
    endReason: attempt.endReason, endedAt: attempt.endedAt,
    rewardGranted: attempt.rewardGranted,
  };
}

function transition(attempt, isCorrect) {
  const hpBefore = attempt.finalHp ?? attempt.initialHp;
  const hpAfter = Math.max(0, hpBefore - (isCorrect ? 1 : 0));
  const submittedCount = attempt.submittedCount + 1;
  const correctCount = attempt.correctCount + (isCorrect ? 1 : 0);
  const passed = hpAfter === 0 || correctCount >= attempt.requiredCorrectCount;
  const failed = !passed && submittedCount === attempt.maxQuestionCount;
  return {
    hpBefore, hpAfter, submittedCount, correctCount,
    status: passed ? 'PASSED' : failed ? 'FAILED' : 'IN_PROGRESS',
  };
}

async function currentQuestion(manager, attempt) {
  if (attempt.status !== 'IN_PROGRESS') return null;
  const order = attempt.submittedCount + 1;
  const mapping = await repository(manager, StageQuestion).findOne({
    where: { stageId: attempt.stageId, questionOrder: order }, relations: { question: true },
  });
  if (!mapping || mapping.question?.status !== 'PUBLISHED') {
    throw AppError.unavailable('진행 중인 응시의 문항 구성이 올바르지 않습니다.');
  }
  const choices = await repository(manager, QuestionChoice).find({
    where: { questionId: mapping.questionId }, order: { baseOrder: 'ASC' },
  });
  if (choices.length !== 4) throw AppError.unavailable('문항 선택지 구성이 올바르지 않습니다.');
  return publicQuestion(mapping.question, choices);
}

async function view(manager, attempt) {
  return { ...summary(attempt), currentQuestion: await currentQuestion(manager, attempt) };
}

async function requireStage(manager, stageId) {
  const stage = await repository(manager, Stage).findOne({
    where: { stageId }, relations: { topic: true },
  });
  if (!stage || stage.status !== 'PUBLISHED' || stage.topic?.status !== 'PUBLISHED') {
    throw AppError.notFound('공개된 Stage를 찾을 수 없습니다.');
  }
  if (stage.stageType !== 'NORMAL') throw AppError.validation('이번 Quiz는 일반 Stage만 지원합니다.');
  if (stage.maxQuestionCount !== normalRules.questions
    || stage.requiredCorrectCount !== normalRules.correct
    || stage.initialMonsterHp !== normalRules.hp) {
    throw AppError.unavailable('일반 Stage Quiz 설정이 올바르지 않습니다.');
  }
  if ([stage.rewardTotalExp, stage.rewardEconomyExp, stage.rewardCoin]
    .some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw AppError.unavailable('Stage 최초 통과 보상이 설정되지 않았습니다.');
  }
  return stage;
}

async function requireNormalAttempt(manager, attempt) {
  const stage = await repository(manager, Stage).findOneBy({ stageId: attempt.stageId });
  if (stage?.stageType !== 'NORMAL' || attempt.maxQuestionCount !== 3
    || attempt.requiredCorrectCount !== 2 || attempt.initialHp !== 2) {
    throw AppError.validation('이번 Quiz는 일반 Stage만 지원합니다.');
  }
  return stage;
}

async function requireUnlocked(manager, userId, stage) {
  const progressRepo = repository(manager, UserStageProgress);
  const existing = await progressRepo.findOneBy({ userId, stageId: stage.stageId });
  if (existing?.progressStatus === 'PASSED') return existing;
  if (stage.stageNo > 1) {
    const previous = await repository(manager, Stage).findOneBy({ topicId: stage.topicId, stageNo: stage.stageNo - 1 });
    if (!previous || !await progressRepo.findOneBy({ userId, stageId: previous.stageId, progressStatus: 'PASSED' })) {
      throw AppError.forbidden('이전 Stage를 먼저 통과해야 합니다.');
    }
  } else {
    const prerequisites = await repository(manager, TopicPrerequisite).findBy({ topicId: stage.topicId });
    for (const prerequisite of prerequisites) {
      const boss = await repository(manager, Stage).findOneBy({ topicId: prerequisite.prerequisiteTopicId, stageType: 'BOSS' });
      if (!boss || !await progressRepo.findOneBy({ userId, stageId: boss.stageId, progressStatus: 'PASSED' })) {
        throw AppError.forbidden('선수 주제를 먼저 통과해야 합니다.');
      }
    }
  }
  return existing;
}

async function requireQuestionPool(manager, stageId) {
  const mappings = await repository(manager, StageQuestion).find({
    where: { stageId }, relations: { question: true }, order: { questionOrder: 'ASC' },
  });
  if (mappings.length !== normalRules.questions || mappings.some((row, i) => row.questionOrder !== i + 1 || row.question?.status !== 'PUBLISHED')) {
    throw AppError.unavailable('일반 Stage에 공개된 문항 3개가 필요합니다.');
  }
  for (const row of mappings) {
    const choices = await repository(manager, QuestionChoice).findBy({ questionId: row.questionId });
    if (choices.length !== 4 || choices.filter(choice => choice.isCorrect).length !== 1) {
      throw AppError.unavailable('문항마다 선택지 4개와 정답 1개가 필요합니다.');
    }
  }
}

async function levelFor(manager, scope, exp) {
  const rows = await repository(manager, LevelThreshold).find({ where: { scope }, order: { requiredExp: 'DESC' } });
  const row = rows.find(item => item.requiredExp <= exp);
  if (!row) throw AppError.unavailable('레벨 기준이 설정되지 않았습니다.');
  return row.level;
}

async function grantFirstPass(manager, userId, stage, attempt) {
  const amounts = [stage.rewardTotalExp, stage.rewardEconomyExp, stage.rewardCoin];
  if (amounts.some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw AppError.unavailable('Stage 최초 통과 보상이 설정되지 않았습니다.');
  }
  // One user row serializes balance changes from distinct Stage completions.
  const user = await repository(manager, User).findOne({ where: { userId }, lock: { mode: 'pessimistic_write' } });
  if (!user) throw AppError.notFound('사용자를 찾을 수 없습니다.');
  const growthRepo = repository(manager, UserGrowth);
  const walletRepo = repository(manager, UserWallet);
  let growth = await growthRepo.findOneBy({ userId });
  if (!growth) growth = await growthRepo.save(growthRepo.create({ userId }));
  let wallet = await walletRepo.findOneBy({ userId });
  if (!wallet) wallet = await walletRepo.save(walletRepo.create({ userId }));
  const totalExp = growth.totalExp + stage.rewardTotalExp;
  const economyExp = growth.economyExp + stage.rewardEconomyExp;
  const coinBalance = wallet.coinBalance + stage.rewardCoin;
  if (![totalExp, economyExp, coinBalance].every(Number.isSafeInteger)) throw AppError.unavailable('보상 잔액 범위를 초과했습니다.');
  const totalLevel = await levelFor(manager, 'ACCOUNT', totalExp);
  const economyLevel = await levelFor(manager, 'ECONOMY', economyExp);
  await repository(manager, ExpLedger).save({
    userId, sourceType: 'STAGE_FIRST_CLEAR', sourceStageId: stage.stageId, attemptId: attempt.attemptId,
    totalExpAmount: stage.rewardTotalExp, economyExpAmount: stage.rewardEconomyExp,
    totalExpAfter: totalExp, economyExpAfter: economyExp,
    totalLevelAfter: totalLevel, economyLevelAfter: economyLevel,
  });
  await repository(manager, CoinLedger).save({
    userId, transactionType: 'EARN', reason: 'STAGE_FIRST_CLEAR', amount: stage.rewardCoin,
    balanceBefore: wallet.coinBalance, balanceAfter: coinBalance,
    refType: 'STAGE', refId: stage.stageId, attemptId: attempt.attemptId,
  });
  await growthRepo.update({ userId }, {
    totalExp, economyExp, totalLevel, economyLevel,
    ...(totalLevel > growth.totalLevel || economyLevel > growth.economyLevel ? { lastLevelUpAt: new Date() } : {}),
  });
  await walletRepo.update({ userId }, { coinBalance, version: wallet.version + 1 });
}

module.exports = function normalStageService(dataSource = AppDataSource) {
  return {
    async start(userId, stageId) {
      return dataSource.transaction(async manager => {
        const user = await repository(manager, User).findOne({ where: { userId }, lock: { mode: 'pessimistic_write' } });
        if (!user) throw AppError.notFound('사용자를 찾을 수 없습니다.');
        const stage = await requireStage(manager, stageId);
        const attemptRepo = repository(manager, LearningAttempt);
        const active = await attemptRepo.findOneBy({ userId, stageId, status: 'IN_PROGRESS' });
        if (active) return { ...(await view(manager, active)), resumed: true };
        const progress = await requireUnlocked(manager, userId, stage);
        await requireQuestionPool(manager, stageId);
        const previous = await attemptRepo.findOne({ where: { userId, stageId }, order: { attemptNo: 'DESC' } });
        const attempt = await attemptRepo.save(attemptRepo.create({
          userId, stageId, attemptNo: (previous?.attemptNo || 0) + 1,
          attemptType: 'PLAY', mode: previous ? 'RETRY' : 'START', status: 'IN_PROGRESS',
          maxQuestionCount: stage.maxQuestionCount,
          requiredCorrectCount: stage.requiredCorrectCount,
          initialHp: stage.initialMonsterHp,
          finalHp: null, submittedCount: 0, correctCount: 0,
        }));
        if (!progress) await repository(manager, UserStageProgress).save({
          userId, stageId, progressStatus: 'IN_PROGRESS', startedAt: new Date(),
        });
        return { ...(await view(manager, attempt)), resumed: false };
      });
    },
    async get(userId, attemptId) {
      return dataSource.transaction('REPEATABLE READ', async manager => {
        const attempt = await repository(manager, LearningAttempt).findOneBy({ attemptId, userId });
        if (!attempt) throw AppError.notFound('응시를 찾을 수 없습니다.');
        await requireNormalAttempt(manager, attempt);
        return view(manager, attempt);
      });
    },
    async result(userId, attemptId) {
      return dataSource.transaction('REPEATABLE READ', async manager => {
        const attempt = await repository(manager, LearningAttempt).findOneBy({ attemptId, userId });
        if (!attempt) throw AppError.notFound('응시를 찾을 수 없습니다.');
        await requireNormalAttempt(manager, attempt);
        if (!['PASSED', 'FAILED'].includes(attempt.status)) throw AppError.conflict('완료된 일반 Stage 결과가 없습니다.');
        return summary(attempt);
      });
    },
    async submit(userId, questionId, { choiceId, attemptId, idempotencyKey }) {
      if (!attemptId) throw AppError.validation('attemptId가 필요합니다.');
      try {
        return await dataSource.transaction(async manager => {
          const attemptRepo = repository(manager, LearningAttempt);
          const attempt = await attemptRepo.findOne({
            where: { attemptId, userId }, lock: { mode: 'pessimistic_write' },
          });
          if (!attempt) throw AppError.notFound('응시를 찾을 수 없습니다.');
          const submissionRepo = repository(manager, QuestionSubmission);
          const submissionId = idempotencyKey ? submissionIdFor(attemptId, idempotencyKey) : crypto.randomUUID();
          if (idempotencyKey) {
            const priorKey = await submissionRepo.findOneBy({ submissionId });
            if (priorKey) {
              if (priorKey.attemptId !== attemptId || priorKey.questionId !== questionId || priorKey.choiceId !== choiceId) {
                throw AppError.conflict('Idempotency-Key가 다른 답안에 이미 사용되었습니다.');
              }
              const priorRows = await submissionRepo.findBy({ attemptId });
              const earlier = priorRows.filter(row => row.sequenceNo <= priorKey.sequenceNo);
              const correctCount = earlier.filter(row => row.isCorrect).length;
              const status = priorKey.hpAfter === 0 || correctCount >= attempt.requiredCorrectCount
                ? 'PASSED' : priorKey.sequenceNo === attempt.maxQuestionCount ? 'FAILED' : 'IN_PROGRESS';
              const question = await repository(manager, StageQuestion).findOne({
                where: { stageId: attempt.stageId, questionId }, relations: { question: true },
              });
              return {
                attemptId, quizId: questionId, choiceId, isCorrect: priorKey.isCorrect,
                score: priorKey.isCorrect ? 100 : 0, explanation: question?.question?.explanation ?? null,
                hpBefore: priorKey.hpBefore, hpAfter: priorKey.hpAfter,
                submittedCount: priorKey.sequenceNo, correctCount, status,
                endReason: status === 'PASSED' ? 'MONSTER_DEFEATED' : status === 'FAILED' ? 'QUESTIONS_EXHAUSTED' : null,
                rewardGranted: status === 'PASSED' && attempt.isFirstPass,
                duplicate: true,
              };
            }
          }
          if (attempt.status !== 'IN_PROGRESS') throw AppError.conflict('종료된 응시에는 제출할 수 없습니다.');
          const stage = await requireNormalAttempt(manager, attempt);
          const order = attempt.submittedCount + 1;
          if (order > attempt.maxQuestionCount) throw AppError.conflict('제출 가능한 문항 수를 초과했습니다.');
          const mapping = await repository(manager, StageQuestion).findOne({
            where: { stageId: attempt.stageId, questionOrder: order }, relations: { question: true },
          });
          if (!mapping || mapping.question?.status !== 'PUBLISHED') throw AppError.unavailable('현재 문항을 찾을 수 없습니다.');
          if (mapping.questionId !== questionId) throw AppError.conflict('현재 제출 가능한 문항이 아닙니다.');
          const previous = await submissionRepo.findOneBy({ attemptId, questionId });
          if (previous) throw AppError.conflict('이미 제출한 문제입니다.');
          const choices = await repository(manager, QuestionChoice).find({ where: { questionId }, order: { baseOrder: 'ASC' } });
          const choice = choices.find(item => item.choiceId === choiceId);
          if (!choice) throw AppError.validation('해당 문제의 선택지가 아닙니다.');
          const isCorrect = Boolean(choice.isCorrect);
          const { hpBefore, hpAfter, submittedCount, correctCount, status } = transition(attempt, isCorrect);
          const passed = status === 'PASSED';
          const failed = status === 'FAILED';
          const now = status === 'IN_PROGRESS' ? null : new Date();
          await submissionRepo.save({
            submissionId, attemptId, questionId, sequenceNo: order,
            displayedChoiceOrder: choices.map(item => item.choiceId), choiceId,
            selectedPosition: choice.baseOrder, isCorrect, hpBefore, hpAfter,
          });
          Object.assign(attempt, {
            submittedCount, correctCount, finalHp: hpAfter, status,
            endReason: passed ? 'MONSTER_DEFEATED' : failed ? 'QUESTIONS_EXHAUSTED' : null,
            endedAt: now, resultSavedAt: now,
          });
          if (passed) {
            const progressRepo = repository(manager, UserStageProgress);
            let progress = await progressRepo.findOne({ where: { userId, stageId: attempt.stageId }, lock: { mode: 'pessimistic_write' } });
            if (!progress) progress = progressRepo.create({ userId, stageId: attempt.stageId, progressStatus: 'IN_PROGRESS' });
            if (progress.progressStatus !== 'PASSED') {
              const earlierPass = await attemptRepo.findOne({
                where: { userId, stageId: attempt.stageId, status: 'PASSED' },
                order: { endedAt: 'ASC', attemptNo: 'ASC' },
              });
              if (!earlierPass) {
                await grantFirstPass(manager, userId, stage, attempt);
                attempt.isFirstPass = true;
                attempt.rewardGranted = true;
              }
              progress.progressStatus = 'PASSED';
              progress.firstPassedAt = earlierPass?.endedAt || now;
              progress.firstPassAttemptId = earlierPass?.attemptId || attemptId;
              await progressRepo.save(progress);
            }
          }
          await attemptRepo.save(attempt);
          return {
            attemptId, quizId: questionId, choiceId, isCorrect,
            score: isCorrect ? 100 : 0, explanation: mapping.question.explanation,
            hpBefore, hpAfter, submittedCount, correctCount, status,
            endReason: attempt.endReason, rewardGranted: attempt.rewardGranted,
          };
        });
      } catch (error) {
        if (error?.code === '23505' || error?.driverError?.code === '23505') throw AppError.conflict('이미 처리된 제출입니다.');
        throw error;
      }
    },
  };
};

module.exports.transition = transition;
