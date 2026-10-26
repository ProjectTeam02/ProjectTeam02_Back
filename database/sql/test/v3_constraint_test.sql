-- v3 최종(rev.5) 제약 검증 (app_user 계정으로 실행)
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on
SET client_min_messages = warning;
CREATE TEMP TABLE result (no int, name text, ok boolean, detail text);

-- 기대한 오류(SQLSTATE)가 나야 통과
CREATE FUNCTION pg_temp.expect_err(no int, name text, stmt text, code text) RETURNS void AS $$
BEGIN
  BEGIN EXECUTE stmt;
    INSERT INTO result VALUES (no, name, false, '오류 없이 실행됨');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO result VALUES (no, name, SQLSTATE = code, SQLSTATE || ' ' || SQLERRM);
  END;
END $$ LANGUAGE plpgsql;
CREATE FUNCTION pg_temp.expect_ok(no int, name text, stmt text) RETURNS void AS $$
BEGIN
  BEGIN EXECUTE stmt; INSERT INTO result VALUES (no, name, true, 'OK');
  EXCEPTION WHEN OTHERS THEN INSERT INTO result VALUES (no, name, false, SQLSTATE || ' ' || SQLERRM);
  END;
END $$ LANGUAGE plpgsql;

-- 최소 시드 (고정 UUID)
INSERT INTO users (user_id, email, nickname) VALUES ('00000000-0000-0000-0000-000000000001','pia@example.com','pia');
INSERT INTO topics (topic_id, topic_code, topic_no, title) VALUES ('00000000-0000-0000-0000-0000000000a1','T1',1,'돈과 시장');
INSERT INTO stages (stage_id, topic_id, stage_code, stage_no, stage_type, title, max_question_count, required_correct_count, initial_monster_hp)
  VALUES ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','1-1',1,'NORMAL','수요와 공급',3,2,2);
INSERT INTO concepts (concept_id, concept_code, topic_id, title) VALUES
  ('00000000-0000-0000-0000-0000000000c1','C-DEMAND','00000000-0000-0000-0000-0000000000a1','수요'),
  ('00000000-0000-0000-0000-0000000000c2','C-SUPPLY','00000000-0000-0000-0000-0000000000a1','공급');
INSERT INTO questions (question_id, question_code, concept_id, question_text, explanation, generated_by)
  VALUES ('00000000-0000-0000-0000-0000000000d1','Q-1','00000000-0000-0000-0000-0000000000c1','가격이 오르면?','수요 감소','MANUAL');
INSERT INTO question_choices (choice_id, question_id, base_order, choice_text, is_correct) VALUES
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1',1,'감소',true);
INSERT INTO ai_conversations (conversation_id, user_id, context_stage_id)
  VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1');
INSERT INTO user_wallets (user_id, coin_balance) VALUES ('00000000-0000-0000-0000-000000000001', 100);
INSERT INTO costumes (item_id, costume_code, name, category, price_coin, is_on_sale) VALUES ('00000000-0000-0000-0000-000000000031','TOP-1','모험가 상의','TOP',50,true), ('00000000-0000-0000-0000-000000000032','BOTTOM-1','모험가 하의','BOTTOM',80,true);
INSERT INTO questions (question_id, question_code, concept_id, question_text, explanation, generated_by)
  VALUES ('00000000-0000-0000-0000-0000000000d2','Q-2','00000000-0000-0000-0000-0000000000c2','공급이 늘면?','가격 하락','MANUAL');
INSERT INTO question_choices (choice_id, question_id, base_order, choice_text, is_correct) VALUES
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d2',1,'하락',true);

-- 1~5 Enum 대문자·용어
SELECT pg_temp.expect_ok (1, 'Enum 대문자 WARRIOR 저장 (API와 동일)', $q$INSERT INTO character_classes (class_code, name) VALUES ('WARRIOR','검사')$q$);
SELECT pg_temp.expect_err(2, 'Enum 소문자 warrior 거부', $q$INSERT INTO character_classes (class_code, name) VALUES ('warrior','검사2')$q$, '22P02');
SELECT pg_temp.expect_ok (3, 'AI 대화 생성: entry_point 없이 conceptId만', $q$INSERT INTO ai_conversations (user_id, context_concept_id) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1')$q$);
SELECT pg_temp.expect_ok (4, '응시 mode = RETRY (API mode), 재학습 RELEARN', $q$INSERT INTO learning_attempts (attempt_id, user_id, stage_id, attempt_no, attempt_type, mode, max_question_count, required_correct_count, initial_hp) VALUES ('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1',1,'RELEARN','RETRY',3,2,2)$q$);
SELECT pg_temp.expect_err(5, '옛 값 replay 거부', $q$INSERT INTO learning_attempts (user_id, stage_id, attempt_no, attempt_type, max_question_count, required_correct_count, initial_hp) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1',2,'REPLAY',3,2,2)$q$, '22P02');

-- 6~7 submissionId = PK
SELECT pg_temp.expect_ok (6, '퀴즈 답안: 앱이 만든 submissionId를 PK로 저장', $q$INSERT INTO question_submissions (submission_id, attempt_id, question_id, sequence_no, displayed_choice_order, choice_id, selected_position, is_correct, hp_before, hp_after) VALUES ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-0000000000d1',1,ARRAY['00000000-0000-0000-0000-0000000000e1']::uuid[],'00000000-0000-0000-0000-0000000000e1',1,true,2,1)$q$);
SELECT pg_temp.expect_err(7, '같은 submissionId 재제출 거부 (PK 중복)', $q$INSERT INTO question_submissions (submission_id, attempt_id, question_id, sequence_no, displayed_choice_order, choice_id, selected_position, is_correct, hp_before, hp_after) VALUES ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-0000000000d1',2,ARRAY['00000000-0000-0000-0000-0000000000e1']::uuid[],'00000000-0000-0000-0000-0000000000e1',1,true,1,0)$q$, '23505');

-- 8~10 북마크
SELECT pg_temp.expect_ok (8, '정답 여부와 무관한 북마크 등록', $q$INSERT INTO review_items (user_id, question_code, latest_question_id, concept_code, first_reason, is_bookmarked, bookmarked_at) VALUES ('00000000-0000-0000-0000-000000000001','Q-1','00000000-0000-0000-0000-0000000000d1','C-DEMAND','BOOKMARK',true,now())$q$);
SELECT pg_temp.expect_err(9, '같은 문제 두 번째 행 거부 (오답·북마크 통합 1행)', $q$INSERT INTO review_items (user_id, question_code, latest_question_id, concept_code, first_reason) VALUES ('00000000-0000-0000-0000-000000000001','Q-1','00000000-0000-0000-0000-0000000000d1','C-DEMAND','WRONG')$q$, '23505');
SELECT pg_temp.expect_err(10, '옛 사유 CONFUSING 거부', $q$UPDATE review_items SET first_reason = 'CONFUSING'$q$, '22P02');

-- 11 복습 답안: 서버가 미리 만든 submissionId
INSERT INTO review_attempts (review_attempt_id, user_id, review_type, entry_point, question_count)
  VALUES ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','SINGLE','REVIEW_NOTE',1);
INSERT INTO review_submissions (submission_id, review_attempt_id, review_item_id, question_id, sequence_no, displayed_choice_order)
  SELECT '00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000011', review_item_id, latest_question_id, 1, ARRAY['00000000-0000-0000-0000-0000000000e1']::uuid[] FROM review_items;
SELECT pg_temp.expect_err(11, '복습 답안 같은 submissionId 행 재생성 거부', $q$INSERT INTO review_submissions (submission_id, review_attempt_id, review_item_id, question_id, sequence_no, displayed_choice_order) SELECT '00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000011', review_item_id, latest_question_id, 2, ARRAY['00000000-0000-0000-0000-0000000000e1']::uuid[] FROM review_items$q$, '23505');

-- 12~13 구매 requestId·itemId
INSERT INTO coin_ledger (coin_ledger_id, user_id, transaction_type, reason, amount, balance_before, balance_after, ref_type, ref_id, request_id)
  VALUES ('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000001','SPEND','COSTUME_PURCHASE',-50,100,50,'COSTUME','00000000-0000-0000-0000-000000000031','req-1');
SELECT pg_temp.expect_ok (12, '구매: user_costumes에 itemId 저장', $q$INSERT INTO user_costumes (user_id, item_id, acquire_type, coin_ledger_id) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000031','PURCHASE','00000000-0000-0000-0000-000000000071')$q$);
SELECT pg_temp.expect_err(13, '같은 구매 requestId 재요청 거부', $q$INSERT INTO coin_ledger (user_id, transaction_type, reason, amount, balance_before, balance_after, ref_type, ref_id, request_id) VALUES ('00000000-0000-0000-0000-000000000001','SPEND','COSTUME_PURCHASE',-50,50,0,'COSTUME','00000000-0000-0000-0000-000000000032','req-1')$q$, '23505');

-- 14~15 contentPosition
SELECT pg_temp.expect_ok (14, '학습 위치 contentPosition = 3페이지 저장', $q$INSERT INTO user_stage_progress (user_id, stage_id, content_position, content_position_updated_at) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1',3,now())$q$);
SELECT pg_temp.expect_err(15, '학습 위치 0 거부 (1부터)', $q$UPDATE user_stage_progress SET content_position = 0$q$, '23514');

-- 16~18 학습 일정
SELECT pg_temp.expect_ok (16, '일정: stageId 없이 conceptId + title', $q$INSERT INTO study_plans (user_id, scheduled_date, concept_id, title) VALUES ('00000000-0000-0000-0000-000000000001','2026-10-30','00000000-0000-0000-0000-0000000000c1','수요 복습')$q$);
SELECT pg_temp.expect_err(17, '일정 title 31자 거부', $q$INSERT INTO study_plans (user_id, scheduled_date, title) VALUES ('00000000-0000-0000-0000-000000000001','2026-10-30', repeat('가',31))$q$, '22001');
SELECT pg_temp.expect_err(18, '일정 title 빈 문자열 거부', $q$INSERT INTO study_plans (user_id, scheduled_date, title) VALUES ('00000000-0000-0000-0000-000000000001','2026-10-30','')$q$, '23514');

-- 19~20 선수 개념
SELECT pg_temp.expect_ok (19, '선수 개념 등록 (공급 → 수요)', $q$INSERT INTO concept_prerequisites (concept_code, prerequisite_concept_code) VALUES ('C-SUPPLY','C-DEMAND')$q$);
SELECT pg_temp.expect_err(20, '자기 자신을 선수 개념으로 거부', $q$INSERT INTO concept_prerequisites (concept_code, prerequisite_concept_code) VALUES ('C-DEMAND','C-DEMAND')$q$, '23514');

-- 21 알림 설정 시간대 기본값
INSERT INTO user_settings (user_id) VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO result SELECT 21, '알림 시간대 기본값 Asia/Seoul', timezone = 'Asia/Seoul', timezone FROM user_settings;

-- 22~25 AI 멀티턴
INSERT INTO ai_requests (request_id, user_id, conversation_id, request_type, model_tier, reserved_at)
  VALUES ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','TUTOR','BASIC','2026-10-24 16:30:00+00');
INSERT INTO result SELECT 22, 'AI 사용량 날짜: UTC 16:30 → KST 다음 날', usage_date = '2026-10-25', usage_date::text FROM ai_requests;
INSERT INTO ai_messages (conversation_id, sequence_no, role, content, client_message_id, context_stage_id, rewritten_query, status)
  VALUES ('00000000-0000-0000-0000-0000000000f1',1,'USER','수요가 뭐야?','cm-1','00000000-0000-0000-0000-0000000000b1','수요의 정의','COMPLETED');
SELECT pg_temp.expect_err(23, '같은 clientMessageId 재전송 거부', $q$INSERT INTO ai_messages (conversation_id, sequence_no, role, content, client_message_id) VALUES ('00000000-0000-0000-0000-0000000000f1',2,'USER','수요가 뭐야?','cm-1')$q$, '23505');
INSERT INTO ai_messages (conversation_id, sequence_no, role, content, status, history_from_seq)
  VALUES ('00000000-0000-0000-0000-0000000000f1',2,'ASSISTANT','','PENDING',1);
SELECT pg_temp.expect_err(24, '답변 생성 중 두 번째 PENDING 답변 거부', $q$INSERT INTO ai_messages (conversation_id, sequence_no, role, content, status) VALUES ('00000000-0000-0000-0000-0000000000f1',3,'ASSISTANT','','PENDING')$q$, '23505');
UPDATE ai_messages SET status = 'COMPLETED', content = '수요는 ...' WHERE sequence_no = 2;
SELECT pg_temp.expect_ok (25, '직전 답변 완료 후 다음 턴 PENDING 허용', $q$INSERT INTO ai_messages (conversation_id, sequence_no, role, content, status) VALUES ('00000000-0000-0000-0000-0000000000f1',3,'ASSISTANT','','PENDING')$q$);

-- 26~31 rev.3 무결성
SELECT pg_temp.expect_err(26, '같은 Stage에 진행 중 응시 2개 거부', $q$INSERT INTO learning_attempts (user_id, stage_id, attempt_no, max_question_count, required_correct_count, initial_hp) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1',3,3,2,2)$q$, '23505');
UPDATE learning_attempts SET status = 'PASSED', ended_at = now() WHERE attempt_id = '00000000-0000-0000-0000-000000000041';
SELECT pg_temp.expect_ok (27, '이전 응시 종료 후 새 응시 허용', $q$INSERT INTO learning_attempts (user_id, stage_id, attempt_no, max_question_count, required_correct_count, initial_hp) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1',3,3,2,2)$q$);
INSERT INTO user_characters (user_id, class_id) SELECT '00000000-0000-0000-0000-000000000001', class_id FROM character_classes WHERE class_code = 'WARRIOR';
SELECT pg_temp.expect_err(28, '보유하지 않은 하의 장착 거부', $q$INSERT INTO user_equipped_costumes (user_id, category, item_id) VALUES ('00000000-0000-0000-0000-000000000001','BOTTOM','00000000-0000-0000-0000-000000000032')$q$, '23503');
INSERT INTO user_costumes (user_id, item_id, acquire_type) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000032','DEFAULT');
SELECT pg_temp.expect_err(29, '상의 칸에 하의 장착 거부 (부위 불일치)', $q$INSERT INTO user_equipped_costumes (user_id, category, item_id) VALUES ('00000000-0000-0000-0000-000000000001','TOP','00000000-0000-0000-0000-000000000032')$q$, '23503');
SELECT pg_temp.expect_ok (40, '보유한 상의를 상의 칸에 장착', $q$INSERT INTO user_equipped_costumes (user_id, category, item_id) VALUES ('00000000-0000-0000-0000-000000000001','TOP','00000000-0000-0000-0000-000000000031')$q$);
SELECT pg_temp.expect_ok (41, '하의도 함께 장착 (상의+하의 동시)', $q$INSERT INTO user_equipped_costumes (user_id, category, item_id) VALUES ('00000000-0000-0000-0000-000000000001','BOTTOM','00000000-0000-0000-0000-000000000032')$q$);
SELECT pg_temp.expect_err(42, '같은 부위에 두 번째 행 거부 (부위당 1개)', $q$INSERT INTO user_equipped_costumes (user_id, category, item_id) VALUES ('00000000-0000-0000-0000-000000000001','TOP','00000000-0000-0000-0000-000000000031')$q$, '23505');
SELECT pg_temp.expect_err(43, '코스튬 부위 없이 등록 거부', $q$INSERT INTO costumes (costume_code, name) VALUES ('X-1','부위 없음')$q$, '23502');
SELECT pg_temp.expect_err(30, '다른 문항의 선택지로 답안 제출 거부', $q$INSERT INTO question_submissions (submission_id, attempt_id, question_id, sequence_no, displayed_choice_order, choice_id, selected_position, is_correct, hp_before, hp_after) VALUES ('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-0000000000d2',2,ARRAY['00000000-0000-0000-0000-0000000000e1']::uuid[],'00000000-0000-0000-0000-0000000000e1',1,true,1,0)$q$, '23503');

SELECT pg_temp.expect_ok (31, '같은 문항의 선택지면 저장', $q$INSERT INTO question_submissions (submission_id, attempt_id, question_id, sequence_no, displayed_choice_order, choice_id, selected_position, is_correct, hp_before, hp_after) VALUES ('00000000-0000-0000-0000-000000000053','00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-0000000000d2',2,ARRAY['00000000-0000-0000-0000-0000000000e2']::uuid[],'00000000-0000-0000-0000-0000000000e2',1,true,1,0)$q$);

-- 32~38 rev.4 탈퇴·약관·인덱스
SELECT pg_temp.expect_err(32, '탈퇴 상태인데 탈퇴 시각 없음 거부', $q$UPDATE users SET account_status = 'WITHDRAWN' WHERE user_id = '00000000-0000-0000-0000-000000000001'$q$, '23514');
INSERT INTO terms (terms_id, terms_type, version, title, content, is_required, effective_at) VALUES
  ('00000000-0000-0000-0000-000000000081','SERVICE',1,'서비스 이용약관','(본문)',true,'2026-10-01'),
  ('00000000-0000-0000-0000-000000000082','MARKETING',1,'마케팅 정보 수신 동의','(본문)',false,'2026-10-01');
SELECT pg_temp.expect_err(33, '같은 약관 종류·버전 중복 거부', $q$INSERT INTO terms (terms_type, version, title, content, is_required, effective_at) VALUES ('SERVICE',1,'중복','(본문)',true,now())$q$, '23505');
SELECT pg_temp.expect_ok (34, '필수 동의 + 선택 거부(false) 기록', $q$INSERT INTO user_terms_agreements (user_id, terms_id, agreed) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000081',true), ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000082',false)$q$);
SELECT pg_temp.expect_err(35, '같은 약관 동의 행 중복 거부', $q$INSERT INTO user_terms_agreements (user_id, terms_id, agreed) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000081',true)$q$, '23505');
SELECT pg_temp.expect_ok (36, '회원 탈퇴: 상태·시각 기록 + 이메일·비밀번호 제거, 닉네임 익명화 (학습 기록 유지)', $q$UPDATE users SET account_status = 'WITHDRAWN', withdrawn_at = now(), withdrawal_reason = '사용 안 함', email = NULL, password_hash = NULL, nickname = '탈퇴회원' WHERE user_id = '00000000-0000-0000-0000-000000000001'$q$);
SELECT pg_temp.expect_ok (37, '탈퇴한 이메일로 재가입 허용', $q$INSERT INTO users (email, nickname) VALUES ('pia@example.com','pia2')$q$);
INSERT INTO result SELECT 38, '조회 인덱스 3개 존재 (questions.concept_id, question_submissions.question_id, review_items(user_id,is_bookmarked))', count(*) = 3, count(*)::text || '개'
  FROM pg_indexes WHERE schemaname = 'app' AND (indexdef LIKE '%ON app.questions USING btree (concept_id)%' OR indexdef LIKE '%ON app.question_submissions USING btree (question_id)%' OR indexdef LIKE '%ON app.review_items USING btree (user_id, is_bookmarked)%');

-- 44 권한
SELECT pg_temp.expect_err(44, 'app_user로 DROP TABLE 거부', 'DROP TABLE study_plans', '42501');

SELECT no || ' | ' || CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END || ' | ' || name || ' | ' || left(detail, 70) FROM result ORDER BY no;
SELECT 'TOTAL ' || count(*) FILTER (WHERE ok) || '/' || count(*) FROM result;
