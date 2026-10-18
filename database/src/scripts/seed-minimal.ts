// 검증용 최소 시드: 지역 2개(선수 관계 1→2), 단계 1-1, 개념 1개, 문항 3개(4지선다), 직업 1개, 코스튬 1개
// 여러 번 실행해도 같은 결과가 되도록 code 기준으로 존재하면 건너뜀
import { AppDataSource } from '../data-source';
import {
  Region, RegionPrerequisite, Step, Concept, ConceptSection, StepConcept, Question, QuestionChoice, StepQuestion,
  Job, Costume, LevelThreshold,
  PublishStatus, StepType, ConceptStatus, SectionType, GeneratedBy, QuestionStatus, JobCode, LevelScope,
} from '../entities';

export async function seedMinimal() {
  const ds = AppDataSource.isInitialized ? AppDataSource : await AppDataSource.initialize();
  return ds.transaction(async (tx) => {
    let r1 = await tx.findOneBy(Region, { regionCode: 'REG_01' });
    if (r1) return { created: false };

    r1 = await tx.save(Region, { regionCode: 'REG_01', regionNo: 1, title: '경제 기초', status: PublishStatus.Published });
    const r2 = await tx.save(Region, { regionCode: 'REG_02', regionNo: 2, title: '물가와 인플레이션', status: PublishStatus.Published });
    await tx.save(RegionPrerequisite, { regionId: r2.regionId, prerequisiteRegionId: r1.regionId });

    const step = await tx.save(Step, {
      regionId: r1.regionId, stepCode: '1-1', stepNo: 1, stepType: StepType.Normal, title: '선택과 기회비용',
      maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2, monsterName: '선택 슬라임',
      rewardTotalExp: 30, rewardEconomyExp: 20, rewardCoin: 50, status: PublishStatus.Published,
    });
    const concept = await tx.save(Concept, {
      conceptCode: 'ECO_001', regionId: r1.regionId, title: '기회비용',
      summary: '선택할 때는 포기한 가치도 봐요', status: ConceptStatus.Published,
    });
    await tx.save(ConceptSection, { conceptId: concept.conceptId, pageNo: 1, sortOrder: 1, sectionType: SectionType.Definition, title: '선택에는 기회비용이 있어요', body: '어떤 선택 때문에 포기한 대안 중 가장 큰 가치를 기회비용이라고 해요.' });
    await tx.save(StepConcept, { stepId: step.stepId, conceptId: concept.conceptId });

    for (let i = 1; i <= 3; i++) {
      const q = await tx.save(Question, {
        questionCode: `Q_ECO_001_${i}`, conceptId: concept.conceptId, questionText: `기회비용 문항 ${i}`,
        explanation: '포기한 대안 중 가장 큰 가치가 기회비용이에요.', generatedBy: GeneratedBy.Manual, status: QuestionStatus.Published,
      });
      for (let o = 1; o <= 4; o++) {
        await tx.save(QuestionChoice, { questionId: q.questionId, baseOrder: o, choiceText: ['고정비용', '기회비용', '평균비용', '매몰비용'][o - 1], isCorrect: o === 2 });
      }
      await tx.save(StepQuestion, { stepId: step.stepId, questionId: q.questionId, questionOrder: i });
    }

    await tx.save(Job, { jobCode: JobCode.Mage, name: '마법사', sortOrder: 1 });
    await tx.save(Costume, { costumeCode: 'BLUE_DAWN_ROBE', name: '푸른 새벽 로브', priceCoin: 300, isOnSale: true });
    for (const [scope, level, exp] of [[LevelScope.Account, 1, 0], [LevelScope.Account, 2, 100], [LevelScope.Economy, 1, 0], [LevelScope.Economy, 2, 100]] as const) {
      await tx.save(LevelThreshold, { scope, level, requiredExp: exp });
    }
    return { created: true };
  });
}

if (require.main === module) {
  seedMinimal()
    .then((r) => { console.log('seed', r); return AppDataSource.destroy(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
