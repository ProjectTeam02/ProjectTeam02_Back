/**
 * Node → FastAPI 개인화 Context(personalizedContext) 데이터 형식 파일 (#171, BE-03)
 * 기준: ProjectTeam02_AI app/schemas/tutor.py PersonalizedTutorContext (commit 8ece8c7, 운영 AI 이미지 8ece8c7befbf)
 * 백엔드 작업: BE-04·05가 만든 개인화 정보를 AI 서버 계약과 같은 키·범위로 검사하고 정리한다.
 * 주의: AI 서버는 모르는 키를 거절한다(extra="forbid"). 계약을 바꿀 때는 AI 레포를 먼저 바꾸고 SPEC을 같이 고친다.
 *       값이 계약을 벗어나면 예외를 던진다 → 튜터 서비스는 개인화 없이 기본 흐름으로 보낸다 (튜터 요청 자체는 실패시키지 않음).
 *       null·빈 배열·빈 객체는 보내지 않는다 (AI 기본값과 같음).
 */

class PersonalizationContractError extends Error {
  constructor(path, reason) {
    super(`personalizedContext.${path}: ${reason}`);
    this.name = 'PersonalizationContractError';
    this.code = 'PERSONALIZATION_INVALID';
  }
}

// 필드 규칙 (AI 레포 pydantic Field와 같은 값)
const str = (min, max, { required = false } = {}) => ({ type: 'string', min, max, required });
const num01 = () => ({ type: 'number', min: 0, max: 1 });
const int = (min, max) => ({ type: 'integer', min, max });
const bool = () => ({ type: 'boolean' });
const dateTime = () => ({ type: 'datetime' });
const list = (item, maxItems) => ({ type: 'list', item, maxItems });
const obj = fields => ({ type: 'object', fields });

const GRAPH_NODE = obj({
  conceptCode: str(1, 30, { required: true }),
  title: str(0, 255),
  relationshipType: str(1, 40),
  relationReviewStatus: str(0, 30),
  learnerConceptMastery: num01(),
  depth: int(1, 5),
});

const SPEC = obj({
  learnerProfile: obj({
    conceptCode: str(1, 30),
    accuracyRate: num01(),
    recentIncorrectCount: int(0, 10000),
    estimatedMastery: num01(),
    weaknessScore: num01(),
    lastStudiedAt: dateTime(),
    currentStageId: str(0, 255),
  }),
  misconceptionHypotheses: list(obj({
    hypothesisType: str(1, 40, { required: true }),
    status: str(1, 30),
    conceptCode: str(1, 30),
    evidenceIds: list(str(0, Number.MAX_SAFE_INTEGER), 20),
  }), 10),
  diagnosisEvidence: list(obj({
    evidenceId: str(1, 255, { required: true }),
    evidenceType: str(1, 40, { required: true }),
    reviewStatus: str(0, 30),
    questionId: str(0, 255),
    documentId: str(0, 255),
    chunkId: str(0, 255),
  }), 20),
  recentAssessments: list(obj({
    assessmentId: str(1, 255, { required: true }),
    questionId: str(0, 255),
    conceptCode: str(1, 30),
    isCorrect: bool(),
    assessedAt: dateTime(),
  }), 10),
  teachingStrategy: obj({
    strategyId: str(1, 100, { required: true }),
    strategyVersion: str(1, 50, { required: true }),
  }),
  conceptGraphContext: obj({
    currentConceptCode: str(1, 30),
    prerequisiteConcepts: list(GRAPH_NODE, 50),
    relatedConcepts: list(GRAPH_NODE, 50),
    learnerConceptMastery: { type: 'masteryMap', maxItems: 50 },
  }),
});

const isEmpty = value => value === undefined || value === null
  || (Array.isArray(value) && value.length === 0)
  || (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && Object.keys(value).length === 0);

function check(rule, value, path) {
  const fail = reason => { throw new PersonalizationContractError(path, reason); };
  switch (rule.type) {
    case 'string': {
      if (typeof value !== 'string') fail('문자열이어야 합니다');
      const text = value.trim();
      if (text.length < rule.min || text.length > rule.max) fail(`길이 ${rule.min}~${rule.max}`);
      return text;
    }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || value < rule.min || value > rule.max) fail(`${rule.min}~${rule.max} 숫자`);
      return value;
    case 'integer':
      if (!Number.isInteger(value) || value < rule.min || value > rule.max) fail(`${rule.min}~${rule.max} 정수`);
      return value;
    case 'boolean':
      if (typeof value !== 'boolean') fail('true/false');
      return value;
    case 'datetime': {
      const date = value instanceof Date ? value : new Date(value);
      if ((typeof value !== 'string' && !(value instanceof Date)) || Number.isNaN(date.getTime())) fail('날짜·시각');
      return date.toISOString();
    }
    case 'list': {
      if (!Array.isArray(value)) fail('배열이어야 합니다');
      if (value.length > rule.maxItems) fail(`최대 ${rule.maxItems}개`);
      return value.map((item, index) => check(rule.item, item, `${path}[${index}]`));
    }
    case 'masteryMap': {
      if (typeof value !== 'object' || Array.isArray(value)) fail('객체여야 합니다');
      const entries = Object.entries(value);
      if (entries.length > rule.maxItems) fail(`최대 ${rule.maxItems}개`);
      return Object.fromEntries(entries.map(([code, mastery]) => [check(str(1, 30), code, `${path}.key`), check(num01(), mastery, `${path}.${code}`)]));
    }
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value) || value instanceof Date) fail('객체여야 합니다');
      const unknown = Object.keys(value).filter(key => !(key in rule.fields));
      if (unknown.length) fail(`허용되지 않은 키 ${unknown.join(', ')}`);
      const out = {};
      for (const [key, fieldRule] of Object.entries(rule.fields)) {
        if (isEmpty(value[key])) {
          if (fieldRule.required) fail(`${key} 필수`);
          continue;
        }
        const checked = check(fieldRule, value[key], path ? `${path}.${key}` : key);
        if (isEmpty(checked) && !fieldRule.required) continue; // 안쪽 값이 모두 비어 있던 객체는 보내지 않음
        out[key] = checked;
      }
      return out;
    }
    default:
      return fail('알 수 없는 규칙');
  }
}

/** 계약에 맞게 정리한 개인화 Context. 보낼 내용이 없으면 null. 계약 위반이면 PersonalizationContractError */
function normalize(value) {
  if (isEmpty(value)) return null;
  const out = check(SPEC, value, '');
  return Object.keys(out).length ? out : null;
}

/** 계약 테스트용: 객체별 허용 키 목록 */
function allowedKeys(rule = SPEC, path = 'personalizedContext', acc = {}) {
  if (rule.type === 'object') {
    acc[path] = Object.keys(rule.fields).sort();
    for (const [key, fieldRule] of Object.entries(rule.fields)) allowedKeys(fieldRule, `${path}.${key}`, acc);
  } else if (rule.type === 'list') {
    allowedKeys(rule.item, `${path}[]`, acc);
  }
  return acc;
}

module.exports = { normalize, allowedKeys, PersonalizationContractError };
