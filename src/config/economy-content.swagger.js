const uuid = { type: 'string', format: 'uuid' };
const text = { type: 'string' };
const integer = { type: 'integer' };
const nullableText = { ...text, nullable: true };
const nullableInteger = { ...integer, nullable: true };
const boolean = { type: 'boolean' };
const emptyMessage = { ...text, description: '공개된 조회 결과가 비었을 때만 반환' };
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const array = name => ({ type: 'array', items: ref(name) });
const object = properties => ({
  type: 'object', required: Object.keys(properties).filter(key => key !== 'emptyMessage'), properties,
});

const stage = {
  stageId: uuid, topicId: uuid, stageCode: text, stageNo: integer,
  stageType: { ...text, enum: ['NORMAL', 'BOSS'] },
  title: text, description: nullableText, estimatedMinMinutes: nullableInteger,
  estimatedMaxMinutes: nullableInteger,
  progressStatus: { ...text, enum: ['NOT_STARTED', 'IN_PROGRESS', 'PASSED'], description: '로그인한 사용자의 진행 상태' },
  isUnlocked: { ...boolean, description: '로그인한 사용자가 Stage 해금 조건을 충족했는지 여부' },
};

const schemas = {
  EconomyTopic: object({
    topicId: uuid, topicCode: text, topicNo: integer, title: text, description: nullableText,
    iconKey: nullableText, mapRow: nullableInteger, mapColumn: nullableInteger,
  }),
  EconomyTopicList: object({ items: array('EconomyTopic'), emptyMessage }),
  EconomyStage: object(stage),
  EconomyStageList: object({ topic: ref('EconomyTopic'), items: array('EconomyStage'), emptyMessage }),
  EconomyStageConcept: object({
    conceptId: uuid, title: text, shortDefinition: nullableText, summary: nullableText,
    displayOrder: integer, isPrimary: boolean,
  }),
  EconomyStageDetail: object({
    ...stage, maxQuestionCount: integer, requiredCorrectCount: integer, initialMonsterHp: integer,
    monsterName: nullableText, monsterImageKey: nullableText, rewardTotalExp: nullableInteger,
    rewardEconomyExp: nullableInteger, rewardCoin: nullableInteger, concepts: array('EconomyStageConcept'), emptyMessage,
  }),
  EconomyConceptCard: object({
    sectionId: uuid, conceptId: uuid, pageNo: integer, sortOrder: integer,
    sectionType: { ...text, enum: ['INTRO', 'DEFINITION', 'EXAMPLE', 'SUMMARY', 'REMEMBER', 'QUIZ_GUIDE'] },
    title: nullableText, body: text, cardTone: { ...text, enum: ['DEFAULT', 'INFO', 'EXAMPLE', 'SUCCESS'] },
  }),
  EconomyConceptDetail: object({
    conceptId: uuid, topicId: uuid, conceptCode: text, version: integer, title: text,
    shortDefinition: nullableText, summary: nullableText, estimatedMinutes: nullableInteger,
    cards: array('EconomyConceptCard'), emptyMessage,
  }),
};

const error = description => ({
  description, content: { 'application/json': { schema: ref('Error') } },
});

function read(summary, description, schema, id) {
  return { get: {
    tags: ['Economy Content'], summary, description, security: [{ bearerAuth: [] }],
    ...(id ? { parameters: [{ name: id, in: 'path', required: true, schema: uuid }] } : {}),
    responses: {
      200: { description: '정상 조회 (빈 결과 포함)', content: { 'application/json': {
        schema: object({ success: boolean, data: ref(schema) }),
      } } },
      401: error('인증이 없거나 세션이 유효하지 않음'),
      ...(id ? { 404: error('리소스가 없거나 공개되지 않음') } : {}),
      422: error('잘못된 UUID 또는 지원하지 않는 조회 조건'),
      503: error('데이터베이스 조회 실패'),
    },
  } };
}

module.exports = {
  schemas,
  paths: {
    '/api/v1/topics': read('경제 학습 주제 목록', '공개 주제를 topicNo 순으로 조회합니다.', 'EconomyTopicList'),
    '/api/v1/topics/{topicId}/stages': read('주제별 Stage 목록', '공개 Stage를 stageNo 순으로 조회합니다. 진행 상태와 해금 여부는 로그인한 사용자 기준입니다.', 'EconomyStageList', 'topicId'),
    '/api/v1/stages/{stageId}': read('Stage 상세', '공개 Stage와 연결된 공개 개념을 displayOrder 순으로 조회합니다.', 'EconomyStageDetail', 'stageId'),
    '/api/v1/concepts/{conceptId}': read('개념 상세 및 학습 카드', '공개 개념의 카드를 pageNo, sortOrder 순으로 조회합니다. EXAMPLE과 SUMMARY 카드의 body에 각각 실생활 예시와 핵심 요약을 담습니다.', 'EconomyConceptDetail', 'conceptId'),
  },
};
