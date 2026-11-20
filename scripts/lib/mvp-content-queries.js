// Read only projections; no account identifiers or question text leave this snapshot.
module.exports = {
  topics: 'SELECT topic_id AS id, topic_code AS code, status::text FROM content.topics ORDER BY topic_no',
  concepts: `SELECT c.concept_id AS id, c.concept_code AS code, c.topic_id, c.status::text,
      EXISTS (SELECT 1 FROM content.concept_sections s WHERE s.concept_id=c.concept_id AND btrim(s.body) <> '') AS cards
    FROM content.concepts c ORDER BY c.concept_id`,
  stages: `SELECT stage_id AS id, stage_code AS code, topic_id, stage_type::text AS type, status::text,
      stage_no AS seq, max_question_count AS max, required_correct_count AS correct, initial_monster_hp AS hp,
      reward_total_exp AS "rewardTotalExp", reward_economy_exp AS "rewardEconomyExp", reward_coin AS "rewardCoin"
    FROM content.stages ORDER BY topic_id, stage_no`,
  links: 'SELECT stage_id, concept_id FROM content.stage_concepts ORDER BY stage_id, concept_id',
  slots: 'SELECT stage_id, question_id, question_order AS "order" FROM content.stage_questions ORDER BY stage_id, question_order',
  questions: `SELECT q.question_id AS id, q.question_code AS code, q.concept_id, q.status::text,
      coalesce(btrim(q.question_text),'') <> '' AS body, coalesce(btrim(q.explanation),'') <> '' AS explanation,
      count(c.choice_id)::int AS choices, count(*) FILTER (WHERE c.is_correct)::int AS correct,
      count(DISTINCT lower(btrim(c.choice_text)))::int AS distinct_choices,
      count(*) FILTER (WHERE btrim(c.choice_text)='')::int AS blank_choices
    FROM content.questions q LEFT JOIN content.question_choices c USING (question_id)
    GROUP BY q.question_id ORDER BY q.question_id`,
  topicEdges: 'SELECT topic_id AS source, prerequisite_topic_id AS target FROM content.topic_prerequisites ORDER BY 1,2',
  conceptEdges: 'SELECT concept_code AS source, prerequisite_concept_code AS target FROM content.concept_prerequisites ORDER BY 1,2',
  levels: 'SELECT scope::text, level, required_exp FROM reward.level_thresholds ORDER BY scope,level',
  costumes: `SELECT item_id AS id, costume_code AS code, category::text, is_on_sale AS sale, price_coin AS price,
      coalesce(btrim(image_key),'') <> '' AS image, coalesce(btrim(thumbnail_key),'') <> '' AS thumbnail
    FROM character.costumes ORDER BY item_id`,
  reviewItems: `SELECT r.review_item_id AS id, q.status::text, r.question_code=q.question_code AND r.concept_code=c.concept_code AS matched
    FROM review.review_items r LEFT JOIN content.questions q ON q.question_id=r.latest_question_id
    LEFT JOIN content.concepts c ON c.concept_id=q.concept_id
    WHERE q.question_id IS NULL OR NOT coalesce(r.question_code=q.question_code AND r.concept_code=c.concept_code,false)
      OR (q.status <> 'PUBLISHED' AND (r.wrong_count>0 OR r.is_bookmarked))
    ORDER BY r.review_item_id`,
  reviewMissions: `SELECT m.mission_id AS id, m.due_date::text AS due_date, coalesce(nullif(m.target_question_count,0),5) AS target,
      count(q.question_id)::int AS available,
      count(q.question_id) FILTER (WHERE EXISTS (SELECT 1 FROM content.question_choices ch WHERE ch.question_id=q.question_id
        GROUP BY ch.question_id HAVING count(*)=4 AND count(*) FILTER (WHERE ch.is_correct)=1))::int AS playable
    FROM review.review_missions m LEFT JOIN review.review_items r ON r.user_id=m.user_id AND r.concept_code=m.concept_code
      AND (r.wrong_count>0 OR r.is_bookmarked)
    LEFT JOIN content.questions q ON q.question_id=r.latest_question_id AND q.status='PUBLISHED'
    WHERE m.due_date <= $1::date AND m.status <> 'COMPLETED'
    GROUP BY m.mission_id ORDER BY m.mission_id`,
  reviewIntegrity: `SELECT count(*)::int AS bad FROM review.review_submissions s
    JOIN review.review_items r USING (review_item_id) JOIN review.review_attempts a USING (review_attempt_id)
    WHERE a.user_id <> r.user_id`,
  bossSnapshots: `SELECT a.attempt_id AS id, count(s.question_id)::int AS slots, count(DISTINCT s.question_id)::int AS distinct_slots,
      count(*) FILTER (WHERE q.status IS DISTINCT FROM 'PUBLISHED')::int AS unavailable
    FROM learning.learning_attempts a LEFT JOIN learning.boss_attempt_questions s USING(attempt_id)
    LEFT JOIN content.questions q USING(question_id)
    WHERE a.boss_combat_state IS NOT NULL AND a.status='IN_PROGRESS'
    GROUP BY a.attempt_id HAVING count(s.question_id) <> 7 OR count(DISTINCT s.question_id) <> 7
      OR count(*) FILTER (WHERE q.status IS DISTINCT FROM 'PUBLISHED') > 0 ORDER BY a.attempt_id`,
  outfitIntegrity: `SELECT
    (SELECT count(*)::int FROM (SELECT user_id FROM character.user_equipped_costumes GROUP BY user_id HAVING count(*)>1) d) AS duplicate_equipment,
    (SELECT count(*)::int FROM character.user_equipped_costumes e LEFT JOIN character.user_costumes o USING(user_id,item_id)
      LEFT JOIN character.costumes c USING(item_id) WHERE o.item_id IS NULL OR c.category::text IS DISTINCT FROM 'OUTFIT'
      OR e.category::text <> 'OUTFIT') AS invalid_equipment,
    (SELECT count(*)::int FROM character.user_costumes o LEFT JOIN reward.coin_ledger l USING(coin_ledger_id)
      WHERE o.acquire_type::text='PURCHASE' AND (l.user_id IS DISTINCT FROM o.user_id OR l.ref_id IS DISTINCT FROM o.item_id
        OR l.reason::text IS DISTINCT FROM 'COSTUME_PURCHASE' OR l.amount > 0)) AS invalid_purchases`,
  ledgers: `SELECT count(*)::int AS bad FROM (
      SELECT e.attempt_id,
        l.attempt_id AS coin_attempt FROM (SELECT * FROM reward.exp_ledger WHERE source_type='STAGE_FIRST_CLEAR') e
      FULL JOIN (SELECT * FROM reward.coin_ledger WHERE reason='STAGE_FIRST_CLEAR') l
        ON l.user_id=e.user_id AND l.ref_id=e.source_stage_id
      WHERE e.attempt_id IS DISTINCT FROM l.attempt_id OR e.user_id IS NULL OR l.user_id IS NULL
    ) mismatches`,
};
