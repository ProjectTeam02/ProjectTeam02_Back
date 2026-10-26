// 검증용 최소 시드 (v3 rev.5)
// 주제 2개(선수관계 1→2), Stage 1-1, 개념 1개, 문항 3개(4지선다), 직업 3개,
// 기본 코스튬 2개(상의·하의) + 판매 코스튬 1개(상의), 레벨 기준표, 현재 약관 4종
// 여러 번 실행해도 같은 결과가 되도록 topic_code 기준으로 이미 있으면 건너뜀
import { AppDataSource } from '../data-source';
import {
  Topic, TopicPrerequisite, Stage, Concept, ConceptSection, StageConcept, Question, QuestionChoice, StageQuestion,
  CharacterClass, Costume, LevelThreshold, Terms,
  PublishStatus, StageType, ConceptStatus, SectionType, GeneratedBy, QuestionStatus, ClassCode, CostumeCategory,
  LevelScope, TermsType,
} from '../entities';

export async function seedMinimal() {
  const ds = AppDataSource.isInitialized ? AppDataSource : await AppDataSource.initialize();
  return ds.transaction(async (tx) => {
    let t1 = await tx.findOneBy(Topic, { topicCode: 'TOPIC_01' });
    if (t1) return { created: false };

    t1 = await tx.save(Topic, { topicCode: 'TOPIC_01', topicNo: 1, title: '경제 기초', status: PublishStatus.Published });
    const t2 = await tx.save(Topic, { topicCode: 'TOPIC_02', topicNo: 2, title: '물가와 인플레이션', status: PublishStatus.Published });
    await tx.save(TopicPrerequisite, { topicId: t2.topicId, prerequisiteTopicId: t1.topicId });

    const stage = await tx.save(Stage, {
      topicId: t1.topicId, stageCode: '1-1', stageNo: 1, stageType: StageType.Normal, title: '선택과 기회비용',
      maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2, monsterName: '선택 슬라임',
      rewardTotalExp: 30, rewardEconomyExp: 20, rewardCoin: 50, status: PublishStatus.Published,
    });
    const concept = await tx.save(Concept, {
      conceptCode: 'ECO_001', topicId: t1.topicId, title: '기회비용',
      summary: '선택할 때는 포기한 가치도 봐요', status: ConceptStatus.Published,
    });
    await tx.save(ConceptSection, {
      conceptId: concept.conceptId, pageNo: 1, sortOrder: 1, sectionType: SectionType.Definition,
      title: '선택에는 기회비용이 있어요', body: '어떤 선택 때문에 포기한 대안 중 가장 큰 가치를 기회비용이라고 해요.',
    });
    await tx.save(StageConcept, { stageId: stage.stageId, conceptId: concept.conceptId });

    for (let i = 1; i <= 3; i++) {
      const q = await tx.save(Question, {
        questionCode: `Q_ECO_001_${i}`, conceptId: concept.conceptId, questionText: `기회비용 문항 ${i}`,
        explanation: '포기한 대안 중 가장 큰 가치가 기회비용이에요.', generatedBy: GeneratedBy.Manual, status: QuestionStatus.Published,
      });
      for (let o = 1; o <= 4; o++) {
        await tx.save(QuestionChoice, {
          questionId: q.questionId, baseOrder: o, choiceText: ['고정비용', '기회비용', '평균비용', '매몰비용'][o - 1], isCorrect: o === 2,
        });
      }
      await tx.save(StageQuestion, { stageId: stage.stageId, questionId: q.questionId, questionOrder: i });
    }

    for (const [classCode, name, sortOrder] of [[ClassCode.Warrior, '전사', 1], [ClassCode.Mage, '마법사', 2], [ClassCode.Archer, '궁수', 3]] as const) {
      await tx.save(CharacterClass, { classCode, name, sortOrder });
    }
    // 기본 코스튬은 부위별 1개 (is_default = true), 직업과 무관
    await tx.save(Costume, { costumeCode: 'BASIC_TOP', name: '기본 상의', category: CostumeCategory.Top, isDefault: true, sortOrder: 1 });
    await tx.save(Costume, { costumeCode: 'BASIC_BOTTOM', name: '기본 하의', category: CostumeCategory.Bottom, isDefault: true, sortOrder: 2 });
    await tx.save(Costume, { costumeCode: 'BLUE_DAWN_ROBE', name: '푸른 새벽 로브', category: CostumeCategory.Top, priceCoin: 300, isOnSale: true, sortOrder: 3 });

    for (const [scope, level, exp] of [[LevelScope.Account, 1, 0], [LevelScope.Account, 2, 100], [LevelScope.Economy, 1, 0], [LevelScope.Economy, 2, 100]] as const) {
      await tx.save(LevelThreshold, { scope, level, requiredExp: exp });
    }

    const now = new Date('2026-10-01T00:00:00+09:00');
    for (const [termsType, title, isRequired] of [
      [TermsType.Service, '서비스 이용약관', true], [TermsType.Privacy, '개인정보 수집·이용 동의', true],
      [TermsType.AgeOver14, '만 14세 이상 확인', true], [TermsType.Marketing, '마케팅 정보 수신 동의', false],
    ] as const) {
      await tx.save(Terms, { termsType, version: 1, title, content: `${title} 본문 (검증용)`, isRequired, effectiveAt: now });
    }
    return { created: true };
  });
}

if (require.main === module) {
  seedMinimal()
    .then((r) => { console.log('seed', r); return AppDataSource.destroy(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
