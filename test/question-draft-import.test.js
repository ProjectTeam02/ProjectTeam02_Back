const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const schema = require('../src/modules/questions/question.schema');
const Concept = class Concept {};
const Question = class Question {};
const QuestionChoice = class QuestionChoice {};

// Stub the database package: these tests never touch local or deployed PostgreSQL.
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '@leren/database') return { Concept, Question, QuestionChoice };
  if (request === '../../config/database' && parent?.filename?.endsWith('question.service.js')) {
    return { AppDataSource: {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const questionService = require('../src/modules/questions/question.service');
Module._load = originalLoad;

const conceptId = '12345678-1234-4234-8234-123456789abc';
const draft = () => ({
  conceptId,
  questionText: ' 기회비용은 무엇일까요? ',
  explanation: '포기한 대안 중 가장 가치가 큰 것입니다.',
  difficulty: 'BEGINNER',
  sourceDocumentIds: ['bok2026-0161'],
  choices: [
    { text: '총 생산 비용', isCorrect: false },
    { text: '포기한 최선의 대안', isCorrect: true },
    { text: '물가 상승률', isCorrect: false },
    { text: '이자율', isCorrect: false },
  ],
});

function fakeDataSource({ hasConcept = true, failChoices = false, choiceError = null } = {}) {
  const events = [];
  const saved = {};
  const dataSource = {
    events,
    saved,
    async transaction(fn) {
      events.push('BEGIN');
      const manager = {
        getRepository(entity) {
          if (entity === Concept) return { async findOneBy() { return hasConcept ? { conceptId } : null; } };
          if (entity === Question) return {
            create(input) { return input; },
            async save(input) { events.push('question'); saved.question = input; return { ...input, questionId: 'generated-question-uuid' }; },
          };
          if (entity === QuestionChoice) return {
            create(input) { return input; },
            async save(inputs) {
              events.push('choices');
              assert.equal(inputs.length, 4);
              assert.deepEqual(inputs.map((item) => item.baseOrder), [1, 2, 3, 4]);
              if (failChoices) throw Error('simulated database error');
              if (choiceError) throw choiceError;
              return inputs;
            },
          };
          throw Error('unexpected entity');
        },
      };
      try {
        const result = await fn(manager);
        events.push('COMMIT');
        return result;
      } catch (error) {
        events.push('ROLLBACK');
        throw error;
      }
    },
  };
  return dataSource;
}

test('valid AI draft normalizes values and requires one correct answer', () => {
  const parsed = schema.generatedDraft({ body: draft() }).body;
  assert.equal(parsed.questionText, '기회비용은 무엇일까요?');
  assert.equal(parsed.choices.length, 4);
  assert.equal(parsed.choices.filter((c) => c.isCorrect).length, 1);
  assert.equal(parsed.choices[1].baseOrder, 2);
});

test('invalid choice count is rejected before database access', async () => {
  const input = draft(); input.choices.pop();
  const db = fakeDataSource();
  await assert.rejects(questionService(db).createGeneratedDraft(input), { code: 'VALIDATION_ERROR' });
  assert.deepEqual(db.events, []);
});

test('two correct answers or duplicate answers are rejected', () => {
  const twoCorrect = draft(); twoCorrect.choices[0].isCorrect = true;
  assert.throws(() => schema.generatedDraft({ body: twoCorrect }), { code: 'VALIDATION_ERROR' });
  const duplicate = draft(); duplicate.choices[0].text = duplicate.choices[1].text;
  assert.throws(() => schema.generatedDraft({ body: duplicate }), { code: 'VALIDATION_ERROR' });
});

test('missing source document IDs is rejected', () => {
  assert.throws(() => schema.generatedDraft({ body: { ...draft(), sourceDocumentIds: [] } }), { code: 'VALIDATION_ERROR' });
});

test('valid draft creates exactly one GENERATED question and four choices atomically', async () => {
  const db = fakeDataSource();
  const result = await questionService(db).createGeneratedDraft(draft());
  assert.equal(result.status, 'GENERATED');
  assert.equal(result.choiceCount, 4);
  assert.equal(result.questionId, 'generated-question-uuid');
  assert.equal(result.questionCode.length, 30);
  assert.deepEqual(db.events, ['BEGIN', 'question', 'choices', 'COMMIT']);
});

test('missing concept returns 404 and transaction is rolled back', async () => {
  const db = fakeDataSource({ hasConcept: false });
  await assert.rejects(questionService(db).createGeneratedDraft(draft()), { code: 'NOT_FOUND' });
  assert.deepEqual(db.events, ['BEGIN', 'ROLLBACK']);
});

test('choice write failure rolls back the question transaction', async () => {
  const db = fakeDataSource({ failChoices: true });
  await assert.rejects(questionService(db).createGeneratedDraft(draft()), /simulated database error/);
  assert.deepEqual(db.events, ['BEGIN', 'question', 'choices', 'ROLLBACK']);
});

test('#97: 500자 보기·문제 분류·학습 목표를 받아 저장한다', async () => {
  const body = { ...draft(), questionCategory: 'SCENARIO', learningObjective: '인플레이션의 의미를 설명할 수 있다' };
  body.choices = body.choices.map((choice, index) => (index === 0 ? { ...choice, text: '가'.repeat(500) } : choice));
  const db = fakeDataSource();
  await questionService(db).createGeneratedDraft(body);
  assert.equal(db.saved.question.questionCategory, 'SCENARIO');
  assert.equal(db.saved.question.learningObjective, '인플레이션의 의미를 설명할 수 있다');
});

test('#97: 501자 보기와 정의되지 않은 문제 분류는 거부한다', () => {
  const longChoice = { ...draft() };
  longChoice.choices = longChoice.choices.map((choice, index) => (index === 0 ? { ...choice, text: '가'.repeat(501) } : choice));
  assert.throws(() => schema.generatedDraft({ body: longChoice }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => schema.generatedDraft({ body: { ...draft(), questionCategory: 'QUIZ' } }), { code: 'VALIDATION_ERROR' });
});

test('#97: DB 문제 제약 위반은 503이 아니라 검증 오류로 돌려준다', async () => {
  const violation = Object.assign(new Error('duplicate key'), { driverError: { code: '23505', constraint: 'uq_question_choices_one_correct' } });
  const db = fakeDataSource({ choiceError: violation });
  await assert.rejects(questionService(db).createGeneratedDraft(draft()), { code: 'VALIDATION_ERROR' });
  assert.deepEqual(db.events, ['BEGIN', 'question', 'choices', 'ROLLBACK']);
});
