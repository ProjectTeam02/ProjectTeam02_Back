const { normalRules, hasAnswerKey, hasPublishedSlots, hasConfiguredReward } = require('../../src/modules/quizzes/question-pool-policy');

const sections = ['connection', 'migration', 'concept_graph', 'normal_stage', 'boss', 'question_quality', 'review', 'reward_seed', 'costume_seed'];
const keyed = (rows, prop = 'id') => new Map(rows.map(row => [row[prop], row]));
function grouped(rows, prop) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[prop])) groups.set(row[prop], []);
    groups.get(row[prop]).push(row);
  }
  return groups;
}

// Iterative DFS avoids recursion-depth and path-explosion issues in large catalogs.
function graphProblems(edges, nodes, scope, report) {
  const pairs = new Map();
  const adj = new Map();
  const add = (kind, edge, expected, recommendation) => report('concept_graph', scope + '_' + kind,
    edge, 'FAIL', edge, expected, recommendation);
  for (const edge of edges) {
    const { source, target } = edge;
    if (!pairs.has(source)) pairs.set(source, new Set());
    if (pairs.get(source).has(target)) {
      add('DUPLICATE', edge, 'one edge', '중복 연결을 정리하세요.'); continue;
    }
    pairs.get(source).add(target);
    if (source === target) {
      add('SELF', edge, 'different prerequisite', '자기 참조를 콘텐츠 담당자와 확인하세요.'); continue;
    }
    if (!nodes.has(source) || !nodes.has(target)) {
      add('MISSING_NODE', edge, 'both nodes exist', '원본 참조 코드·ID를 확인하세요.'); continue;
    }
    if (nodes.get(source).status === 'PUBLISHED' && nodes.get(target).status !== 'PUBLISHED') {
      add('UNPUBLISHED_REQUIRED', edge, 'published prerequisite', '공개 전 선수 노드를 확인하세요.');
    }
    if (!adj.has(source)) adj.set(source, []);
    adj.get(source).push(target);
  }
  const state = new Map();
  for (const root of adj.keys()) {
    if (state.has(root)) continue;
    const stack = [{ node: root, i: 0 }];
    state.set(root, 1);
    while (stack.length) {
      const top = stack.at(-1);
      const next = adj.get(top.node)?.[top.i++];
      if (next === undefined) { state.set(top.node, 2); stack.pop(); continue; }
      if (state.get(next) === 1) add('CYCLE', { source: top.node, target: next }, 'acyclic graph', '순환 경로의 콘텐츠 선수조건을 검토하세요.');
      else if (!state.has(next)) { state.set(next, 1); stack.push({ node: next, i: 0 }); }
    }
  }
}

function audit(s, report) {
  const bad = (section, code, id, actual, expected, fix) => report(section, code, id, 'FAIL', actual, expected, fix);
  const warn = (section, code, id, actual, expected, fix) => report(section, code, id, 'WARN', actual, expected, fix);
  const topics = keyed(s.topics), concepts = keyed(s.concepts), stages = keyed(s.stages), questions = keyed(s.questions);
  const byTopic = grouped(s.stages, 'topic_id'), links = grouped(s.links, 'stage_id'), slots = grouped(s.slots, 'stage_id');
  const bossCounts = keyed(s.bossCounts, 'topic_id');
  const conceptCodes = keyed(s.concepts, 'code');
  for (const concept of s.concepts) if (concept.status === 'PUBLISHED') conceptCodes.set(concept.code, concept);
  const publicTopic = t => topics.get(t)?.status === 'PUBLISHED';
  const live = s.stages.filter(stage => stage.status === 'PUBLISHED' && publicTopic(stage.topic_id));
  for (const type of ['NORMAL', 'BOSS']) if (!live.some(stage => stage.type === type)) {
    bad(type === 'NORMAL' ? 'normal_stage' : 'boss', 'NO_PUBLISHED_' + type, null, 0, 'at least one published stage', '공개 MVP Stage를 준비하세요.');
  }
  const attached = new Set(s.links.filter(row => stages.get(row.stage_id)?.status === 'PUBLISHED').map(row => row.concept_id));
  const edgeCodes = new Set(s.conceptEdges.flatMap(row => [row.source, row.target]));
  for (const topic of s.topics.filter(row => row.status === 'PUBLISHED')) {
    if (!byTopic.get(topic.id)?.some(x => x.status === 'PUBLISHED')) bad('concept_graph', 'TOPIC_NO_STAGE', topic, 0, 'published stages', '공개 Stage 연결을 확인하세요.');
  }
  for (const c of s.concepts) {
    if (!topics.has(c.topic_id)) bad('concept_graph', 'CONCEPT_TOPIC_MISSING', c.id, c.topic_id, 'existing topic', '개념의 주제 참조를 확인하세요.');
    if (c.status === 'PUBLISHED' && publicTopic(c.topic_id) && !attached.has(c.id) && !edgeCodes.has(c.code)) {
      warn('concept_graph', 'UNATTACHED_CONCEPT', c.id, c.code, 'linked stage or prerequisite', '문제은행 전용인지, 콘텐츠 연결 누락인지 확인하세요.');
    }
  }
  graphProblems(s.conceptEdges, conceptCodes, 'CONCEPT', report);
  graphProblems(s.topicEdges, topics, 'TOPIC', report);
  for (const edge of s.topicEdges) {
    if (publicTopic(edge.source) && !byTopic.get(edge.target)?.some(x => x.type === 'BOSS' && x.status === 'PUBLISHED')) {
      bad('concept_graph', 'TOPIC_PREREQ_NO_BOSS', edge, 'no public Boss', 'public prerequisite Boss', '실제 해금은 선수 주제 Boss 통과를 사용합니다.');
    }
  }
  for (const row of s.links) {
    if (!stages.has(row.stage_id) || !concepts.has(row.concept_id)) bad('concept_graph', 'STAGE_CONCEPT_MISSING', row, 'dangling link', 'existing Stage and concept', '연결 ID를 확인하세요.');
  }
  for (const row of s.slots) {
    if (!stages.has(row.stage_id) || !questions.has(row.question_id)) bad('question_quality', 'STAGE_QUESTION_MISSING', row, 'dangling slot', 'existing Stage and question', '연결 ID를 확인하세요.');
  }
  for (const stage of s.stages) if (stage.status === 'PUBLISHED' && !publicTopic(stage.topic_id)) {
    bad('concept_graph', 'STAGE_TOPIC_HIDDEN', stage.id, stage.topic_id, 'published topic', 'Stage와 주제의 공개 상태를 맞추세요.');
  }
  const samples = [];
  for (const stage of live) {
    const id = { stage: stage.id, code: stage.code, topic: stage.topic_id, topicCode: topics.get(stage.topic_id)?.code };
    const section = stage.type === 'BOSS' ? 'boss' : 'normal_stage';
    const earlier = byTopic.get(stage.topic_id).find(row => row.seq === stage.seq - 1);
    if (stage.seq > 1 && earlier?.status !== 'PUBLISHED') bad('concept_graph', 'PREVIOUS_STAGE_UNAVAILABLE', id, earlier?.status ?? 'missing', 'published previous slot', '연속된 공개 Stage 번호를 확인하세요.');
    if (stage.type === 'NORMAL') {
      const attachedConcepts = (links.get(stage.id) ?? []).map(link => concepts.get(link.concept_id));
      if (!attachedConcepts.some(c => c?.status === 'PUBLISHED' && publicTopic(c.topic_id) && c.cards)) {
        bad('concept_graph', 'NORMAL_NO_STUDY_CARD', id, 'no published linked card', 'published linked concept with card', 'Stage에 공개 학습 카드가 있는 개념을 연결하세요.');
      }
      for (const c of attachedConcepts) if (c && (c.status !== 'PUBLISHED' || !publicTopic(c.topic_id))) {
        warn('concept_graph', 'STAGE_CONCEPT_HIDDEN', id, c.id, 'published concept and topic', '앱에서 숨겨진 개념 연결을 검토하세요.');
      }
      const actual = (slots.get(stage.id) ?? []).map(row => ({ ...row, status: questions.get(row.question_id)?.status ?? 'MISSING' }));
      const eligible = actual.filter(row => row.status === 'PUBLISHED' && hasAnswerKey(questions.get(row.question_id).choices, questions.get(row.question_id).correct)).length;
      samples.push({ section, ...id, eligible, required: normalRules.questions, shortage: Math.max(0, normalRules.questions - eligible) });
      if (stage.max !== normalRules.questions || stage.correct !== normalRules.correct || stage.hp !== normalRules.hp) {
        bad(section, 'NORMAL_CONFIG', id, { questions: stage.max, correct: stage.correct, hp: stage.hp }, normalRules, '3문항·2정답·HP 2로 구성하세요.');
      }
      if (!hasPublishedSlots(actual, normalRules.questions) || eligible !== normalRules.questions || new Set(actual.map(row => row.question_id)).size !== actual.length) {
        bad(section, 'NORMAL_POOL', id, { eligible, slots: actual }, { slots: [1, 2, 3], published: 3, choices: 4, correct: 1 }, '문항 순서·공개 상태·정답과 보기를 확인하세요.');
      }
      const codes = actual.map(row => questions.get(row.question_id)?.code).filter(Boolean);
      if (new Set(codes).size !== codes.length) warn(section, 'NORMAL_DUPLICATE_LOGICAL_QUESTION', id, codes, 'distinct question codes', '동일 문항의 버전 중복 배정을 확인하세요.');
    } else if (stage.type === 'BOSS') {
      const eligible = bossCounts.get(stage.topic_id)?.eligible ?? 0;
      samples.push({ section, ...id, eligible, required: s.bossRequired, shortage: Math.max(0, s.bossRequired - eligible) });
      if (eligible < s.bossRequired) bad(section, 'BOSS_POOL_SHORTAGE', id, { eligible, shortage: s.bossRequired - eligible }, s.bossRequired, '같은 주제에서 일반 Stage 미배정 공개 문항을 검수·준비하세요.');
    }
    if (!hasConfiguredReward(stage)) {
      const allEmpty = [stage.rewardTotalExp, stage.rewardEconomyExp, stage.rewardCoin].every(value => value === null);
      const problem = stage.type === 'BOSS' && allEmpty ? warn : bad;
      problem('reward_seed', 'STAGE_REWARD_CONFIG', id, [stage.rewardTotalExp, stage.rewardEconomyExp, stage.rewardCoin], 'configured nonnegative integers; Boss can be all null', '운영 지급량을 정한 뒤 세 보상 칼럼을 함께 확인하세요.');
    }
  }
  for (const q of s.questions.filter(row => row.status === 'PUBLISHED')) {
    const c = concepts.get(q.concept_id);
    if (!c || c.status !== 'PUBLISHED' || !publicTopic(c.topic_id)) {
      bad('question_quality', 'PUBLIC_QUESTION_HIDDEN_CONCEPT', q.id, { concept: q.concept_id, status: c?.status ?? 'MISSING' }, 'published concept and topic', '문항과 개념의 공개 상태를 함께 검수하세요.');
    }
    if (!q.body || !q.explanation || !hasAnswerKey(q.choices, q.correct) || q.choices !== q.distinct_choices || q.blank_choices !== 0) {
      bad('question_quality', 'PUBLIC_QUESTION_INVALID', q.id, { ...q, body: q.body, explanation: q.explanation },
        'text, explanation, four distinct nonblank choices, exactly one correct', '문항 메타데이터만 보정하지 말고 콘텐츠 검수 결과를 확인하세요.');
    }
  }
  for (const a of s.bossSnapshots) bad('boss', 'BOSS_SNAPSHOT_INVALID', a.id, a, 'seven distinct published slots', '진행 응시 스냅샷을 조사하세요.');
  for (const item of s.reviewItems) {
    if (!item.status || !item.matched) bad('review', 'REVIEW_REFERENCE', item.id, item, 'matching question/concept codes', '오답·북마크 참조를 검토하세요.');
    else warn('review', 'REVIEW_HIDDEN_ITEM', item.id, item.status, 'published for serving', 'API는 숨깁니다. 공개 철회가 의도된 것인지 확인하세요.');
  }
  for (const mission of s.reviewMissions) {
    if (!mission.available) bad('review', 'DUE_REVIEW_EMPTY', mission.id, mission, 'one or more published eligible items', '복습 임무의 사용자·개념별 공개 문항을 확인하세요.');
    else if (mission.playable < mission.target) warn('review', 'DUE_REVIEW_UNDER_TARGET', mission.id, mission, mission.target, '목표 수보다 부족합니다. 서비스는 짧은 세트를 허용하며 대체 정책은 추가하지 않습니다.');
  }
  if (s.reviewIntegrity.bad) bad('review', 'REVIEW_OWNER_MISMATCH', null, s.reviewIntegrity.bad, 0, '복습 응시와 항목 소유 관계를 확인하세요.');
  for (const scope of ['ACCOUNT', 'ECONOMY']) {
    const rows = s.levels.filter(row => row.scope === scope);
    if (rows[0]?.level !== 1 || rows[0].required_exp !== 0 || rows.some((row, i) => i > 0 && (row.level !== rows[i-1].level + 1 || row.required_exp <= rows[i-1].required_exp))) {
      bad('reward_seed', 'LEVEL_THRESHOLDS', scope, rows, 'level 1 at 0 EXP, consecutive and increasing', '01_master_data.sql의 레벨 기준을 비교하세요.');
    }
  }
  if (s.ledgers.bad) bad('reward_seed', 'FIRST_CLEAR_LEDGER_PAIR', null, s.ledgers.bad, 0, '동일 최초 통과의 EXP·코인 원장과 attempt_id를 조사하세요.');
  if (!s.costumes.some(c => c.sale)) bad('costume_seed', 'SALE_CATALOG_EMPTY', null, 0, 'at least one sellable outfit', '팀이 승인한 한벌옷 상품·가격·이미지 키를 준비하세요.');
  const codes = new Set(), ids = new Set();
  for (const c of s.costumes) {
    if (c.category !== 'OUTFIT' || codes.has(c.code) || ids.has(c.id) || (c.sale && (!Number.isInteger(c.price) || c.price < 0 || !c.image))) {
      bad('costume_seed', 'OUTFIT_CATALOG_INVALID', c.id, c, 'unique OUTFIT; sellable items have cost and image', '#139 이관 정책과 판매 품목 설정을 확인하세요.');
    }
    if (c.sale && !c.thumbnail) warn('costume_seed', 'OUTFIT_NO_THUMBNAIL', c.id, false, 'thumbnail key', '상품 미리보기 리소스를 확인하세요.');
    codes.add(c.code); ids.add(c.id);
  }
  for (const [key, value] of Object.entries(s.outfitIntegrity)) if (value) bad('costume_seed', key.toUpperCase(), null, value, 0, '구매 원장 및 사용자당 한벌옷 장착을 확인하세요.');
  return samples;
}
module.exports = { sections, audit, graphProblems };
