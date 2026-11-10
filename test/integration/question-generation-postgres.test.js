const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { input, result, evidence } = require('../fixtures/question-generation');

const config = process.env.LEREN_QUESTION_PG_TEST_CONFIG;
test('question generation: mock AI HTTP -> Express -> isolated PostgreSQL', { skip: !config, timeout: 120000 }, async t => {
  const { name, port, password } = JSON.parse(config);
  assert.match(name, /^leren-question-it-[0-9a-f]{8}$/);
  const dockerEnv = { ...process.env };
  for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
  const [container] = JSON.parse(execFileSync('docker', ['--host=unix:///var/run/docker.sock', 'inspect', name], { env: dockerEnv, encoding: 'utf8' }));
  assert.equal(container.Config.Labels['codex.purpose'], 'leren-question-generation-integration');
  assert.equal(container.HostConfig.Tmpfs['/var/lib/postgresql'], 'rw');
  assert.equal(container.HostConfig.AutoRemove, true);
  assert.deepEqual(container.NetworkSettings.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: String(port) }]);
  const E = require('@leren/database');
  const db = E.AppDataSource;
  const env = require('../../src/config/env');
  const oldEnv = { ...env };
  const oldOptions = { ...db.options };
  const dir = await mkdtemp(path.join(tmpdir(), 'leren-question-pg-'));
  let appServer, mock;
  t.after(async () => {
    for (const server of [appServer, mock]) if (server) {
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    }
    if (db.isInitialized) await db.destroy();
    db.setOptions(oldOptions); Object.assign(env, oldEnv);
    await rm(dir, { recursive: true, force: true });
  });
  db.setOptions({ host: '127.0.0.1', port, username: 'postgres', password, database: 'leren_question_it',
    ssl: false, synchronize: false, migrationsRun: false, logging: false,
    migrations: [path.resolve(__dirname, '../../database/dist/migrations/*.js')],
    extra: { options: '-c search_path=app,public' } });
  await db.initialize();
  assert.equal((await db.query('SELECT current_database() AS name'))[0].name, 'leren_question_it');
  assert.equal((await db.query("SELECT to_regclass('app.questions') AS existing"))[0].existing, null);
  await db.query('CREATE SCHEMA app'); await db.runMigrations();
  const topic = await db.getRepository(E.Topic).save({ topicCode: 'IT_TOPIC', topicNo: 1, title: '인플레이션' });
  const concept = await db.getRepository(E.Concept).save({ topicId: topic.topicId, conceptCode: 'IT_CONCEPT', title: '인플레이션' });
  const corpusPath = path.join(dir, 'approved.jsonl');
  await writeFile(corpusPath, JSON.stringify(evidence));
  let aiBody = result(); let aiCode = 200; let calls = 0;
  let hold = null; let entered = null;
  mock = http.createServer(async (req, res) => {
    calls++;
    assert.equal(req.url, '/internal/v1/questions/generate');
    assert.equal(req.headers['x-internal-api-key'], 'local-mock-token');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const sent = JSON.parse(raw);
    assert.deepEqual(Object.keys(sent).sort(), ['difficulty', 'learningObjectives', 'questionCount', 'topic']);
    if (entered) entered();
    if (hold) await hold;
    res.writeHead(aiCode, { 'content-type': 'application/json' }); res.end(JSON.stringify(aiBody));
  });
  mock.listen(0, '127.0.0.1'); await new Promise(resolve => mock.once('listening', resolve));
  Object.assign(env, { questionGenerationEnabled: true, questionGenerationEvidencePath: corpusPath,
    questionGenerationTimeoutMs: 1000, questionImportApiKey: randomBytes(24).toString('hex'),
    fastapiBaseUrl: `http://127.0.0.1:${mock.address().port}`, fastapiInternalToken: 'local-mock-token' });
  appServer = await require('../helpers/listen-test-server')(require('../../src/app'));
  const base = `http://127.0.0.1:${appServer.address().port}/api/v1/internal/questions`;
  const post = async (payload, key = env.questionImportApiKey, endpoint = '/generate', requestKey = randomUUID()) => {
    const response = await fetch(base + endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-question-import-key': key, ...(requestKey == null ? {} : { 'Idempotency-Key': requestKey }) }, body: JSON.stringify(payload) });
    return { status: response.status, body: await response.json() };
  };
  const payload = (count = 1, difficulty = 'EASY') => ({ ...input(count, difficulty), conceptId: concept.conceptId });
  const counts = async () => [await db.getRepository(E.Question).count(), await db.getRepository(E.QuestionChoice).count()];

  await t.test('authentication, feature flag and invalid prerequisites cause no AI calls', async () => {
    assert.equal((await post(payload(), 'wrong-key')).status, 401);
    env.questionGenerationEnabled = false;
    assert.equal((await post(payload())).status, 503); env.questionGenerationEnabled = true;
    assert.equal((await post({ ...payload(), questionCount: 0 })).status, 422);
    assert.equal((await post(input())).status, 404);
    const saved = env.questionGenerationEvidencePath; env.questionGenerationEvidencePath = undefined;
    assert.equal((await post(payload())).status, 503); env.questionGenerationEvidencePath = saved;
    assert.equal(calls, 0); assert.equal(await db.getRepository(E.AiRequest).count(), 0);
  });
  for (const [count, difficulty, dbDifficulty] of [[1, 'EASY', 'BEGINNER'], [3, 'MEDIUM', 'INTERMEDIATE'], [10, 'HARD', 'ADVANCED']]) {
    await t.test(`${count} questions saved atomically with ${difficulty} mapping and pending review`, async () => {
      aiBody = result(count, difficulty);
      const response = await post(payload(count, difficulty));
      assert.equal(response.status, 201, JSON.stringify(response.body));
      assert.equal(response.body.data.status, 'COMPLETED');
      const requestId = response.body.data.requestId;
      const job = await db.getRepository(E.AiRequest).findOneByOrFail({ requestId });
      assert.equal(job.status, 'SUCCEEDED'); assert.equal(job.requestType, 'QUESTION_GEN');
      assert.deepEqual(job.knowledgeScope.generationResult, aiBody);
      assert.equal(job.knowledgeScope.sourceDocuments['BOK-1'].document_id, 'DOC-1');
      const questions = await db.getRepository(E.Question).findBy({ generationRequestId: requestId });
      assert.equal(questions.length, count);
      for (const question of questions) {
        assert.equal(question.conceptId, concept.conceptId); assert.equal(question.status, 'REVIEW_PENDING');
        assert.equal(question.questionType, 'MULTIPLE_CHOICE'); assert.equal(question.difficulty, dbDifficulty);
        assert.equal(question.publishedAt, null); assert.deepEqual(question.sourceDocumentIds, ['DOC-1']);
        const choices = await db.getRepository(E.QuestionChoice).find({ where: { questionId: question.questionId }, order: { baseOrder: 'ASC' } });
        assert.equal(choices.length, 4); assert.deepEqual(choices.map(c => c.isCorrect), [true, false, false, false]);
      }
    });
  }
  await t.test('pending questions are not returned by learner quiz and no stage is assigned automatically', async () => {
    await assert.rejects(require('../../src/modules/quizzes/quiz.service')(db).generate({ conceptId: concept.conceptId }), { code: 'NOT_FOUND' });
    assert.equal(await db.getRepository(E.StageQuestion).count(), 0);
  });
  await t.test('AI failure, invalid batch and unknown source save no partial questions and mark job FAILED', async () => {
    const before = await counts();
    const scenarios = [
      () => { aiCode = 503; aiBody = {}; },
      () => { aiBody = { ...result(), status: 'FAILED', error: 'INSUFFICIENT_EVIDENCE', questions: [] }; },
      () => { aiBody = result(); aiBody.questions[0].sourceIds = ['UNKNOWN']; aiBody.sourceIds = ['UNKNOWN']; },
      () => { aiBody = result(); aiBody.validation[0].independentAnswerIndex = 2; },
    ];
    for (const scenario of scenarios) {
      aiCode = 200; scenario();
      assert.equal((await post(payload())).status, 503); assert.deepEqual(await counts(), before);
    }
    assert.equal(await db.getRepository(E.AiRequest).countBy({ status: 'FAILED' }), scenarios.length);
    assert.equal(await db.getRepository(E.AiRequest).countBy({ status: 'RESERVED' }), 0);
  });
  await t.test('second-question choice write failure rolls back the complete batch', async () => {
    const before = await counts(); aiCode = 200; aiBody = result(3);
    const retryKey = randomUUID(); let failed;
    await db.query(`CREATE FUNCTION app.fail_second_question() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS (SELECT 1 FROM app.questions WHERE question_id = NEW.question_id AND question_text LIKE '%2번%')
      THEN RAISE EXCEPTION 'synthetic choice failure'; END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER question_it_fail BEFORE INSERT ON app.question_choices FOR EACH ROW EXECUTE FUNCTION app.fail_second_question()');
    try {
      failed = await post(payload(3), env.questionImportApiKey, '/generate', retryKey);
      assert.equal(failed.status, 503); assert.deepEqual(await counts(), before);
      assert.equal(await db.getRepository(E.AiRequest).countBy({ status: 'RESERVED' }), 0);
    } finally { await db.query('DROP TRIGGER question_it_fail ON app.question_choices'); await db.query('DROP FUNCTION app.fail_second_question()'); }
    const beforeRetry = calls;
    assert.deepEqual(await post(payload(3), env.questionImportApiKey, '/generate', retryKey), failed);
    assert.equal(calls, beforeRetry); assert.deepEqual(await counts(), before);
  });
  await t.test('job completion failure also rolls back all inserted questions', async () => {
    const before = await counts(); aiBody = result();
    await db.query(`CREATE FUNCTION app.fail_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.status = 'SUCCEEDED' THEN RAISE EXCEPTION 'synthetic completion failure'; END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER question_it_job_fail BEFORE UPDATE ON app.ai_requests FOR EACH ROW EXECUTE FUNCTION app.fail_completion()');
    try {
      assert.equal((await post(payload())).status, 503); assert.deepEqual(await counts(), before);
      assert.equal(await db.getRepository(E.AiRequest).countBy({ status: 'RESERVED' }), 0);
    } finally { await db.query('DROP TRIGGER question_it_job_fail ON app.ai_requests'); await db.query('DROP FUNCTION app.fail_completion()'); }
  });
  await t.test('existing draft ingestion still saves GENERATED with no generation job', async () => {
    const draft = { conceptId: concept.conceptId, questionText: '기존 적재 API 호환성 확인 문제', explanation: '기존 저장 방식의 호환성을 검증합니다.',
      difficulty: 'BEGINNER', sourceDocumentIds: ['DOC-1'], choices: result().questions[0].choices.map((text, i) => ({ text, isCorrect: i === 0 })) };
    const response = await post(draft, env.questionImportApiKey, '/drafts');
    assert.equal(response.status, 201); assert.equal(response.body.data.status, 'GENERATED');
    const question = await db.getRepository(E.Question).findOneByOrFail({ questionId: response.body.data.questionId });
    assert.equal(question.generationRequestId, null);
  });
  await t.test('missing key is rejected without AI or a reservation', async () => {
    const before = calls;
    assert.equal((await post(payload(), env.questionImportApiKey, '/generate', null)).status, 422);
    assert.equal(calls, before);
  });
  const postWithKey = (body, key) => post(body, env.questionImportApiKey, '/generate', key);
  const requestRepo = require('../../src/modules/questions/question-generation-request.repository')(db);
  const { questionKey, fingerprint } = require('../../src/common/utils/ai-idempotency.util');
  await t.test('completed request replays exact status/body after corpus removal and review change', async () => {
    aiBody = result(); aiCode = 200;
    const key = randomUUID(); const before = calls; const initialCounts = await counts();
    const first = await postWithKey(payload(), key);
    assert.equal(first.status, 201);
    const questionId = first.body.data.questions[0].questionId;
    await db.getRepository(E.Question).update(questionId, { status: 'APPROVED' });
    const corpus = env.questionGenerationEvidencePath; env.questionGenerationEvidencePath = undefined;
    try {
      const duplicate = await postWithKey({ ...payload(), topic: ' 인플레이션 ' }, key);
      assert.deepEqual(duplicate, first);
    } finally { env.questionGenerationEvidencePath = corpus; }
    assert.equal(calls, before + 1);
    assert.deepEqual(await counts(), [initialCounts[0] + 1, initialCounts[1] + 4]);
    const job = await db.getRepository(E.AiRequest).findOneByOrFail({ requestId: first.body.data.requestId });
    assert.deepEqual(job.knowledgeScope.idempotency.response, { httpStatus: first.status, body: first.body });
  });
  await t.test('same key with another concept/topic/count/difficulty/objective is rejected', async () => {
    aiBody = result(); const key = randomUUID(); const first = await postWithKey(payload(), key);
    assert.equal(first.status, 201); const before = calls;
    for (const change of [{ conceptId: input().conceptId }, { topic: '금리' }, { questionCount: 3 },
      { difficulty: 'HARD' }, { learningObjectives: ['다른 학습 목표'] }]) {
      const response = await postWithKey({ ...payload(), ...change }, key);
      assert.equal(response.status, 409); assert.equal(response.body.code, 'IDEMPOTENCY_PAYLOAD_CONFLICT');
    }
    assert.equal(calls, before);
  });
  await t.test('independent services racing for the same key reserve once and call AI once', async () => {
    aiBody = result(); const key = randomUUID(); const before = calls; const beforeCounts = await counts();
    const generate = require('../../src/modules/questions/question-generation.service');
    const [a, b] = await Promise.all([
      generate(db).generate(payload(), key), generate(db).generate(payload(), key),
    ].map(promise => promise.then(value => ({ value }), error => ({ error }))));
    assert.equal(calls, before + 1);
    const success = [a, b].filter(item => item.value);
    assert.ok(success.length >= 1);
    for (const item of [a, b]) if (item.error) assert.equal(item.error.code, 'QUESTION_GENERATION_IN_PROGRESS');
    assert.deepEqual(await counts(), [beforeCounts[0] + 1, beforeCounts[1] + 4]);
    const replay = await generate(db).generate(payload(), key);
    assert.deepEqual(replay, success[0].value);
    assert.equal(await db.getRepository(E.AiRequest).countBy({ idempotencyKey: questionKey(key) }), 1);
  });
  await t.test('in-progress duplicates return 409 while owner completes normally', async () => {
    aiBody = result(); const key = randomUUID(); const before = calls;
    let release; hold = new Promise(resolve => { release = resolve; });
    const arrived = new Promise(resolve => { entered = resolve; });
    const owner = postWithKey(payload(), key);
    try {
      await arrived;
      const duplicates = await Promise.all(Array.from({ length: 5 }, () => postWithKey(payload(), key)));
      for (const duplicate of duplicates) {
        assert.equal(duplicate.status, 409); assert.equal(duplicate.body.code, 'QUESTION_GENERATION_IN_PROGRESS');
      }
      const different = await postWithKey({ ...payload(), topic: '금리' }, key);
      assert.equal(different.status, 409); assert.equal(different.body.code, 'IDEMPOTENCY_PAYLOAD_CONFLICT');
      assert.equal(calls, before + 1);
    } finally { hold = null; entered = null; release(); }
    assert.equal((await owner).status, 201);
  });
  await t.test('AI failure and timeout retries replay failures without another AI call; new key can run', async () => {
    const beforeCounts = await counts();
    aiBody = { ...result(), status: 'FAILED', error: 'GENERATION_FAILED', questions: [] };
    const failedKey = randomUUID(); const before = calls;
    const first = await postWithKey(payload(), failedKey);
    assert.equal(first.status, 503); aiBody = result();
    const repeated = await Promise.all(Array.from({ length: 4 }, () => postWithKey(payload(), failedKey)));
    for (const response of repeated) assert.deepEqual(response, first);
    assert.equal(calls, before + 1); assert.deepEqual(await counts(), beforeCounts);
    const generate = require('../../src/modules/questions/question-generation.service');
    const timeoutClient = new (require('../../src/clients/fastapi.client'))({ baseUrl: env.fastapiBaseUrl, internalToken: env.fastapiInternalToken, timeoutMs: 80 });
    let release; hold = new Promise(resolve => { release = resolve; });
    const timeoutKey = randomUUID(); const timeoutBefore = calls;
    try {
      const failed = await generate(db, { client: timeoutClient }).generate(payload(), timeoutKey);
      assert.equal(failed.httpStatus, 503);
      const retried = await generate(db).generate(payload(), timeoutKey);
      assert.deepEqual(retried, failed); assert.equal(calls, timeoutBefore + 1);
    } finally { hold = null; release(); }
    assert.equal((await postWithKey(payload(), randomUUID())).status, 201);
  });
  await t.test('reservation COMMIT failure causes zero AI calls and leaves no reservation', async () => {
    const key = randomUUID(); const before = calls;
    await db.query(`CREATE FUNCTION app.fail_reservation_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.status = 'RESERVED' THEN RAISE EXCEPTION 'synthetic reservation commit failure'; END IF; RETURN NEW; END $$`);
    await db.query('CREATE CONSTRAINT TRIGGER question_it_commit_fail AFTER INSERT ON app.ai_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.fail_reservation_commit()');
    try {
      assert.equal((await postWithKey(payload(), key)).status, 503);
      assert.equal(calls, before);
      assert.equal(await db.getRepository(E.AiRequest).countBy({ idempotencyKey: questionKey(key) }), 0);
    } finally { await db.query('DROP TRIGGER question_it_commit_fail ON app.ai_requests'); await db.query('DROP FUNCTION app.fail_reservation_commit()'); }
    assert.equal((await postWithKey(payload(), key)).status, 201);
  });
  await t.test('other request types are never replayed or overwritten on storage-key collision', async () => {
    const before = calls; const beforeCounts = await counts();
    for (const status of ['RESERVED', 'SUCCEEDED', 'FAILED']) {
      const key = randomUUID();
      const saved = await db.getRepository(E.AiRequest).save({ requestType: 'TUTOR', status, modelTier: 'BASIC',
        idempotencyKey: questionKey(key), knowledgeScope: { privateTutorResult: 'TUTOR_PRIVATE_MARKER' } });
      const original = await db.getRepository(E.AiRequest).findOneByOrFail({ requestId: saved.requestId });
      const response = await postWithKey(payload(), key);
      assert.equal(response.status, 409); assert.equal(response.body.code, 'IDEMPOTENCY_NAMESPACE_CONFLICT');
      assert.equal(JSON.stringify(response.body).includes('TUTOR_PRIVATE_MARKER'), false);
      assert.equal(response.body.data, undefined);
      // Also exercise a conflict found during INSERT, after an earlier lookup might have missed it.
      const reservation = await requestRepo.reserve(questionKey(key), payload(), fingerprint(payload()));
      assert.equal(reservation.inserted, false);
      assert.throws(() => requestRepo.replay(reservation.job, fingerprint(payload())), { code: 'IDEMPOTENCY_NAMESPACE_CONFLICT' });
      assert.deepEqual(await db.getRepository(E.AiRequest).findOneByOrFail({ requestId: saved.requestId }), original);
    }
    assert.equal(calls, before);
    assert.deepEqual(await counts(), beforeCounts);
  });
  await t.test('manual recovery is guarded, replayable, and fences late workers from saving', async () => {
    aiBody = result(); const key = randomUUID(); const before = calls; const beforeCounts = await counts();
    let release; hold = new Promise(resolve => { release = resolve; });
    const arrived = new Promise(resolve => { entered = resolve; });
    const owner = postWithKey(payload(), key);
    let recovered;
    try {
      await arrived;
      const job = await requestRepo.find(questionKey(key));
      const inspection = await requestRepo.inspect(job.requestId);
      assert.equal(inspection.recoverable, true);
      assert.equal((await requestRepo.inspect(job.requestId)).status, 'RESERVED');
      await assert.rejects(requestRepo.recover(job.requestId, new Date(0).toISOString(), 'test recovery'), { code: 'QUESTION_RECOVERY_CONFLICT' });
      recovered = await requestRepo.recover(job.requestId, inspection.reservedAt, 'synthetic interrupted worker');
      assert.equal((await requestRepo.inspect(job.requestId)).status, 'FAILED');
      await assert.rejects(requestRepo.recover(job.requestId, inspection.reservedAt, 'repeat'), { code: 'QUESTION_RECOVERY_CONFLICT' });
    } finally { hold = null; entered = null; release(); }
    const late = await owner;
    assert.deepEqual(late, { status: recovered.httpStatus, body: recovered.body });
    assert.deepEqual(await postWithKey(payload(), key), late);
    assert.equal(calls, before + 1); assert.deepEqual(await counts(), beforeCounts);
  });
  await t.test('manual CLI inspects without mutation and requires explicit local recovery confirmation', async () => {
    const key = randomUUID(); const body = payload();
    const { job } = await requestRepo.reserve(questionKey(key), body, fingerprint(body));
    const script = path.resolve(__dirname, '../../scripts/recover-question-generation.js');
    const cliEnv = { ...process.env, QUESTION_RECOVERY_DB_CONFIG: JSON.stringify({ host: '127.0.0.1', port,
      username: 'postgres', password, database: 'leren_question_it' }) };
    const { promisify } = require('node:util');
    const execFile = promisify(require('node:child_process').execFile);
    const inspect = JSON.parse((await execFile(process.execPath, [script, job.requestId], { env: cliEnv })).stdout);
    assert.equal(inspect.status, 'RESERVED');
    assert.equal((await requestRepo.inspect(job.requestId)).status, 'RESERVED');
    await assert.rejects(execFile(process.execPath, [script, job.requestId, '--mark-failed'], { env: cliEnv }));
    assert.equal((await requestRepo.inspect(job.requestId)).status, 'RESERVED');
    const changed = JSON.parse((await execFile(process.execPath, [script, job.requestId, '--mark-failed',
      '--confirm-worker-stopped', '--expected-reserved-at', inspect.reservedAt, '--reason', 'synthetic orphan recovery'], { env: cliEnv })).stdout);
    assert.equal(changed.after.status, 'FAILED');
    const replay = await postWithKey(body, key);
    assert.equal(replay.status, 503); assert.equal(replay.body.code, 'QUESTION_GENERATION_INTERRUPTED');
    await assert.rejects(execFile(process.execPath, [script, job.requestId], { env: { ...cliEnv,
      QUESTION_RECOVERY_DB_CONFIG: JSON.stringify({ host: '192.0.2.1', port: 5432, username: 'test', password: 'test', database: 'test' }) } }));
  });
  await t.test('completed and inconsistent jobs cannot be manually recovered or regenerated', async () => {
    const key = randomUUID(); const scope = { ...payload() }; const before = calls;
    const reservation = await requestRepo.reserve(questionKey(key), scope, fingerprint(scope));
    await db.getRepository(E.AiRequest).update(reservation.job.requestId, { status: 'SUCCEEDED' });
    assert.equal((await postWithKey(payload(), key)).status, 503);
    await assert.rejects(requestRepo.recover(reservation.job.requestId, reservation.job.reservedAt.toISOString(), 'invalid'), { code: 'QUESTION_RECOVERY_CONFLICT' });
    assert.equal(calls, before);
  });

});
