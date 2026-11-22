/**
 * 검수 담당이 승인한 문항을 일반 Stage 슬롯(1~3)에 배정하고 공개(PUBLISHED)합니다.
 *
 * - 입력: 승인 목록 JSON (--file <경로>, "-"이면 표준 입력). 형식은 docs/publish-stage-questions.md
 * - 기본은 미리보기: 같은 트랜잭션에서 저장·준비 상태 확인까지 한 뒤 ROLLBACK (DB 변경 없음)
 * - --apply일 때만 COMMIT. 파일 하나가 트랜잭션 하나라서 하나라도 실패하면 아무것도 저장하지 않음
 * - 빈 슬롯만 채움. 이미 다른 문항이 있는 슬롯은 교체하지 않고 오류
 * - 종료 코드: 0 성공, 1 승인 목록·데이터 검증 실패, 2 사용법·접속·실행 오류
 */
const fs = require('node:fs');

const SLOTS = [1, 2, 3];
const BLOCKED_STATUSES = new Set(['REJECTED', 'RETIRED']);
const USAGE = '사용법: node scripts/publish-stage-questions.js --file <승인 목록.json | -> [--apply]';

class UsageError extends Error {}

function parseArgs(argv) {
  const args = { apply: false, file: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--file') args.file = argv[++i] ?? null;
    else if (arg === '--help' || arg === '-h') throw new UsageError(USAGE);
    else throw new UsageError(`알 수 없는 옵션: ${arg}\n${USAGE}`);
  }
  if (!args.file) throw new UsageError(USAGE);
  return args;
}

const text = (value, max) => typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= max;

/** 승인 목록 형식 검사. 문제가 있으면 모두 모아서 알려줌 */
function parseApproval(raw) {
  let input;
  try { input = JSON.parse(raw); } catch { return { errors: ['승인 목록이 올바른 JSON이 아닙니다.'] }; }
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: ['승인 목록은 JSON 객체여야 합니다.'] };
  if (!text(input.approvedBy, 50)) errors.push('approvedBy(승인한 사람, 1~50자)가 필요합니다.');
  if (input.approvedAt !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(input.approvedAt))) errors.push('approvedAt은 YYYY-MM-DD 형식이어야 합니다.');
  if (!Array.isArray(input.stages) || input.stages.length === 0) errors.push('stages(Stage별 슬롯 목록)가 1개 이상 필요합니다.');
  const stages = [];
  const seenStages = new Set();
  const seenQuestions = new Set();
  for (const [index, entry] of (Array.isArray(input.stages) ? input.stages : []).entries()) {
    const at = `stages[${index}]`;
    if (!entry || typeof entry !== 'object') { errors.push(`${at}: 객체여야 합니다.`); continue; }
    if (!text(entry.stageCode, 20)) { errors.push(`${at}: stageCode가 필요합니다.`); continue; }
    if (seenStages.has(entry.stageCode)) errors.push(`${at}: Stage ${entry.stageCode}가 두 번 들어 있습니다.`);
    seenStages.add(entry.stageCode);
    const slots = [];
    const pairs = entry.slots && typeof entry.slots === 'object' && !Array.isArray(entry.slots) ? Object.entries(entry.slots) : [];
    if (pairs.length === 0) errors.push(`${at}: slots에 배정할 문항이 1개 이상 필요합니다. 예: {"1": "Q_CODE"}`);
    for (const [slot, questionCode] of pairs) {
      const order = Number(slot);
      if (!SLOTS.includes(order) || String(order) !== slot) { errors.push(`${at}: 슬롯 번호는 1, 2, 3만 쓸 수 있습니다 (받은 값: ${slot}).`); continue; }
      if (!text(questionCode, 30)) { errors.push(`${at}: 슬롯 ${slot}의 question_code가 비어 있습니다.`); continue; }
      if (seenQuestions.has(questionCode)) errors.push(`${at}: 문항 ${questionCode}가 목록에 두 번 들어 있습니다.`);
      seenQuestions.add(questionCode);
      slots.push({ order, questionCode });
    }
    stages.push({ stageCode: entry.stageCode, slots: slots.sort((a, b) => a.order - b.order) });
  }
  if (errors.length) return { errors };
  return { errors: [], approval: { approvedBy: input.approvedBy.trim(), approvedAt: input.approvedAt ?? null, stages } };
}

const QUESTION_SQL = `
  SELECT q.question_id, q.question_code, q.version, q.status::text AS status, q.concept_id,
         c.status::text AS concept_status,
         EXISTS (SELECT 1 FROM content.stage_concepts sc WHERE sc.stage_id = $2 AND sc.concept_id = q.concept_id) AS concept_on_stage,
         (SELECT count(*)::int FROM content.question_choices x WHERE x.question_id = q.question_id) AS choices,
         (SELECT count(*)::int FROM content.question_choices x WHERE x.question_id = q.question_id AND x.is_correct) AS correct,
         (SELECT array_agg(s.stage_code ORDER BY s.stage_code) FROM content.stage_questions sq
            JOIN content.stages s ON s.stage_id = sq.stage_id
           WHERE sq.question_id = q.question_id AND sq.stage_id <> $2) AS other_stages
  FROM content.questions q JOIN content.concepts c ON c.concept_id = q.concept_id
  WHERE q.question_code = $1
  ORDER BY q.version DESC LIMIT 1`;

/** 승인 목록을 DB와 대조해 Stage별 할 일을 만듦 (저장 전 검사) */
async function planStage(manager, entry) {
  const errors = [];
  const warnings = [];
  const [stage] = await manager.query(
    `SELECT stage_id, stage_code, stage_type::text AS stage_type, status::text AS status, title
       FROM content.stages WHERE stage_code = $1 FOR UPDATE`, [entry.stageCode]);
  if (!stage) return { stageCode: entry.stageCode, errors: [`Stage ${entry.stageCode}를 찾을 수 없습니다.`], warnings, actions: [] };
  const where = `Stage ${stage.stage_code}(${stage.title})`;
  if (stage.stage_type !== 'NORMAL') {
    return { stageCode: stage.stage_code, errors: [`${where}: 일반 Stage만 슬롯 배정을 합니다 (BOSS는 공개 문항 풀에서 출제).`], warnings, actions: [] };
  }
  if (stage.status !== 'PUBLISHED') warnings.push(`${where}: Stage 상태가 ${stage.status}라 앱에는 아직 보이지 않습니다.`);

  const existing = await manager.query(
    `SELECT sq.question_order, sq.question_id, q.question_code, q.version
       FROM content.stage_questions sq JOIN content.questions q ON q.question_id = sq.question_id
      WHERE sq.stage_id = $1 ORDER BY sq.question_order`, [stage.stage_id]);
  for (const row of existing) {
    if (!SLOTS.includes(row.question_order)) errors.push(`${where}: 슬롯 ${row.question_order}에 배정이 있습니다. 일반 Stage는 1~3번만 씁니다 (먼저 정리 필요).`);
  }
  const bySlot = new Map(existing.map(row => [row.question_order, row]));
  const actions = [];
  for (const { order, questionCode } of entry.slots) {
    const [question] = await manager.query(QUESTION_SQL, [questionCode, stage.stage_id]);
    const slotAt = `${where} 슬롯 ${order}`;
    if (!question) { errors.push(`${slotAt}: 문항 ${questionCode}를 찾을 수 없습니다.`); continue; }
    if (BLOCKED_STATUSES.has(question.status)) { errors.push(`${slotAt}: 문항 ${questionCode} v${question.version}는 ${question.status} 상태라 공개할 수 없습니다.`); continue; }
    if (!question.concept_on_stage) errors.push(`${slotAt}: 문항 ${questionCode}의 개념이 이 Stage에 연결된 개념이 아닙니다.`);
    if (question.choices !== 4 || question.correct !== 1) errors.push(`${slotAt}: 문항 ${questionCode}는 선택지 ${question.choices}개·정답 ${question.correct}개입니다 (4개·1개 필요).`);
    if (question.concept_status !== 'PUBLISHED') warnings.push(`${slotAt}: 문항 ${questionCode}의 개념 상태가 ${question.concept_status}입니다.`);
    if (question.other_stages?.length) warnings.push(`${slotAt}: 문항 ${questionCode}는 다른 Stage(${question.other_stages.join(', ')})에도 배정되어 있습니다.`);
    const sameStage = existing.find(row => row.question_id === question.question_id && row.question_order !== order);
    if (sameStage) errors.push(`${slotAt}: 문항 ${questionCode}는 이미 이 Stage의 슬롯 ${sameStage.question_order}에 있습니다.`);
    const current = bySlot.get(order);
    let action = 'ASSIGN';
    if (current) {
      if (current.question_id === question.question_id) action = 'ALREADY_ASSIGNED';
      else {
        errors.push(`${slotAt}: 이미 ${current.question_code} v${current.version}가 배정되어 있습니다. 교체는 하지 않습니다 (빈 슬롯만 채움).`);
        continue;
      }
    }
    actions.push({ order, questionCode, questionId: question.question_id, version: question.version, statusBefore: question.status, action });
  }
  return { stageCode: stage.stage_code, stageId: stage.stage_id, title: stage.title, errors, warnings, actions };
}

/** 계획대로 저장: 문항 공개 + 빈 슬롯 배정 */
async function applyStage(manager, plan, note, now) {
  for (const item of plan.actions) {
    if (item.statusBefore !== 'PUBLISHED') {
      await manager.query(
        `UPDATE content.questions
            SET status = 'PUBLISHED', published_at = COALESCE(published_at, $2), reviewed_at = COALESCE(reviewed_at, $2),
                review_comment = COALESCE(review_comment, $3), updated_at = $2
          WHERE question_id = $1`, [item.questionId, now, note]);
    }
    if (item.action === 'ASSIGN') {
      await manager.query(
        'INSERT INTO content.stage_questions (stage_id, question_id, question_order) VALUES ($1, $2, $3)',
        [plan.stageId, item.questionId, item.order]);
    }
  }
}

/**
 * 승인 목록 하나를 한 트랜잭션에서 처리. apply가 아니면 끝에서 ROLLBACK
 * 반환: { ok, applied, errors, stages[{ stageCode, actions, warnings, quizReady, quizUnavailableReason }] }
 */
async function publishStageQuestions(dataSource, approval, { apply = false, now = new Date() } = {}) {
  const { Stage } = require('@leren/database');
  const readiness = require('../src/modules/quizzes/normal-stage-readiness');
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  let committed = false;
  try {
    const manager = runner.manager;
    const plans = [];
    for (const entry of approval.stages) plans.push(await planStage(manager, entry));
    const errors = plans.flatMap(plan => plan.errors);
    if (errors.length) return { ok: false, applied: false, errors, stages: plans };
    const note = `승인: ${approval.approvedBy}${approval.approvedAt ? ` (${approval.approvedAt})` : ''} · publish-stage-questions`;
    for (const plan of plans) await applyStage(manager, plan, note, now);
    // 저장 결과로 앱과 같은 준비 상태 판정 (미리보기도 같은 결과)
    for (const plan of plans) {
      const stage = await manager.getRepository(Stage).findOneByOrFail({ stageId: plan.stageId });
      Object.assign(plan, await readiness.describe(manager, stage));
      if (!plan.quizReady) plan.warnings.push(`Stage ${plan.stageCode}: 아직 퀴즈를 시작할 수 없습니다 (${plan.quizUnavailableReason}).`);
    }
    if (apply) { await runner.commitTransaction(); committed = true; }
    return { ok: true, applied: committed, errors: [], stages: plans };
  } finally {
    try { if (!committed && runner.isTransactionActive) await runner.rollbackTransaction(); }
    finally { await runner.release(); }
  }
}

function report(result, apply) {
  const lines = [];
  for (const stage of result.stages) {
    lines.push(`■ ${stage.stageCode}${stage.title ? ` (${stage.title})` : ''}`);
    for (const item of stage.actions ?? []) {
      const label = item.action === 'ASSIGN' ? '배정' : '이미 배정됨';
      const publish = item.statusBefore === 'PUBLISHED' ? '이미 공개' : `${item.statusBefore} → PUBLISHED`;
      lines.push(`  슬롯 ${item.order}: ${item.questionCode} v${item.version} · ${label} · ${publish}`);
    }
    if ('quizReady' in stage) lines.push(`  퀴즈 준비: ${stage.quizReady ? '가능' : `불가 (${stage.quizUnavailableReason})`}`);
    for (const warning of stage.warnings ?? []) lines.push(`  ⚠ ${warning}`);
  }
  for (const error of result.errors) lines.push(`✖ ${error}`);
  if (!result.ok) lines.push('결과: 검증 실패 — DB는 바뀌지 않았습니다.');
  else if (apply) lines.push('결과: 저장 완료 (COMMIT).');
  else lines.push('결과: 미리보기 — DB는 바뀌지 않았습니다. 저장하려면 --apply를 붙여 다시 실행하세요.');
  return lines.join('\n');
}

async function main() {
  let args;
  let approval;
  try {
    args = parseArgs(process.argv.slice(2));
    const raw = args.file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(args.file, 'utf8');
    const parsed = parseApproval(raw.replace(/^﻿/, ''));
    if (parsed.errors.length) {
      console.error(parsed.errors.map(error => `✖ ${error}`).join('\n'));
      process.exitCode = 1;
      return;
    }
    approval = parsed.approval;
  } catch (error) {
    console.error(error instanceof UsageError ? error.message : `승인 목록 파일을 읽지 못했습니다: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  let dataSource;
  try {
    ({ AppDataSource: dataSource } = require('@leren/database'));
    await dataSource.initialize();
    const { host, database } = dataSource.options;
    console.log(`대상 DB: ${host}/${database} · ${args.apply ? '저장(--apply)' : '미리보기'}`);
    const result = await publishStageQuestions(dataSource, approval, { apply: args.apply });
    console.log(report(result, args.apply));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    // 접속 문자열 등 환경 값은 출력하지 않음
    console.error(`실행 중 오류로 아무것도 저장하지 않았습니다: ${error.code ?? ''} ${error.message?.split('\n')[0] ?? ''}`.trim());
    process.exitCode = 2;
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
  }
}

if (require.main === module) void main();
module.exports = { parseArgs, parseApproval, publishStageQuestions, report, UsageError };
