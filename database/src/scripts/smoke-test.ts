// 엔티티 연동 검증: app_user 권한으로 실제 저장·조회·트랜잭션·제약 조건을 확인한다.
// 실행: npm run test:db  (사전: migration:run, 시드는 이 스크립트가 자동 실행)
import { randomUUID } from 'crypto';
import { QueryFailedError } from 'typeorm';
import { AppDataSource } from '../data-source';
import { seedMinimal } from './seed-minimal';
import {
  User, UserGrowth, UserWallet, UserSetting, UserCharacter, Job, Region, RegionPrerequisite, Step, StepQuestion,
  QuestionChoice, LearningAttempt, QuestionSubmission, UserStepProgress, ExpLedger, CoinLedger, Costume, UserCostume,
  ReviewItem, LearningSchedule, AiRequest,
  AttemptStatus, AttemptEndReason, ProgressStatus, ExpSourceType, CoinTransactionType, CoinReason, CoinRefType,
  CostumeAcquireType, ReviewFirstReason, AnswerResult, ScheduleType, AiRequestType, ModelTier,
} from '../entities';

type Row = { no: number; name: string; expect: string; ok: boolean; detail: string };
const results: Row[] = [];
const pgCode = (e: unknown) => (e instanceof QueryFailedError ? (e as any).driverError?.code : undefined);

async function check(no: number, name: string, expect: string, fn: () => Promise<string>) {
  try { results.push({ no, name, expect, ok: true, detail: await fn() }); }
  catch (e: any) { results.push({ no, name, expect, ok: false, detail: e?.message ?? String(e) }); }
}
async function expectReject(fn: () => Promise<unknown>, codes: string[]): Promise<string> {
  try { await fn(); } catch (e) {
    const c = pgCode(e);
    if (c && codes.includes(c)) return `거부됨 (SQLSTATE ${c})`;
    throw new Error(`다른 오류로 실패: ${c ?? ''} ${(e as Error).message}`);
  }
  throw new Error('거부되어야 하는데 저장됨');
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

async function main() {
  const ds = await AppDataSource.initialize();
  await seedMinimal();
  const step = await ds.getRepository(Step).findOneByOrFail({ stepCode: '1-1' });
  const stepQs = await ds.getRepository(StepQuestion).find({ where: { stepId: step.stepId }, order: { questionOrder: 'ASC' } });
  const correctChoice = async (questionId: string) => ds.getRepository(QuestionChoice).findOneByOrFail({ questionId, isCorrect: true });
  let userId = '';
  let attemptId = '';

  await check(1, '회원가입 (users·growth·wallet·settings)', '4개 테이블에 1행씩', async () => {
    await ds.transaction(async (tx) => {
      const u = await tx.save(User, { email: `pia+${randomUUID().slice(0, 8)}@example.com`, nickname: 'pia' });
      userId = u.userId;
      await tx.save(UserGrowth, { userId });
      await tx.save(UserWallet, { userId });
      await tx.save(UserSetting, { userId });
    });
    const g = await ds.getRepository(UserGrowth).findOneByOrFail({ userId });
    assert(g.totalLevel === 1 && g.totalExp === 0, '성장 기본값 오류');
    return `user_id=${userId.slice(0, 8)}…, 기본값 Lv.1 / 0 EXP / 0 코인`;
  });

  await check(2, '직업 선택', 'user_characters 생성 + 초기 설정 완료 기록', async () => {
    const job = await ds.getRepository(Job).findOneByOrFail({ name: '마법사' });
    await ds.transaction(async (tx) => {
      await tx.save(UserCharacter, { userId, jobId: job.jobId });
      await tx.update(User, { userId }, { initialSetupCompletedAt: new Date() });
    });
    const c = await ds.getRepository(UserCharacter).findOne({ where: { userId }, relations: { job: true } });
    return `직업=${c?.job?.name}`;
  });

  await check(3, '지역 해금 계산', '선수 지역 없는 지역만 열림', async () => {
    const regions = await ds.getRepository(Region).find({ order: { regionNo: 'ASC' } });
    const prereqs = await ds.getRepository(RegionPrerequisite).find();
    const open = regions.filter((r) => !prereqs.some((p) => p.regionId === r.regionId)).map((r) => r.title);
    assert(open.length === 1 && open[0] === '경제 기초', `열린 지역: ${open.join(',')}`);
    return `열림: ${open.join(', ')} / 잠김: ${regions.length - open.length}개`;
  });

  await check(4, '전투 응시 → 2문항 정답 → 클리어', 'attempt=passed, 진행도=passed', async () => {
    await ds.transaction(async (tx) => {
      const a = await tx.save(LearningAttempt, {
        userId, stepId: step.stepId, attemptNo: 1, maxQuestionCount: step.maxQuestionCount,
        requiredCorrectCount: step.requiredCorrectCount, initialHp: step.initialMonsterHp,
      });
      attemptId = a.attemptId;
      let hp = step.initialMonsterHp;
      for (let i = 0; i < 2; i++) {
        const q = stepQs[i];
        const c = await correctChoice(q.questionId);
        const choices = await tx.find(QuestionChoice, { where: { questionId: q.questionId }, order: { baseOrder: 'ASC' } });
        await tx.save(QuestionSubmission, {
          attemptId, questionId: q.questionId, sequenceNo: i + 1, displayedChoiceOrder: choices.map((x) => x.choiceId),
          selectedChoiceId: c.choiceId, selectedPosition: 2, isCorrect: true, hpBefore: hp, hpAfter: hp - 1,
        });
        hp -= 1;
      }
      await tx.update(LearningAttempt, { attemptId }, {
        submittedCount: 2, correctCount: 2, finalHp: 0, status: AttemptStatus.Passed,
        endReason: AttemptEndReason.MonsterDefeated, isFirstPass: true, endedAt: new Date(),
      });
      await tx.save(UserStepProgress, { userId, stepId: step.stepId, progressStatus: ProgressStatus.Passed, firstPassedAt: new Date(), firstPassAttemptId: attemptId });
    });
    const a = await ds.getRepository(LearningAttempt).findOneByOrFail({ attemptId });
    return `status=${a.status}, 정답 ${a.correctCount}/${a.submittedCount}, HP ${a.finalHp}`;
  });

  const grantReward = (tx: any) => (async () => {
    const g = await tx.findOneByOrFail(UserGrowth, { userId });
    const w = await tx.findOneByOrFail(UserWallet, { userId });
    const totalExp = g.totalExp + step.rewardTotalExp!, ecoExp = g.economyExp + step.rewardEconomyExp!;
    await tx.save(ExpLedger, {
      userId, sourceType: ExpSourceType.StepFirstClear, sourceStepId: step.stepId, attemptId,
      totalExpAmount: step.rewardTotalExp, economyExpAmount: step.rewardEconomyExp,
      totalExpAfter: totalExp, economyExpAfter: ecoExp, totalLevelAfter: 1, economyLevelAfter: 1,
    });
    await tx.update(UserGrowth, { userId }, { totalExp, economyExp: ecoExp });
    const after = w.coinBalance + step.rewardCoin!;
    await tx.save(CoinLedger, {
      userId, transactionType: CoinTransactionType.Earn, reason: CoinReason.StepFirstClear, amount: step.rewardCoin,
      balanceBefore: w.coinBalance, balanceAfter: after, refType: CoinRefType.Step, refId: step.stepId, attemptId,
    });
    await tx.update(UserWallet, { userId }, { coinBalance: after, version: w.version + 1 });
  })();

  await check(5, '최초 통과 보상 트랜잭션', 'EXP·코인 원장 기록 + 성장·지갑 증가', async () => {
    await ds.transaction((tx) => grantReward(tx));
    const g = await ds.getRepository(UserGrowth).findOneByOrFail({ userId });
    const w = await ds.getRepository(UserWallet).findOneByOrFail({ userId });
    assert(g.totalExp === 30 && g.economyExp === 20 && w.coinBalance === 50, '보상 값 불일치');
    return `전체 +${g.totalExp} EXP, 경제 +${g.economyExp} EXP, 코인 ${w.coinBalance}`;
  });

  await check(6, '같은 단계 보상 재지급', '거부 + 잔액 변화 없음', async () => {
    const r = await expectReject(() => ds.transaction((tx) => grantReward(tx)), ['23505']);
    const w = await ds.getRepository(UserWallet).findOneByOrFail({ userId });
    assert(w.coinBalance === 50, '잔액이 변함');
    return `${r}, 잔액 ${w.coinBalance} 유지`;
  });

  await check(7, '같은 문항 두 번 제출', '거부', async () => {
    const q = stepQs[0];
    const c = await correctChoice(q.questionId);
    return expectReject(() => ds.getRepository(QuestionSubmission).save({
      attemptId, questionId: q.questionId, sequenceNo: 3, displayedChoiceOrder: [c.choiceId],
      selectedChoiceId: c.choiceId, selectedPosition: 1, isCorrect: true, hpBefore: 0, hpAfter: 0,
    }), ['23505']);
  });

  await check(8, '트랜잭션 중간 오류', '전체 롤백', async () => {
    const before = await ds.getRepository(CoinLedger).countBy({ userId });
    try {
      await ds.transaction(async (tx) => {
        await tx.save(CoinLedger, {
          userId, transactionType: CoinTransactionType.Earn, reason: CoinReason.CostumePurchase, amount: 999,
          balanceBefore: 50, balanceAfter: 1049, refType: CoinRefType.Costume, refId: randomUUID(),
        });
        throw new Error('의도한 오류');
      });
    } catch { /* expected */ }
    const after = await ds.getRepository(CoinLedger).countBy({ userId });
    assert(before === after, '원장이 남음');
    return `원장 ${before}건 → ${after}건 (변화 없음)`;
  });

  await check(9, '코스튬 구매: 잔액 부족 → 충전 후 구매 → 재구매', '부족 시 거부, 구매 성공, 재구매 거부', async () => {
    const costume = await ds.getRepository(Costume).findOneByOrFail({ costumeCode: 'BLUE_DAWN_ROBE' });
    const buy = () => ds.transaction(async (tx) => {
      const w = await tx.findOneByOrFail(UserWallet, { userId });
      const after = w.coinBalance - costume.priceCoin!;
      const led = await tx.save(CoinLedger, {
        userId, transactionType: CoinTransactionType.Spend, reason: CoinReason.CostumePurchase, amount: -costume.priceCoin!,
        balanceBefore: w.coinBalance, balanceAfter: after, refType: CoinRefType.Costume, refId: costume.costumeId,
      });
      await tx.update(UserWallet, { userId }, { coinBalance: after });
      await tx.save(UserCostume, { userId, costumeId: costume.costumeId, acquireType: CostumeAcquireType.Purchase, coinLedgerId: led.coinLedgerId });
    });
    const r1 = await expectReject(buy, ['23514']);
    await ds.getRepository(UserWallet).update({ userId }, { coinBalance: 700 }); // 테스트용 충전(2회분)
    await buy();
    const w = await ds.getRepository(UserWallet).findOneByOrFail({ userId });
    const r2 = await expectReject(buy, ['23505']);
    return `잔액 부족 ${r1} / 구매 후 잔액 ${w.coinBalance} / 재구매 ${r2}`;
  });

  await check(10, '복습 노트: 오답 등록 → 같은 문제 재등록', '문제당 1행 유지, wrong_count 증가', async () => {
    const repo = ds.getRepository(ReviewItem);
    const base = { userId, questionCode: 'Q_ECO_001_1', latestQuestionId: stepQs[0].questionId, conceptCode: 'ECO_001', firstReason: ReviewFirstReason.Wrong };
    await repo.save({ ...base, wrongCount: 1, lastAnswerResult: AnswerResult.Wrong });
    const dup = await expectReject(() => repo.save({ ...base, wrongCount: 1 }), ['23505']);
    await repo.update({ userId, questionCode: 'Q_ECO_001_1' }, { wrongCount: 2 });
    const n = await repo.countBy({ userId });
    return `중복 등록 ${dup} / 행 ${n}개, wrong_count=2`;
  });

  await check(11, '학습 일정 목표 31자', '거부 (30자 제한)', async () =>
    expectReject(() => ds.getRepository(LearningSchedule).save({
      userId, targetDate: '2026-10-20', stepId: step.stepId, scheduleType: ScheduleType.Review, goalMemo: '가'.repeat(31),
    }), ['22001', '23514']));

  await check(12, '허용되지 않은 Enum 값 저장', '거부', async () =>
    expectReject(() => ds.query(`UPDATE app.users SET plan = 'vip' WHERE user_id = $1`, [userId]), ['22P02']));

  await check(13, 'AI 사용량 KST 날짜(생성 컬럼)', 'UTC 16:30 → KST 다음 날', async () => {
    const r = await ds.getRepository(AiRequest).save({ userId, requestType: AiRequestType.Tutor, modelTier: ModelTier.Basic, reservedAt: new Date('2026-10-17T16:30:00Z') });
    const saved = await ds.getRepository(AiRequest).findOneByOrFail({ requestId: r.requestId });
    assert(saved.usageDate === '2026-10-18', `usage_date=${saved.usageDate}`);
    return `reserved_at 2026-10-17T16:30Z → usage_date ${saved.usageDate}`;
  });

  await check(14, 'app_user로 테이블 삭제 시도', '권한 오류', async () =>
    expectReject(() => ds.query('DROP TABLE app.users'), ['42501']));

  await ds.destroy();

  const pass = results.filter((r) => r.ok).length;
  console.log('\n| # | 항목 | 기대 결과 | 판정 | 결과 |\n|---|---|---|---|---|');
  for (const r of results) console.log(`| ${r.no} | ${r.name} | ${r.expect} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.detail.replace(/\|/g, '/')} |`);
  console.log(`\n결과: ${pass}/${results.length} PASS`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
