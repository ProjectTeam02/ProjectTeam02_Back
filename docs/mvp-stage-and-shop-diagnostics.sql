-- Run with a SELECT-only account on an approved snapshot or read replica.
-- Results contain no question text, answer text, user records or credentials.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '10s';

WITH requested(title) AS (VALUES ('희소성'::text), ('가격과 물가수준')),
target AS (
  SELECT r.title AS requested_title, s.*, t.status AS topic_status
  FROM requested r LEFT JOIN content.stages s ON s.title = r.title AND s.stage_type = 'NORMAL'
  LEFT JOIN content.topics t ON t.topic_id = s.topic_id
), assigned AS (
  SELECT s.stage_id, a.question_order, q.status, c.status AS concept_status,
         c.topic_id = s.topic_id AS same_topic,
         EXISTS (SELECT 1 FROM content.stage_concepts sc
                 WHERE sc.stage_id = s.stage_id AND sc.concept_id = q.concept_id) AS concept_listed_on_stage,
         k.choices, k.correct
  FROM target s JOIN content.stage_questions a ON a.stage_id = s.stage_id
  LEFT JOIN content.questions q ON q.question_id = a.question_id
  LEFT JOIN content.concepts c ON c.concept_id = q.concept_id
  CROSS JOIN LATERAL (
    SELECT count(*) AS choices, count(*) FILTER (WHERE x.is_correct) AS correct
    FROM content.question_choices x WHERE x.question_id = a.question_id
  ) k
), totals AS (
  SELECT stage_id, count(*) AS assignments,
         count(*) FILTER (WHERE status = 'PUBLISHED') AS published,
         count(*) FILTER (WHERE status = 'APPROVED') AS approved_not_published,
         count(*) FILTER (WHERE choices = 4 AND correct = 1) AS valid_choice_sets,
         count(*) FILTER (WHERE status = 'PUBLISHED' AND (choices <> 4 OR correct <> 1)) AS malformed_published,
         count(*) FILTER (WHERE question_order BETWEEN 1 AND 3 AND status = 'PUBLISHED'
                          AND choices = 4 AND correct = 1) AS eligible_slots,
         count(*) FILTER (WHERE same_topic IS DISTINCT FROM true OR concept_listed_on_stage IS DISTINCT FROM true
                          OR concept_status IS DISTINCT FROM 'PUBLISHED') AS links_to_review,
         array_agg(question_order ORDER BY question_order) AS assigned_slots
  FROM assigned GROUP BY stage_id
)
SELECT s.requested_title, s.stage_id, s.stage_code, s.topic_id, s.status AS stage_status,
       s.topic_status, s.max_question_count, s.required_correct_count, s.initial_monster_hp,
       (s.reward_total_exp >= 0 AND s.reward_economy_exp >= 0 AND s.reward_coin >= 0) IS TRUE AS rewards_ready,
       COALESCE(a.assignments, 0) AS assigned_questions, COALESCE(a.published, 0) AS published,
       COALESCE(a.approved_not_published, 0) AS approved_not_published,
       COALESCE(a.valid_choice_sets, 0) AS valid_choice_sets,
       COALESCE(a.malformed_published, 0) AS malformed_published, a.assigned_slots,
       COALESCE(a.eligible_slots, 0) AS eligible_slots,
       CASE WHEN s.stage_id IS NOT NULL THEN 3 - COALESCE(a.eligible_slots, 0) END AS missing_or_invalid_slots,
       COALESCE(a.links_to_review, 0) AS concept_links_to_review
FROM target s LEFT JOIN totals a ON a.stage_id = s.stage_id
ORDER BY s.requested_title, s.stage_id;

SELECT count(*) AS total_costumes,
       count(*) FILTER (WHERE is_on_sale AND category::text = 'OUTFIT') AS outfits_for_sale,
       count(*) FILTER (WHERE is_on_sale AND price_coin IS NULL) AS sale_missing_price,
       count(*) FILTER (WHERE is_on_sale AND NULLIF(btrim(image_key), '') IS NULL) AS sale_missing_image_key,
       count(*) FILTER (WHERE is_on_sale AND NULLIF(btrim(thumbnail_key), '') IS NULL) AS sale_missing_thumbnail_key
FROM character.costumes;
ROLLBACK;
