const assert = require('node:assert/strict');
const test = require('node:test');
const { randomBytes, randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const config = process.env.LEREN_ECONOMY_PG_TEST_CONFIG;

test('economy content API against isolated PostgreSQL', { skip: !config, timeout: 120000 }, async t => {
  const { name, port, password } = JSON.parse(config);
  assert.match(name, /^leren-economy-it-[0-9a-f]{8}$/);
  const [container] = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }));
  assert.equal(container.Config.Labels['codex.purpose'], 'leren-economy-content-integration');
  assert.equal(container.HostConfig.Tmpfs['/var/lib/postgresql'], 'rw');
  assert.equal(container.HostConfig.AutoRemove, true);
  assert.deepEqual(container.NetworkSettings.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: String(port) }]);

  const E = require('@leren/database');
  const env = require('../../src/config/env');
  const db = E.AppDataSource;
  const oldOptions = { ...db.options };
  const oldSecret = env.jwtAccessSecret;
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db.isInitialized) await db.destroy();
    db.setOptions(oldOptions);
    env.jwtAccessSecret = oldSecret;
  });
  db.setOptions({
    host: '127.0.0.1', port, username: 'postgres', password, database: 'leren_economy_it',
    ssl: false, synchronize: false, migrationsRun: false, logging: false,
    migrations: [path.resolve(__dirname, '../../database/dist/migrations/*.js')],
    extra: { options: '-c search_path=app,account,character,content,learning,reward,review,tutor,public' },
  });
  await db.initialize();
  assert.equal((await db.query('SELECT current_database() AS name'))[0].name, 'leren_economy_it');
  assert.equal((await db.query("SELECT to_regclass('content.topics') AS existing"))[0].existing, null);
  await db.query('CREATE SCHEMA app');
  await db.runMigrations();
  env.jwtAccessSecret = randomBytes(32).toString('hex');

  const save = (entity, data) => db.getRepository(entity).save(data);
  const { issueAccessToken } = require('../../src/common/utils/token.util');
  async function learner(nickname) {
    const user = await save(E.User, { nickname });
    const session = await save(E.UserSession, {
      userId: user.userId, refreshTokenHash: randomBytes(32).toString('hex'),
      loginMethod: 'EMAIL', expiresAt: new Date(Date.now() + 3600000),
    });
    return { id: user.userId, token: issueAccessToken(user, session.sessionId) };
  }
  const owner = await learner('catalog owner');
  const other = await learner('catalog other');
  server = await require('../helpers/listen-test-server')(require('../../src/app'));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, route, token) => {
    const response = await fetch(base + route, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { status: response.status, body: await response.json() };
  };
  const read = (route, token = owner.token) => request('GET', route, token);
  const stagesPath = id => `/api/v1/topics/${id}/stages`;
  const stagePath = id => `/api/v1/stages/${id}`;
  const conceptPath = id => `/api/v1/concepts/${id}`;
  const startQuiz = id => request('POST', `/api/v1/quizzes/stages/${id}/attempts`, owner.token);
  const topicsPath = '/api/v1/topics';

  await t.test('an empty database returns an authenticated HTTP 200 with an empty topic list', async () => {
    assert.deepEqual(await read(topicsPath), {
      status: 200, body: { success: true, data: { items: [], emptyMessage: '아직 등록된 경제 학습 주제가 없습니다.' } },
    });
  });

  const topic = (topicNo, status) => save(E.Topic, {
    topicCode: `IT-${topicNo}`, topicNo, title: `테스트 주제 ${topicNo}`, status,
  });
  const makeStage = (topicId, stageNo, stageCode, status = 'PUBLISHED') => save(E.Stage, {
    topicId, stageNo, stageCode, status, title: `테스트 Stage ${stageNo}`, stageType: 'NORMAL',
    maxQuestionCount: 3, requiredCorrectCount: 2, initialMonsterHp: 2,
  });
  const makeConcept = (topicId, conceptCode, status = 'PUBLISHED') => save(E.Concept, {
    topicId, conceptCode, status, title: '기회비용', shortDefinition: '포기한 대안의 가치', summary: '선택의 비용을 비교합니다.',
  });

  const empty = await topic(2, 'PUBLISHED');
  const visible = await topic(1, 'PUBLISHED');
  const hidden = await topic(3, 'DRAFT');
  const advanced = await topic(4, 'PUBLISHED');
  const second = await makeStage(visible.topicId, 2, 'IT-1-2');
  const first = await makeStage(visible.topicId, 1, 'IT-1-1');
  const draft = await makeStage(visible.topicId, 3, 'IT-1-3', 'DRAFT');
  const underHidden = await makeStage(hidden.topicId, 1, 'IT-3-1');
  const advancedFirst = await makeStage(advanced.topicId, 1, 'IT-4-1');
  const boss = await save(E.Stage, {
    topicId: visible.topicId, stageNo: 4, stageCode: 'IT-1-BOSS', stageType: 'BOSS',
    title: '테스트 BOSS', status: 'PUBLISHED', maxQuestionCount: 5, requiredCorrectCount: 4, initialMonsterHp: 4,
  });
  await save(E.TopicPrerequisite, { topicId: advanced.topicId, prerequisiteTopicId: visible.topicId });
  const concept = await makeConcept(visible.topicId, 'IT-OPPORTUNITY');
  const emptyConcept = await makeConcept(visible.topicId, 'IT-NO-CARDS');
  const draftConcept = await makeConcept(visible.topicId, 'IT-DRAFT', 'REVIEW_PENDING');
  const conceptUnderHidden = await makeConcept(hidden.topicId, 'IT-HIDDEN');
  for (const entry of [concept, draftConcept, conceptUnderHidden]) {
    await save(E.StageConcept, { stageId: first.stageId, conceptId: entry.conceptId });
  }
  await save(E.StageConcept, { stageId: boss.stageId, conceptId: emptyConcept.conceptId, displayOrder: 2, isPrimary: false });
  await save(E.StageConcept, { stageId: boss.stageId, conceptId: concept.conceptId, displayOrder: 1, isPrimary: true });
  for (const [pageNo, sortOrder, sectionType, body] of [
    [2, 1, 'SUMMARY', '선택할 때 포기한 가치를 함께 봅니다.'],
    [1, 2, 'EXAMPLE', '버스를 타면 택시를 탈 때 절약할 수 있는 시간을 포기합니다.'],
    [1, 1, 'DEFINITION', '선택 때문에 포기한 가장 가치 있는 대안입니다.'],
  ]) {
    await save(E.ConceptSection, { conceptId: concept.conceptId, pageNo, sortOrder, sectionType, body });
  }
  await save(E.UserStageProgress, {
    userId: other.id, stageId: first.stageId, progressStatus: 'PASSED', contentPosition: 2,
  });
  await save(E.UserStageProgress, { userId: other.id, stageId: boss.stageId, progressStatus: 'PASSED' });

  await t.test('public lists are sorted, empty children are 200, and Stage links only visible concepts', async () => {
    const topics = await read(topicsPath);
    assert.equal(topics.status, 200);
    assert.deepEqual(topics.body.data.items.map(row => row.topicId), [visible.topicId, empty.topicId, advanced.topicId]);
    assert.equal('emptyMessage' in topics.body.data, false);
    const stages = await read(stagesPath(visible.topicId));
    assert.equal(stages.status, 200);
    assert.deepEqual(stages.body.data.items.map(row => row.stageId), [first.stageId, second.stageId, boss.stageId]);
    const noStages = await read(stagesPath(empty.topicId));
    assert.equal(noStages.status, 200);
    assert.deepEqual(noStages.body.data.items, []);
    assert.ok(noStages.body.data.emptyMessage);
    const detail = await read(stagePath(first.stageId));
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.data.concepts.map(row => row.conceptId), [concept.conceptId]);
    const noConcepts = await read(stagePath(second.stageId));
    assert.equal(noConcepts.status, 200);
    assert.deepEqual(noConcepts.body.data.concepts, []);
    assert.ok(noConcepts.body.data.emptyMessage);
  });

  await t.test('a BOSS Stage returns multiple published concepts in their display order', async () => {
    const detail = await read(stagePath(boss.stageId));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.stageType, 'BOSS');
    assert.deepEqual(detail.body.data.concepts.map(({ conceptId, displayOrder, isPrimary }) =>
      [conceptId, displayOrder, isPrimary]), [[concept.conceptId, 1, true], [emptyConcept.conceptId, 2, false]]);
  });

  await t.test('three concept cards are ordered by page and in-page order', async () => {
    const result = await read(conceptPath(concept.conceptId));
    assert.equal(result.status, 200);
    const cards = result.body.data.cards;
    assert.deepEqual(cards.map(card => [card.pageNo, card.sortOrder, card.sectionType]), [
      [1, 1, 'DEFINITION'], [1, 2, 'EXAMPLE'], [2, 1, 'SUMMARY'],
    ]);
    assert.ok(cards.every(card => card.conceptId === concept.conceptId && card.sectionId && card.body));
    assert.equal('emptyMessage' in result.body.data, false);
    const blank = await read(conceptPath(emptyConcept.conceptId));
    assert.equal(blank.status, 200);
    assert.deepEqual(blank.body.data.cards, []);
    assert.ok(blank.body.data.emptyMessage);
  });

  await t.test('authenticated Stage responses scope progress and unlocking to the current user', async () => {
    for (const token of [null, 'invalid-token']) {
      for (const route of [topicsPath, stagesPath(visible.topicId), stagePath(first.stageId), conceptPath(concept.conceptId)]) {
        assert.equal((await read(route, token)).status, 401);
      }
    }
    for (const [token, progressStatus, nextUnlocked] of [[owner.token, 'NOT_STARTED', false], [other.token, 'PASSED', true]]) {
      const list = await read(stagesPath(visible.topicId), token);
      assert.equal(list.status, 200);
      assert.equal(list.body.data.items[0].progressStatus, progressStatus);
      assert.equal(list.body.data.items[1].isUnlocked, nextUnlocked);
      const detail = await read(stagePath(first.stageId), token);
      assert.equal(detail.body.data.progressStatus, progressStatus);
      assert.equal(detail.body.data.isUnlocked, true);
      assert.equal('userId' in detail.body.data, false);
      assert.equal('contentPosition' in detail.body.data, false);
      for (const stage of [second, advancedFirst]) {
        const next = await read(stagePath(stage.stageId), token);
        assert.equal(next.status, 200);
        assert.equal(next.body.data.isUnlocked, nextUnlocked);
      }
    }
    assert.equal((await read(stagePath(boss.stageId), other.token)).body.data.isUnlocked, true);
    assert.equal((await read(`${stagePath(first.stageId)}?userId=${other.id}`)).status, 422);
  });

  await t.test('topic, stage, and concept IDs lead to a real normal Stage Quiz attempt', async () => {
    const topics = await read(topicsPath);
    assert.equal(topics.status, 200);
    const selectedTopic = topics.body.data.items[0];
    const stages = await read(stagesPath(selectedTopic.topicId));
    assert.equal(stages.status, 200);
    const selectedStage = stages.body.data.items[0];
    assert.equal(selectedStage.topicId, selectedTopic.topicId);
    assert.equal(selectedStage.isUnlocked, true);
    const stage = await read(stagePath(selectedStage.stageId));
    assert.equal(stage.status, 200);
    assert.equal(stage.body.data.stageId, selectedStage.stageId);
    const cards = await read(conceptPath(stage.body.data.concepts[0].conceptId));
    assert.equal(cards.status, 200);
    assert.equal(cards.body.data.conceptId, concept.conceptId);
    assert.equal(cards.body.data.topicId, selectedTopic.topicId);

    const stageId = stage.body.data.stageId;
    assert.equal((await startQuiz(stageId)).status, 503);
    const rewards = { rewardTotalExp: 30, rewardEconomyExp: 20, rewardCoin: 10 };
    await db.getRepository(E.Stage).update({ stageId }, rewards);
    assert.equal((await startQuiz(stageId)).status, 503);
    await db.getRepository(E.Stage).update({ stageId: second.stageId }, rewards);
    assert.equal((await startQuiz(second.stageId)).status, 403);

    const questionIds = [];
    for (const questionOrder of [3, 1, 2]) {
      const question = await save(E.Question, {
        questionCode: `IT-QUIZ-${questionOrder}`, conceptId: cards.body.data.conceptId,
        questionText: `테스트 문항 ${questionOrder}`, explanation: '테스트 해설', generatedBy: 'MANUAL', status: 'PUBLISHED',
      });
      for (const baseOrder of [1, 2, 3, 4]) {
        await save(E.QuestionChoice, {
          questionId: question.questionId, baseOrder, choiceText: `선택지 ${baseOrder}`, isCorrect: baseOrder === 2,
        });
      }
      await save(E.StageQuestion, { stageId, questionId: question.questionId, questionOrder });
      questionIds[questionOrder - 1] = question.questionId;
    }

    const started = await startQuiz(stageId);
    assert.equal(started.status, 201);
    const attempt = started.body.data;
    assert.equal(attempt.stageId, stageId);
    assert.equal(attempt.hp, 2);
    assert.equal(attempt.status, 'IN_PROGRESS');
    assert.equal(attempt.currentQuestion.id, questionIds[0]);
    assert.equal(attempt.currentQuestion.conceptId, cards.body.data.conceptId);
    assert.equal(attempt.currentQuestion.choices.length, 4);
    assert.ok(attempt.currentQuestion.choices.every(choice => !Object.hasOwn(choice, 'isCorrect')));
    assert.equal((await read(stagePath(stageId))).body.data.progressStatus, 'IN_PROGRESS');
  });

  await t.test('missing and unpublished resources are 404, malformed identifiers are 422', async () => {
    const unknown = randomUUID();
    for (const route of [
      stagesPath(unknown), stagesPath(hidden.topicId), stagePath(unknown), stagePath(draft.stageId),
      stagePath(underHidden.stageId), conceptPath(unknown), conceptPath(draftConcept.conceptId), conceptPath(conceptUnderHidden.conceptId),
    ]) {
      const result = await read(route);
      assert.equal(result.status, 404, route);
      assert.equal(result.body.code, 'NOT_FOUND');
    }
    for (const makePath of [stagesPath, stagePath, conceptPath]) {
      assert.equal((await read(makePath('invalid'))).status, 422);
    }
  });

  await t.test('Swagger describes real response fields and authenticated routes', async () => {
    const { status, body: spec } = await read('/api-docs.json', null);
    assert.equal(status, 200);
    const schemas = spec.components.schemas;
    const fieldsMatch = (value, schema) => {
      if (schema.$ref) return fieldsMatch(value, schemas[schema.$ref.split('/').at(-1)]);
      if (value === null) return assert.equal(schema.nullable, true);
      if (schema.type === 'object') {
        for (const key of schema.required) assert.ok(Object.hasOwn(value, key), key);
        for (const [key, child] of Object.entries(value)) {
          assert.ok(schema.properties[key], key);
          fieldsMatch(child, schema.properties[key]);
        }
      } else if (schema.type === 'array') {
        assert.ok(Array.isArray(value));
        value.forEach(child => fieldsMatch(child, schema.items));
      } else {
        if (schema.type === 'integer') assert.ok(Number.isInteger(value));
        else assert.equal(typeof value, schema.type);
        if (schema.enum) assert.ok(schema.enum.includes(value));
      }
    };
    for (const [route, template] of [
      [topicsPath, topicsPath],
      [stagesPath(visible.topicId), '/api/v1/topics/{topicId}/stages'],
      [stagesPath(empty.topicId), '/api/v1/topics/{topicId}/stages'],
      [stagePath(first.stageId), '/api/v1/stages/{stageId}'],
      [conceptPath(concept.conceptId), '/api/v1/concepts/{conceptId}'],
      [conceptPath(emptyConcept.conceptId), '/api/v1/concepts/{conceptId}'],
    ]) {
      const operation = spec.paths[template].get;
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      fieldsMatch((await read(route)).body, operation.responses[200].content['application/json'].schema);
    }
  });
});
