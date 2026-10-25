// 엔티티 연동 검증 (v3 rev.5): app_user 권한으로 엔티티를 통해 실제 저장·조회·트랜잭션·제약을 확인한다.
// 실행: npm run test:db  (사전: migration:run, 시드는 이 스크립트가 자동 실행)
// SQL 제약 테스트 43개는 db/test/v3_constraint_test.sql (빈 DB에서 psql로 실행)
import { randomUUID } from 'crypto';
import { EntityManager, QueryFailedError } from 'typeorm';
import { AppDataSource } from '../data-source';
import { seedMinimal } from './seed-minimal';
import {
  User, UserGrowth, UserWallet, UserSetting, Terms, UserTermsAgreement, UserCharacter, CharacterClass, Costume, UserCostume,
  UserEquippedCostume, Topic, TopicPrerequisite, Stage, StageQuestion, QuestionChoice, LearningAttempt, QuestionSubmission,
  UserStageProgress, ExpLedger, CoinLedger, ReviewItem, ReviewAttempt, ReviewSubmission, StudyPlan, AiConversation, AiMessage, AiRequest,
  AccountStatus, AttemptStatus, AttemptEndReason, AttemptMode, ProgressStatus, ExpSourceType, CoinTransactionType, CoinReason, CoinRefType,
  CostumeAcquireType, CostumeCategory, ClassCode, ReviewFirstReason, AnswerResult, ReviewAttemptType, ReviewEntryPoint, ReviewAttemptStatus,
  PlanType, AiRequestType, ModelTier, MessageRole, MessageStatus, MessageInputType,
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
  const stage = await ds.getRepository(Stage).findOneByOrFail({ stageCode: '1-1' });
  const stageQs = await ds.getRepository(StageQuestion).find({ where: { stageId: stage.stageId }, order: { questionOrder: 'ASC' } });
  const correctChoice = (questionId: string) => ds.getRepository(QuestionChoice).findOneByOrFail({ questionId, isCorrect: true });
  const choicesOf = (tx: EntityManager, questionId: string) => tx.find(QuestionChoice, { where: { questionId }, order: { baseOrder: 'ASC' } });
  let userId = '';
  let attemptId = '';

  await check(1, '회원가입 (users·growth·wallet·settings + 필수 약관 동의)', '5개 테이블 저장, 필수 약관 3개 동의', async () => {
    await ds.transaction(async (tx) => {
      const u = await tx.save(User, { email: `pia+${randomUUID().slice(0, 8)}@example.com`, nickname: 'pia' });
      userId = u.userId;
      await tx.save(UserGrowth, { userId });
      await tx.save(UserWallet, { userId });
      await tx.save(UserSetting, { userId });
      const terms = await tx.find(Terms, { where: { isRequired: true } });
      assert(terms.length === 3, `필수 약관 ${terms.length}개`);
      await tx.save(UserTermsAgreement, terms.map((t) => ({ userId, termsId: t.termsId, agreed: true })));
    });
    const s = await ds.getRepository(UserSetting).findOneByOrFail({ userId });
    const n = await ds.getRepository(UserTermsAgreement).countBy({ userId, agreed: true });
    assert(s.timezone === 'Asia/Seoul', '시간대 기본값 오류');
    return `user_id=${userId.slice(0, 8)}…, 동의 ${n}건, 시간대 ${s.timezone}`;
  });

  await check(2, '온보딩: 직업 선택 → 기본 코스튬 지급 → 부위별 장착', '상의·하의 각 1개 장착', async () => {
    await ds.transaction(async (tx) => {
      const mage = await tx.findOneByOrFail(CharacterClass, { classCode: ClassCode.Mage });
      await tx.save(UserCharacter, { userId, classId: mage.classId });
      const defaults = await tx.find(Costume, { where: { isDefault: true } });
      await tx.save(UserCostume, defaults.map((c) => ({ userId, itemId: c.itemId, acquireType: CostumeAcquireType.Default })));
      await tx.save(UserEquippedCostume, defaults.map((c) => ({ userId, category: c.category, itemId: c.itemId })));
      await tx.update(User, { userId }, { onboardingCompletedAt: new Date() });
    });
    const ch = await ds.getRepository(UserCharacter).findOneOrFail({ where: { userId }, relations: { characterClass: true } });
    const eq = await ds.getRepository(UserEquippedCostume).find({ where: { userId }, relations: { costume: true, ownedCostume: true }, order: { category: 'DESC' } });
    assert(eq.length === 2 && eq.every((e) => e.ownedCostume && e.costume?.category === e.category), '장착 관계 조회 오류');
    return `직업=${ch.characterClass?.name}, 장착=${eq.map((e) => `${e.category}:${e.costume?.name}`).join(', ')}`;
  });

  await check(3, '보유하지 않은 코스튬 장착', '거부 (복합 FK)', async () => {
    const robe = await ds.getRepository(Costume).findOneByOrFail({ costumeCode: 'BLUE_DAWN_ROBE' });
    return expectReject(() => ds.getRepository(UserEquippedCostume).upsert(
      { userId, category: CostumeCategory.Top, itemId: robe.itemId }, ['userId', 'category']), ['23503']);
  });

  await check(4, '주제 해금 계산', '선수 주제 없는 주제만 열림', async () => {
    const topics = await ds.getRepository(Topic).find({ order: { topicNo: 'ASC' } });
    const prereqs = await ds.getRepository(TopicPrerequisite).find();
    const open = topics.filter((t) => !prereqs.some((p) => p.topicId === t.topicId)).map((t) => t.title);
    assert(open.length === 1 && open[0] === '경제 기초', `열린 주제: ${open.join(',')}`);
    return `열림: ${open.join(', ')} / 잠김: ${topics.length - open.length}개`;
  });

  await check(5, '응시 시작 → 같은 Stage 두 번째 진행 중 응시', '두 번째는 거부 (부분 유니크)', async () => {
    const a = await ds.getRepository(LearningAttempt).save({
      userId, stageId: stage.stageId, attemptNo: 1, mode: AttemptMode.Start, maxQuestionCount: stage.maxQuestionCount,
      requiredCorrectCount: stage.requiredCorrectCount, initialHp: stage.initialMonsterHp,
    });
    attemptId = a.attemptId;
    const r = await expectReject(() => ds.getRepository(LearningAttempt).save({
      userId, stageId: stage.stageId, attemptNo: 2, mode: AttemptMode.Retry, maxQuestionCount: 3, requiredCorrectCount: 2, initialHp: 2,
    }), ['23505']);
    return `attempt_id=${attemptId.slice(0, 8)}…, ${a.status} / 두 번째 ${r}`;
  });

  const submissionIds: string[] = [];
  await check(6, '2문항 정답 → 통과 (앱이 만든 submissionId 저장)', 'attempt=PASSED, 진행도=PASSED', async () => {
    await ds.transaction(async (tx) => {
      let hp = stage.initialMonsterHp;
      for (let i = 0; i < 2; i++) {
        const q = stageQs[i];
        const c = await correctChoice(q.questionId);
        const sid = randomUUID();
        submissionIds.push(sid);
        await tx.insert(QuestionSubmission, {
          submissionId: sid, attemptId, questionId: q.questionId, sequenceNo: i + 1,
          displayedChoiceOrder: (await choicesOf(tx, q.questionId)).map((x) => x.choiceId),
          choiceId: c.choiceId, selectedPosition: 2, isCorrect: true, hpBefore: hp, hpAfter: hp - 1,
        });
        hp -= 1;
      }
      await tx.update(LearningAttempt, { attemptId }, {
        submittedCount: 2, correctCount: 2, finalHp: 0, status: AttemptStatus.Passed,
        endReason: AttemptEndReason.MonsterDefeated, isFirstPass: true, endedAt: new Date(),
      });
      await tx.save(UserStageProgress, { userId, stageId: stage.stageId, progressStatus: ProgressStatus.Passed, firstPassedAt: new Date(), firstPassAttemptId: attemptId });
    });
    const a = await ds.getRepository(LearningAttempt).findOneByOrFail({ attemptId });
    const sub = await ds.getRepository(QuestionSubmission).findOneOrFail({ where: { submissionId: submissionIds[0] }, relations: { choice: true } });
    return `status=${a.status}, 정답 ${a.correctCount}/${a.submittedCount}, 선택지 관계 조회=${sub.choice?.choiceText}`;
  });

  await check(7, '같은 submissionId 재제출', '거부 (PK 중복 → 기존 결과 반환 근거)', async () => {
    const q = stageQs[2];
    const c = await correctChoice(q.questionId);
    return expectReject(() => ds.getRepository(QuestionSubmission).insert({
      submissionId: submissionIds[0], attemptId, questionId: q.questionId, sequenceNo: 3, displayedChoiceOrder: [c.choiceId],
      choiceId: c.choiceId, selectedPosition: 1, isCorrect: true, hpBefore: 0, hpAfter: 0,
    }), ['23505']);
  });

  await check(8, '다른 문항의 선택지로 제출', '거부 (복합 FK)', async () => {
    const other = await correctChoice(stageQs[1].questionId);
    return expectReject(() => ds.getRepository(QuestionSubmission).insert({
      submissionId: randomUUID(), attemptId, questionId: stageQs[2].questionId, sequenceNo: 3, displayedChoiceOrder: [other.choiceId],
      choiceId: other.choiceId, selectedPosition: 1, isCorrect: false, hpBefore: 0, hpAfter: 0,
    }), ['23503']);
  });

  const grantReward = async (tx: EntityManager) => {
    const g = await tx.findOneByOrFail(UserGrowth, { userId });
    const w = await tx.findOneByOrFail(UserWallet, { userId });
    const totalExp = g.totalExp + (stage.rewardTotalExp ?? 0), ecoExp = g.economyExp + (stage.rewardEconomyExp ?? 0);
    await tx.save(ExpLedger, {
      userId, sourceType: ExpSourceType.StageFirstClear, sourceStageId: stage.stageId, attemptId,
      totalExpAmount: stage.rewardTotalExp ?? 0, economyExpAmount: stage.rewardEconomyExp ?? 0,
      totalExpAfter: totalExp, economyExpAfter: ecoExp, totalLevelAfter: 1, economyLevelAfter: 1,
    });
    await tx.update(UserGrowth, { userId }, { totalExp, economyExp: ecoExp });
    const after = w.coinBalance + (stage.rewardCoin ?? 0);
    await tx.save(CoinLedger, {
      userId, transactionType: CoinTransactionType.Earn, reason: CoinReason.StageFirstClear, amount: stage.rewardCoin ?? 0,
      balanceBefore: w.coinBalance, balanceAfter: after, refType: CoinRefType.Stage, refId: stage.stageId, attemptId,
    });
    await tx.update(UserWallet, { userId }, { coinBalance: after, version: w.version + 1 });
  };

  await check(9, '최초 통과 보상 트랜잭션', 'EXP·코인 원장 기록 + 성장·지갑 증가', async () => {
    await ds.transaction((tx) => grantReward(tx));
    const g = await ds.getRepository(UserGrowth).findOneByOrFail({ userId });
    const w = await ds.getRepository(UserWallet).findOneByOrFail({ userId });
    assert(g.totalExp === 30 && g.economyExp === 20 && w.coinBalance === 50, '보상 값 불일치');
    return `전체 +${g.totalExp} EXP, 경제 +${g.economyExp} EXP, 코인 ${w.coinBalance}`;
  });

  await check(10, '같은 Stage 보상 재지급', '거부 + 잔액 변화 없음', async () => {
    const r = await expectReject(() => ds.transaction((tx) => grantReward(tx)), ['23505']);
    const w = await ds.getRepository(UserWallet).findOneByOrFail({ userId });
    assert(w.coinBalance === 50, '잔액이 변함');
    return `${r}, 잔액 ${w.coinBalance} 유지`;
  });

  await check(11, '트랜잭션 중간 오류', '전체 롤백', async () => {
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

  await check(12, '코스튬 구매 → 같은 requestId 재요청 → 구매한 상의로 교체 장착', '부족 시 거부, 구매 성공, 재요청 거부, 상의 행 1개 유지', async () => {
    const robe = await ds.getRepository(Costume).findOneByOrFail({ costumeCode: 'BLUE_DAWN_ROBE' });
    const requestId = randomUUID();
    const buy = () => ds.transaction(async (tx) => {
      const w = await tx.findOneByOrFail(UserWallet, { userId });
      const after = w.coinBalance - robe.priceCoin!;
      const led = await tx.save(CoinLedger, {
        userId, transactionType: CoinTransactionType.Spend, reason: CoinReason.CostumePurchase, amount: -robe.priceCoin!,
        balanceBefore: w.coinBalance, balanceAfter: after, refType: CoinRefType.Costume, refId: robe.itemId, requestId,
      });
      await tx.update(UserWallet, { userId }, { coinBalance: after, version: w.version + 1 });
      await tx.save(UserCostume, { userId, itemId: robe.itemId, acquireType: CostumeAcquireType.Purchase, coinLedgerId: led.coinLedgerId });
    });
    const r1 = await expectReject(buy, ['23514']);
    await ds.getRepository(UserWallet).update({ userId }, { coinBalance: 700 }); // 테스트용 충전
    await buy();
    const r2 = await expectReject(buy, ['23505']);
    await ds.getRepository(UserEquippedCostume).upsert({ userId, category: robe.category, itemId: robe.itemId, equippedAt: new Date() }, ['userId', 'category']);
    const tops = await ds.getRepository(UserEquippedCostume).find({ where: { userId, category: CostumeCategory.Top }, relations: { costume: true } });
    const w = await ds.getRepository(UserWallet).findOneByOrFail({ userId });
    assert(tops.length === 1 && tops[0].itemId === robe.itemId, '교체 장착 실패');
    return `잔액 부족 ${r1} / 구매 후 잔액 ${w.coinBalance} / 재요청 ${r2} / 상의=${tops[0].costume?.name}`;
  });

  let reviewItemId = '';
  await check(13, '오답 등록 → 같은 문제 재등록 → 북마크', '문제당 1행 유지', async () => {
    const repo = ds.getRepository(ReviewItem);
    const base = { userId, questionCode: 'Q_ECO_001_1', latestQuestionId: stageQs[0].questionId, conceptCode: 'ECO_001', firstReason: ReviewFirstReason.Wrong };
    const item = await repo.save({ ...base, wrongCount: 1, lastAnswerResult: AnswerResult.Wrong, sourceStageId: stage.stageId });
    reviewItemId = item.reviewItemId;
    const dup = await expectReject(() => repo.insert({ ...base, wrongCount: 1 }), ['23505']);
    await repo.update({ reviewItemId }, { wrongCount: 2, isBookmarked: true, bookmarkedAt: new Date() });
    const n = await repo.countBy({ userId });
    return `중복 등록 ${dup} / 행 ${n}개, wrong_count=2, 북마크=true`;
  });

  await check(14, '복습: 시작 시 답안 행 미리 발급 → 제출', 'submissionId로 UPDATE, 전투·HP 없음', async () => {
    const q = stageQs[0];
    const c = await correctChoice(q.questionId);
    let sid = '';
    let raId = '';
    await ds.transaction(async (tx) => {
      const ra = await tx.save(ReviewAttempt, { userId, reviewType: ReviewAttemptType.Single, entryPoint: ReviewEntryPoint.ReviewNote, conceptCode: 'ECO_001', questionCount: 1 });
      raId = ra.reviewAttemptId;
      const s = await tx.save(ReviewSubmission, {
        reviewAttemptId: raId, reviewItemId, questionId: q.questionId, sequenceNo: 1,
        displayedChoiceOrder: (await choicesOf(tx, q.questionId)).map((x) => x.choiceId),
      });
      sid = s.submissionId;
    });
    await ds.transaction(async (tx) => {
      await tx.update(ReviewSubmission, { submissionId: sid }, { choiceId: c.choiceId, isCorrect: true, submittedAt: new Date() });
      await tx.update(ReviewAttempt, { reviewAttemptId: raId }, { submittedCount: 1, correctCount: 1, status: ReviewAttemptStatus.Completed, completedAt: new Date() });
      await tx.update(ReviewItem, { reviewItemId }, { lastAnswerResult: AnswerResult.Correct, lastAnsweredAt: new Date() });
    });
    const s = await ds.getRepository(ReviewSubmission).findOneOrFail({ where: { submissionId: sid }, relations: { choice: true, reviewAttempt: true } });
    return `submission_id=${sid.slice(0, 8)}…, 선택=${s.choice?.choiceText}, 복습 ${s.reviewAttempt?.status}`;
  });

  await check(15, '학습 일정 제목 31자', '거부 (1~30자)', async () =>
    expectReject(() => ds.getRepository(StudyPlan).save({
      userId, scheduledDate: '2026-10-30', stageId: stage.stageId, planType: PlanType.Review, title: '가'.repeat(31),
    }), ['22001', '23514']));

  await check(16, '허용되지 않은 Enum 값 (소문자)', '거부', async () =>
    expectReject(() => ds.query(`UPDATE app.users SET plan = 'free' WHERE user_id = $1`, [userId]), ['22P02']));

  await check(17, 'AI 멀티턴 한 턴: 예약 → 질문 → 답변 대기', 'usage_date KST, 답변 대기 1개·clientMessageId 중복 거부', async () => {
    const clientMessageId = randomUUID();
    let convId = '';
    await ds.transaction(async (tx) => {
      const conv = await tx.save(AiConversation, { userId, contextStageId: stage.stageId });
      convId = conv.conversationId;
      const req = await tx.save(AiRequest, { userId, conversationId: convId, requestType: AiRequestType.Tutor, modelTier: ModelTier.Basic, reservedAt: new Date('2026-10-17T16:30:00Z') });
      const q = await tx.save(AiMessage, { conversationId: convId, sequenceNo: 1, role: MessageRole.User, inputType: MessageInputType.Typed, clientMessageId, content: '기회비용이 뭐야?', status: MessageStatus.Completed, requestId: req.requestId });
      await tx.save(AiMessage, { conversationId: convId, parentMessageId: q.messageId, sequenceNo: 2, role: MessageRole.Assistant, content: '', requestId: req.requestId });
    });
    const req = await ds.getRepository(AiRequest).findOneByOrFail({ conversationId: convId });
    assert(req.usageDate === '2026-10-18', `usage_date=${req.usageDate}`);
    const r1 = await expectReject(() => ds.getRepository(AiMessage).insert({ conversationId: convId, sequenceNo: 3, role: MessageRole.Assistant, content: '' }), ['23505']);
    const r2 = await expectReject(() => ds.getRepository(AiMessage).insert({ conversationId: convId, sequenceNo: 3, role: MessageRole.User, clientMessageId, content: '재전송', status: MessageStatus.Completed }), ['23505']);
    return `usage_date ${req.usageDate} / 두 번째 대기 답변 ${r1} / 같은 clientMessageId ${r2}`;
  });

  await check(18, '회원 탈퇴', '시각 없이 상태만 바꾸면 거부, 탈퇴 처리 후 같은 이메일 재가입 가능', async () => {
    const u = await ds.getRepository(User).findOneByOrFail({ userId });
    const r = await expectReject(() => ds.getRepository(User).update({ userId }, { accountStatus: AccountStatus.Withdrawn }), ['23514']);
    await ds.getRepository(User).update({ userId }, {
      accountStatus: AccountStatus.Withdrawn, withdrawnAt: new Date(), withdrawalReason: '테스트', email: null, passwordHash: null, nickname: '탈퇴회원',
    });
    const again = await ds.getRepository(User).save({ email: u.email, nickname: 'pia2' });
    await ds.getRepository(User).update({ userId: again.userId }, { accountStatus: AccountStatus.Withdrawn, withdrawnAt: new Date(), email: null });
    return `${r} / 탈퇴 후 재가입 user_id=${again.userId.slice(0, 8)}…`;
  });

  await check(19, 'app_user로 테이블 삭제 시도', '권한 오류', async () =>
    expectReject(() => ds.query('DROP TABLE app.users'), ['42501']));

  await ds.destroy();

  const pass = results.filter((r) => r.ok).length;
  console.log('\n| # | 항목 | 기대 결과 | 판정 | 결과 |\n|---|---|---|---|---|');
  for (const r of results) console.log(`| ${r.no} | ${r.name} | ${r.expect} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.detail.replace(/\|/g, '/')} |`);
  console.log(`\n결과: ${pass}/${results.length} PASS`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
