const AppError = require('../../../common/errors/AppError');

const MISCONCEPTIONS = ['KNOWLEDGE_GAP', 'RELATION_ERROR', 'CAUSAL_ERROR', 'APPLICATION_ERROR', 'UNCERTAIN'];
const ACTIONS = ['SOLVE_QUESTION', 'START_STAGE', 'REVIEW_CONCEPT', 'CONTINUE_LEARNING', 'NONE'];
const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];
const MAX_CANDIDATES = 10;
const MAX_EVIDENCE = 20;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function invalid(field) {
  const error = AppError.unavailable('AI 튜터의 진단 또는 추천을 검증할 수 없습니다.');
  error.invalidField = field;
  return error;
}

function object(value, fields, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !fields.includes(key))) throw invalid(name);
}

function string(value, max, name) {
  if (typeof value !== 'string' || !value.trim() || [...value].length > max) throw invalid(name);
  return value;
}

function uuid(value, name) {
  if (typeof value !== 'string' || !UUID.test(value)) throw invalid(name);
  return value.toLowerCase();
}

function metadata(value) {
  if (value == null) return null;
  object(value, ['schemaVersion', 'conceptCode', 'diagnosis', 'strategy'], 'tutoringMeta');
  if (value.schemaVersion !== '1.0') throw invalid('tutoringMeta.schemaVersion');
  const { diagnosis, strategy } = value;
  object(diagnosis, ['misconceptionType', 'confidence', 'evidenceQuestionIds', 'needsFollowup', 'reasoningSummary'], 'diagnosis');
  object(strategy, ['strategyId', 'strategyVersion'], 'strategy');
  const { misconceptionType, confidence, needsFollowup } = diagnosis;
  if (!MISCONCEPTIONS.includes(misconceptionType)) throw invalid('diagnosis.misconceptionType');
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw invalid('diagnosis.confidence');
  if (typeof needsFollowup !== 'boolean') throw invalid('diagnosis.needsFollowup');
  const evidence = diagnosis.evidenceQuestionIds === undefined ? [] : diagnosis.evidenceQuestionIds;
  if (!Array.isArray(evidence) || evidence.length > MAX_EVIDENCE) throw invalid('diagnosis.evidenceQuestionIds');
  const evidenceQuestionIds = evidence.map(id => uuid(id, 'diagnosis.evidenceQuestionIds'));
  if (new Set(evidenceQuestionIds).size !== evidenceQuestionIds.length) throw invalid('diagnosis.evidenceQuestionIds');
  return {
    schemaVersion: value.schemaVersion,
    conceptCode: value.conceptCode == null ? null : string(value.conceptCode, 30, 'tutoringMeta.conceptCode'),
    diagnosis: { misconceptionType, confidence, evidenceQuestionIds, needsFollowup,
      reasoningSummary: string(diagnosis.reasoningSummary, 500, 'diagnosis.reasoningSummary') },
    strategy: { strategyId: string(strategy.strategyId, 100, 'strategy.strategyId'),
      strategyVersion: string(strategy.strategyVersion, 50, 'strategy.strategyVersion') },
  };
}

function action(value) {
  if (value == null) return null;
  object(value, ['type', 'conceptCode', 'questionId', 'stageId', 'attemptId', 'reason', 'priority'], 'proposedAction');
  const { type, priority } = value;
  if (!ACTIONS.includes(type) || !PRIORITIES.includes(priority)) throw invalid('proposedAction.type/priority');
  const questionId = value.questionId == null ? null : uuid(value.questionId, 'proposedAction.questionId');
  const stageId = value.stageId == null ? null : uuid(value.stageId, 'proposedAction.stageId');
  const attemptId = value.attemptId == null ? null : uuid(value.attemptId, 'proposedAction.attemptId');
  const conceptCode = value.conceptCode == null ? null : string(value.conceptCode, 30, 'proposedAction.conceptCode');
  const validFields = {
    SOLVE_QUESTION: questionId && stageId && attemptId && conceptCode,
    START_STAGE: stageId && !questionId && !attemptId,
    REVIEW_CONCEPT: conceptCode && !questionId && !attemptId,
    CONTINUE_LEARNING: (stageId || attemptId) && !questionId,
    NONE: !questionId && !stageId && !attemptId,
  };
  if (!validFields[type]) throw invalid('proposedAction.fields');
  return { type, conceptCode, questionId, stageId, attemptId, reason: string(value.reason, 500, 'proposedAction.reason'), priority };
}

const candidateKeys = ['questionId', 'stageId', 'attemptId', 'conceptCode'];
const sameCandidate = (first, second) => candidateKeys.every(key => first[key] === second[key]);

function candidates(values) {
  if (values.length > MAX_CANDIDATES || new Set(values.map(item => item.questionId)).size !== values.length) {
    throw invalid('eligibleQuestionCandidates');
  }
  return values.map(item => ({ questionId: item.questionId, stageId: item.stageId, attemptId: item.attemptId, conceptCode: item.conceptCode }));
}

module.exports = { action, candidates, invalid, metadata, sameCandidate, MISCONCEPTIONS, ACTIONS, PRIORITIES, MAX_EVIDENCE, UUID };
