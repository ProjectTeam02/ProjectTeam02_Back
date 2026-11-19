const assert = require('node:assert/strict');
const test = require('node:test');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const { Client } = require('pg');
const { run, markdown } = require('../../scripts/mvp-content-preflight');
const listen = require('../helpers/listen-test-server');

const config = process.env.LEREN_PREFLIGHT_PG_TEST_CONFIG;
const date = '2026-11-19';
test('preflight reads isolated PostgreSQL, and malformed review is never persisted', { skip: !config, timeout: 120000 }, async t => {
  const { port, password, reportDirectory } = JSON.parse(config);
  assert.ok(Number.isInteger(port) && port > 0);
  const settings = database => ({ host:'127.0.0.1', port, database, user:'app_user', password, ssl:false });
  const record = async (name, db = 'mvp_preflight_fixture') => {
    const report = await run(new Client(settings(db)), date);
    if (reportDirectory) {
      writeFileSync(reportDirectory + '/' + name + '.json', JSON.stringify(report, null, 2));
      writeFileSync(reportDirectory + '/' + name + '.md', markdown(report));
    }
    return report;
  };
  const ids = found => found.findings.map(item => item.code);
  const env = require('../../src/config/env');
  const E = require('@leren/database');
  const db = E.AppDataSource;
  db.setOptions({ ...settings('mvp_preflight_fixture'), username:'app_user', synchronize:false, migrationsRun:false });
  await db.initialize();
  t.after(() => db.destroy());
  assert.equal((await db.query("SELECT current_database() AS db"))[0].db, 'mvp_preflight_fixture');

  await t.test('fresh DB and migrated DB without seed/catalog', async () => {
    const fresh = await record('01-fresh', 'mvp_preflight_fresh');
    assert.equal(fresh.sections.connection, 'PASS');
    assert.equal(fresh.sections.migration, 'FAIL');
    assert.equal(fresh.sections.boss, 'NOT TESTED');
    const empty = await record('02-migrated-empty');
    assert.equal(empty.sections.migration, 'PASS', JSON.stringify(empty));
    for (const issue of ['NO_PUBLISHED_NORMAL','NO_PUBLISHED_BOSS','LEVEL_THRESHOLDS','SALE_CATALOG_EMPTY']) assert.ok(ids(empty).includes(issue), JSON.stringify(empty));
  });

  await t.test('repository master seed sets reward thresholds but supplies no catalog', async () => {
    await db.query(readFileSync('database/sql/seed/01_master_data.sql', 'utf8'));
    const seeded = await record('02b-master-seed-only');
    assert.equal(seeded.sections.reward_seed,'PASS',JSON.stringify(seeded));
    for (const issue of ['NO_PUBLISHED_NORMAL','NO_PUBLISHED_BOSS','SALE_CATALOG_EMPTY']) assert.ok(ids(seeded).includes(issue));
  });

  const save = (entity, row) => db.getRepository(entity).save(row);
  const topic = await save(E.Topic, { topicNo:1, topicCode:'PREFLIGHT', title:'경제기초 fixture', status:'PUBLISHED' });
  const c = await save(E.Concept, { topicId:topic.topicId, conceptCode:'PREFLIGHT-C', title:'기초', status:'PUBLISHED' });
  await save(E.ConceptSection, { conceptId:c.conceptId, pageNo:1, sortOrder:1, sectionType:'DEFINITION', body:'fixture' });
  const common = { topicId:topic.topicId, status:'PUBLISHED', rewardTotalExp:0, rewardEconomyExp:0, rewardCoin:0 };
  const normal = await save(E.Stage, { ...common, stageNo:1, stageCode:'PREFLIGHT-N', stageType:'NORMAL', title:'normal', maxQuestionCount:3, requiredCorrectCount:2, initialMonsterHp:2 });
  await save(E.Stage, { ...common, stageNo:2, stageCode:'PREFLIGHT-B', stageType:'BOSS', title:'boss', maxQuestionCount:5, requiredCorrectCount:4, initialMonsterHp:4 });
  await save(E.StageConcept, { stageId:normal.stageId, conceptId:c.conceptId });
  const qq = [];
  for (let n = 0; n < 10; n++) {
    const q = await save(E.Question, { questionCode:'PREFLIGHT-Q'+n, conceptId:c.conceptId, generatedBy:'MANUAL', questionText:'fixture '+n, explanation:'fixture explanation', status:'PUBLISHED' });
    qq.push(q);
    await save(E.QuestionChoice, [1,2,3,4].map(i=>({ questionId:q.questionId, baseOrder:i, choiceText:'fixture choice '+i, isCorrect:i===1 })));
    if (n < 3) await save(E.StageQuestion, { stageId:normal.stageId, questionId:q.questionId, questionOrder:n+1 });
  }
  await save(E.Costume,{ costumeCode:'PREFLIGHT-OUTFIT', name:'fixture', category:'OUTFIT', priceCoin:1, imageKey:'fixture/image', thumbnailKey:'fixture/thumb', isOnSale:true });

  const user = await save(E.User, { nickname:'fixture owner' });
  const session = await save(E.UserSession, { userId:user.userId, loginMethod:'EMAIL', refreshTokenHash:randomBytes(32).toString('hex'), expiresAt:new Date(Date.now()+60000) });
  const item = await save(E.ReviewItem, { userId:user.userId, questionCode:qq[0].questionCode, latestQuestionId:qq[0].questionId, conceptCode:c.conceptCode, firstReason:'WRONG', wrongCount:1 });
  const mission = await save(E.ReviewMission, { userId:user.userId, conceptCode:c.conceptCode, firstRegisteredAt:new Date(), dueDate:date, targetQuestionCount:1 });

  await t.test('valid fixture: 3 Stage / 7 Boss, due item, rewards and OUTFIT; CLI exit 0', async () => {
    const good = await record('03-valid');
    assert.equal(good.status,'PASS',JSON.stringify(good));
    assert.deepEqual(good.stages.map(s=>s.eligible),[3,7]);
    const cli = spawnSync(process.execPath, ['scripts/mvp-content-preflight.js','--date',date], {
      encoding:'utf8',env:{...process.env, PGHOST:'127.0.0.1', PGDATABASE:'mvp_preflight_fixture', PGUSER:'app_user', PGPORT:String(port), PGPASSWORD:password},
    });
    assert.equal(cli.status,0,cli.stderr);
    assert.equal(JSON.parse(cli.stdout).status,'PASS');
  });

  await t.test('shortage, pre-approved but unpublished, and dangling logical reference fail', async () => {
    await db.query("UPDATE content.questions SET status='APPROVED' WHERE question_id=ANY($1::uuid[])", [[qq[1].questionId, qq[9].questionId]]);
    await assert.rejects(db.getRepository(E.StageQuestion).insert({
      stageId:normal.stageId, questionOrder:4, questionId:'00000000-0000-4000-8000-000000000123',
    }), error => error.code === '23503');
    await db.query("INSERT INTO content.concept_prerequisites(concept_code,prerequisite_concept_code) VALUES ($1,'NO-SUCH-CODE')", [c.conceptCode]);
    await db.getRepository(E.ReviewItem).update(item.reviewItemId, { conceptCode:'NO-SUCH-CODE' });
    const bad = await record('04-invalid');
    assert.equal(bad.status,'FAIL');
    for (const issue of ['NORMAL_POOL','BOSS_POOL_SHORTAGE','CONCEPT_MISSING_NODE','REVIEW_REFERENCE','DUE_REVIEW_EMPTY']) assert.ok(ids(bad).includes(issue),JSON.stringify(bad));
    assert.deepEqual(bad.stages.map(s=>s.shortage),[1,1]);
    const cli = spawnSync(process.execPath, ['scripts/mvp-content-preflight.js','--date',date], {
      encoding:'utf8',env:{...process.env, PGHOST:'127.0.0.1', PGDATABASE:'mvp_preflight_fixture', PGUSER:'app_user', PGPORT:String(port), PGPASSWORD:password},
    });
    assert.equal(cli.status,1,cli.stderr);
  });

  await t.test('published review with no choices returns HTTP 503 and no attempt/submission', async () => {
    await db.getRepository(E.ReviewItem).update(item.reviewItemId,{conceptCode:c.conceptCode});
    await db.getRepository(E.QuestionChoice).delete({questionId:qq[0].questionId});
    const invalid = await record('05-malformed-choice');
    assert.ok(ids(invalid).includes('PUBLIC_QUESTION_INVALID'));
    env.jwtAccessSecret = randomBytes(32).toString('hex');
    const token = require('../../src/common/utils/token.util').issueAccessToken(user,session.sessionId);
    const server = await listen(require('../../src/app'));
    t.after(() => new Promise(resolve=>server.close(resolve)));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/reviews/missions/${mission.missionId}/attempts`, {
      method:'POST', headers:{authorization:'Bearer '+token},
    });
    assert.equal(response.status,503,await response.text());
    assert.equal(await db.getRepository(E.ReviewAttempt).countBy({userId:user.userId}),0);
    assert.equal(await db.getRepository(E.ReviewSubmission).count(),0);
  });
});
