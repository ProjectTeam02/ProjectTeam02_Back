const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;
const script = path.resolve(__dirname, '../../scripts/publish-stage-questions.js');

test('approved questions are published into empty normal Stage slots only', { skip: !config, timeout: 120000 }, async t => {
  const options = JSON.parse(config);
  const E = require('@leren/database');
  const db = E.AppDataSource;
  const oldOptions = { ...db.options };
  t.after(async () => {
    if (db.isInitialized) await db.destroy();
    db.setOptions(oldOptions);
  });
  const connection = { host: '127.0.0.1', port: options.port, database: options.database || 'leren_it',
    username: options.username || 'app_user', password: options.password || 'app_local' };
  db.setOptions({ ...connection, ssl: false, synchronize: false, migrationsRun: false, logging: false });
  await db.initialize();
  const { publishStageQuestions, parseApproval } = require(script);
  const repo = entity => db.getRepository(entity);
  const suffix = randomBytes(4).toString('hex');

  // 주제 1개, 개념 2개(Stage 연결 / 미연결), 일반 Stage 2개, BOSS 1개
  const topic = await repo(E.Topic).save({ topicCode: `PUB-${suffix}`, topicNo: 100 + (parseInt(suffix, 16) % 10000),
    title: '공개 도구 테스트 주제', status: 'PUBLISHED' });
  const concept = await repo(E.Concept).save({ conceptCode: `PUB-C-${suffix}`, topicId: topic.topicId, title: '연결 개념', status: 'PUBLISHED' });
  const otherConcept = await repo(E.Concept).save({ conceptCode: `PUB-X-${suffix}`, topicId: topic.topicId, title: '다른 개념', status: 'PUBLISHED' });
  const stage = (no, type, extra = {}) => repo(E.Stage).save({ topicId: topic.topicId, stageCode: `PUB-${no}-${suffix}`.slice(0, 20),
    stageNo: no, stageType: type, title: `공개 도구 ${no}`, maxQuestionCount: type === 'BOSS' ? 5 : 3,
    requiredCorrectCount: type === 'BOSS' ? 4 : 2, initialMonsterHp: type === 'BOSS' ? 4 : 2,
    rewardTotalExp: 10, rewardEconomyExp: 5, rewardCoin: 5, status: 'PUBLISHED', ...extra });
  const empty = await stage(1, 'NORMAL');
  const partial = await stage(2, 'NORMAL');
  const boss = await stage(3, 'BOSS');
  for (const target of [empty, partial]) await repo(E.StageConcept).save({ stageId: target.stageId, conceptId: concept.conceptId });

  async function question(code, { status = 'REVIEW_PENDING', conceptId = concept.conceptId, choices = 4, version = 1 } = {}) {
    const row = await repo(E.Question).save({ questionCode: `${code}-${suffix}`.slice(0, 30), version, conceptId,
      questionText: `문항 ${code}`, explanation: '해설', generatedBy: 'MANUAL', status });
    await repo(E.QuestionChoice).save(Array.from({ length: choices }, (_, i) => ({ questionId: row.questionId,
      baseOrder: i + 1, choiceText: `보기 ${i + 1}`, isCorrect: i === 0 })));
    return row;
  }
  const q = {
    a: await question('A'), b: await question('B', { status: 'APPROVED' }), c: await question('C'),
    d: await question('D', { status: 'PUBLISHED' }), e: await question('E'),
    rejected: await question('R', { status: 'REJECTED' }), three: await question('T', { choices: 3 }),
    foreign: await question('F', { conceptId: otherConcept.conceptId }),
  };
  // 같은 코드의 새 버전: 최신 버전(v2)을 배정해야 함
  const aV2 = await question('A', { version: 2 });
  // 부분 배정 Stage: 슬롯 1은 이미 D(공개)
  await repo(E.StageQuestion).save({ stageId: partial.stageId, questionId: q.d.questionId, questionOrder: 1 });

  const raw = stages => ({ approvedBy: '검수 담당', approvedAt: '2026-11-22', stages });
  // CLI와 같은 형식 검사를 거친 승인 목록
  const approval = stages => {
    const parsed = parseApproval(JSON.stringify(raw(stages)));
    assert.deepEqual(parsed.errors, []);
    return parsed.approval;
  };
  const snapshot = async () => ({
    mappings: await db.query(`SELECT stage_id, question_id, question_order FROM content.stage_questions
      WHERE stage_id = ANY($1) ORDER BY stage_id, question_order`, [[empty.stageId, partial.stageId, boss.stageId]]),
    questions: await db.query(`SELECT question_code, version, status::text, published_at IS NOT NULL AS published
      FROM content.questions WHERE question_code LIKE $1 ORDER BY question_code, version`, [`%-${suffix}`]),
  });
  const codeOf = row => row.questionCode;

  await t.test('approval file format is validated before touching the database', () => {
    assert.deepEqual(parseApproval('{').errors, ['승인 목록이 올바른 JSON이 아닙니다.']);
    const bad = parseApproval(JSON.stringify({ stages: [{ stageCode: 'X', slots: { 4: 'Q', 1: 'Q' } }, { stageCode: 'X', slots: {} }] }));
    assert.ok(bad.errors.some(error => error.includes('approvedBy')));
    assert.ok(bad.errors.some(error => error.includes('1, 2, 3')));
    assert.ok(bad.errors.some(error => error.includes('두 번')));
    assert.ok(bad.errors.some(error => error.includes('1개 이상')));
    const good = parseApproval(JSON.stringify(raw([{ stageCode: 'S', slots: { 3: 'Q3', 1: 'Q1' } }])));
    assert.deepEqual(good.approval.stages[0].slots.map(slot => slot.order), [1, 3]);
  });

  await t.test('preview reports readiness but leaves the database unchanged', async () => {
    const before = await snapshot();
    const result = await publishStageQuestions(db, approval([
      { stageCode: empty.stageCode, slots: { 1: codeOf(q.a), 2: codeOf(q.b), 3: codeOf(q.c) } },
    ]));
    assert.equal(result.ok, true);
    assert.equal(result.applied, false);
    assert.equal(result.stages[0].quizReady, true);
    assert.deepEqual(result.stages[0].actions.map(a => [a.order, a.version, a.statusBefore]), [[1, 2, 'REVIEW_PENDING'], [2, 1, 'APPROVED'], [3, 1, 'REVIEW_PENDING']]);
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('any invalid slot rejects the whole file and saves nothing', async () => {
    const before = await snapshot();
    const result = await publishStageQuestions(db, approval([
      { stageCode: empty.stageCode, slots: { 1: codeOf(q.a), 2: codeOf(q.rejected), 3: codeOf(q.three) } },
      { stageCode: partial.stageCode, slots: { 1: codeOf(q.e), 2: codeOf(q.foreign), 3: `NOPE-${suffix}` } },
      { stageCode: boss.stageCode, slots: { 1: codeOf(q.c) } },
      { stageCode: `NONE-${suffix}`, slots: { 1: `ANY-${suffix}` } },
    ]), { apply: true });
    assert.equal(result.ok, false);
    assert.equal(result.applied, false);
    const joined = result.errors.join('\n');
    assert.match(joined, /REJECTED 상태라 공개할 수 없습니다/);
    assert.match(joined, /선택지 3개·정답 1개/);
    assert.match(joined, /교체는 하지 않습니다/);
    assert.match(joined, /이 Stage에 연결된 개념이 아닙니다/);
    assert.match(joined, /일반 Stage만/);
    assert.match(joined, /찾을 수 없습니다/);
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('--apply publishes approved questions and fills empty slots in one transaction', async () => {
    const result = await publishStageQuestions(db, approval([
      { stageCode: empty.stageCode, slots: { 1: codeOf(q.a), 2: codeOf(q.b), 3: codeOf(q.c) } },
      { stageCode: partial.stageCode, slots: { 1: codeOf(q.d), 2: codeOf(q.e) } },
    ]), { apply: true });
    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.equal(result.applied, true);
    const [filled, half] = result.stages;
    assert.deepEqual([filled.quizReady, filled.quizUnavailableReason], [true, null]);
    assert.deepEqual([half.quizReady, half.quizUnavailableReason], [false, 'INSUFFICIENT_ELIGIBLE_QUESTIONS']);
    assert.deepEqual(half.actions.map(a => a.action), ['ALREADY_ASSIGNED', 'ASSIGN']);
    const mapped = await db.query(`SELECT question_order, question_id FROM content.stage_questions WHERE stage_id = $1 ORDER BY question_order`, [empty.stageId]);
    assert.deepEqual(mapped, [aV2, q.b, q.c].map((row, i) => ({ question_order: i + 1, question_id: row.questionId })));
    const published = await repo(E.Question).findBy([{ questionId: aV2.questionId }, { questionId: q.b.questionId }, { questionId: q.e.questionId }]);
    for (const row of published) {
      assert.equal(row.status, 'PUBLISHED');
      assert.ok(row.publishedAt && row.reviewedAt);
      assert.match(row.reviewComment, /승인: 검수 담당 \(2026-11-22\)/);
    }
    assert.equal((await repo(E.Question).findOneByOrFail({ questionId: q.a.questionId })).status, 'REVIEW_PENDING');
  });

  await t.test('running the same approval again changes nothing', async () => {
    const before = await snapshot();
    const result = await publishStageQuestions(db, approval([
      { stageCode: empty.stageCode, slots: { 1: codeOf(q.a), 2: codeOf(q.b), 3: codeOf(q.c) } },
    ]), { apply: true });
    assert.equal(result.ok, true);
    assert.deepEqual(result.stages[0].actions.map(a => [a.action, a.statusBefore]), Array(3).fill(['ALREADY_ASSIGNED', 'PUBLISHED']));
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('CLI reads stdin, previews by default and exits 1 on validation failure', () => {
    const env = { ...process.env, DB_HOST: connection.host, DB_PORT: String(connection.port), DB_NAME: connection.database,
      DB_USER: connection.username, DB_PASSWORD: connection.password, DB_SSL: 'false' };
    const run = (body, args = []) => {
      try {
        return { code: 0, out: execFileSync(process.execPath, [script, '--file', '-', ...args], { input: JSON.stringify(body), env, encoding: 'utf8' }) };
      } catch (error) { return { code: error.status, out: `${error.stdout}${error.stderr}` }; }
    };
    const preview = run(raw([{ stageCode: partial.stageCode, slots: { 3: codeOf(q.c) } }]));
    assert.equal(preview.code, 0, preview.out);
    assert.match(preview.out, /미리보기 — DB는 바뀌지 않았습니다/);
    assert.match(preview.out, /퀴즈 준비: 가능/);
    const failure = run(raw([{ stageCode: partial.stageCode, slots: { 1: codeOf(q.c) } }]), ['--apply']);
    assert.equal(failure.code, 1);
    assert.match(failure.out, /교체는 하지 않습니다/);
    assert.equal(run({ stages: [] }).code, 1);
    assert.equal(run(raw([]), ['--unknown']).code, 2);
  });
});
