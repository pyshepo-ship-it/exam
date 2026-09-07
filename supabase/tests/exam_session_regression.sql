-- Run ONLY on a disposable database after migrations 001–029 (or schema.sql + 018–029).
-- Fixtures and changes roll back. RPCs are exercised as anon, not the table owner.
BEGIN;

CREATE FUNCTION pg_temp.expect_denied(p_sql TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_denied BOOLEAN := false;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
    v_denied := true;
  END;
  ASSERT v_denied, 'Expected an authorization error: ' || p_sql;
END;
$$;

INSERT INTO public.grades(id, name, academic_year, created_at)
VALUES ('__exam_test_grade', 'Test grade', '', '');
INSERT INTO public.groups(id, grade_id, name, days, start_time, end_time, monthly_fee)
VALUES ('__exam_test_group', '__exam_test_grade', 'Test group', '[]', '', '', 0);
INSERT INTO public.students(id, name, grade_id, group_id, created_at, updated_at)
VALUES ('__exam_test_owner', 'Test Owner', '__exam_test_grade', '__exam_test_group', '', ''),
       ('__exam_test_other', 'Other Owner', '__exam_test_grade', '__exam_test_group', '', '');
INSERT INTO public.student_sessions(student_id, token_hash, created_at, expires_at)
VALUES
  ('__exam_test_owner', encode(extensions.digest('exam-test-owner-token', 'sha256'), 'hex'),
    '', to_char(clock_timestamp() AT TIME ZONE 'UTC' + interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  ('__exam_test_other', encode(extensions.digest('exam-test-other-token', 'sha256'), 'hex'),
    '', to_char(clock_timestamp() AT TIME ZONE 'UTC' + interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

INSERT INTO public.exams(id, title, academic_year, duration, questions, created_at, updated_at)
SELECT '__exam_test_duration_' || n, 'Duration test', '', minutes,
       '{"deliveryMode":"online","allowOnline":true,"accessMode":"public","items":[]}'::jsonb, '', ''
FROM (VALUES (1, NULL::integer), (2, 0), (3, -5), (4, 1), (5, 30), (6, 2000)) d(n, minutes);

INSERT INTO public.exams(id, title, academic_year, duration, questions, created_at, updated_at)
VALUES ('__exam_test_private', 'Private test', '', 30,
  '{"deliveryMode":"online","allowOnline":true,"accessMode":"members","onlineExamMode":"mixed","answerVisibility":"atEnd","items":[
    {"id":"q1","questionType":1,"subQuestions":[{"id":"objective","marks":2,"choices":[{"id":"right","isCorrect":true},{"id":"wrong","isCorrect":false}]}]},
    {"id":"q2","questionType":4,"subQuestions":[{"id":"essay","marks":3,"correctAnswer":"Never disclose this"}]}
  ]}', '', ''),
  ('__exam_test_public', 'Public test', '', 30,
  '{"deliveryMode":"online","allowOnline":true,"accessMode":"public","answerVisibility":"afterEach","maxAttempts":2,"items":[]}', '', '');

CREATE TEMP TABLE exam_test_sessions(kind TEXT PRIMARY KEY, payload JSONB);
GRANT SELECT, INSERT ON exam_test_sessions TO anon;

SET LOCAL ROLE anon;
DO $$
DECLARE v_session JSONB; v_case RECORD; v_expected INTEGER; v_public JSONB;
BEGIN
  SELECT value INTO v_public FROM jsonb_array_elements(public.get_public_online_exams())
    WHERE value->>'id'='__exam_test_private';
  ASSERT (v_public->>'server_now')::timestamptz IS NOT NULL, 'Public availability clock missing';
  ASSERT NOT (v_public->'questions'->'items'->0->'subQuestions'->0->'choices'->0 ? 'isCorrect'), 'Public answer key leaked';
  ASSERT NOT (v_public->'questions'->'items'->1->'subQuestions'->0 ? 'correctAnswer'), 'Public essay model leaked';
  ASSERT NOT has_table_privilege('anon', 'public.online_exam_sessions', 'SELECT'), 'Raw sessions exposed';
  ASSERT NOT has_table_privilege('anon', 'public.exam_attempts', 'SELECT'), 'Raw attempts exposed';
  ASSERT NOT has_function_privilege('anon', 'public.authorize_online_exam_session(text,text,text)', 'EXECUTE'), 'Internal capability helper exposed';
  ASSERT NOT has_function_privilege('anon', 'public.online_exam_student_id(text)', 'EXECUTE'), 'Internal identity helper exposed';
  ASSERT to_regprocedure('public.get_online_exam_result(text,text)') IS NULL, 'Old result bypass remains';
  ASSERT to_regprocedure('public.get_online_exam_answer_feedback(text,text)') IS NULL, 'Old feedback bypass remains';
  ASSERT to_regprocedure('public.submit_online_exam_session(text,text,jsonb)') IS NULL, 'Old submission bypass remains';
  ASSERT to_regprocedure('public.start_online_exam_session(text,text,text,text,text,text,text,text,text,text)') IS NULL, 'Old start bypass remains';

  FOR v_case IN SELECT * FROM (VALUES (1, 60), (2, 60), (3, 60), (4, 1), (5, 30), (6, 1440)) x(n, minutes) LOOP
    v_session := public.start_online_exam_session(
      '__exam_test_duration_session_' || v_case.n, '__exam_test_duration_attempt_' || v_case.n,
      '__exam_test_duration_' || v_case.n, NULL, 'Test Guest');
    v_expected := v_case.minutes * 60;
    ASSERT extract(epoch FROM ((v_session->>'expiresAt')::timestamptz - (v_session->>'startedAt')::timestamptz)) = v_expected,
      'Duration mismatch for ' || v_case.n;
    ASSERT (v_session->>'serverNow')::timestamptz >= (v_session->>'startedAt')::timestamptz, 'Missing server clock';
  END LOOP;

  PERFORM pg_temp.expect_denied($q$ SELECT public.start_online_exam_session(
    '__exam_test_forged_session', '__exam_test_forged_attempt', '__exam_test_private',
    '__exam_test_owner', 'Fake Name') $q$);
  PERFORM pg_temp.expect_denied($q$ SELECT public.start_online_exam_session(
    '__exam_test_forged_session', '__exam_test_forged_attempt', '__exam_test_private',
    '__exam_test_owner', 'Fake Name', p_student_token => 'exam-test-other-token') $q$);

  v_session := public.start_online_exam_session(
    '__exam_test_owner_session', '__exam_test_owner_attempt', '__exam_test_private',
    '__exam_test_owner', 'Fake Name', NULL, 'fake-grade', 'fake-group',
    p_student_token => 'exam-test-owner-token');
  INSERT INTO exam_test_sessions VALUES ('owner', v_session);

  -- Early automatic submission MUST NOT write answers or create an attempt.
  ASSERT public.submit_online_exam_session(v_session->>'id', v_session->>'secret',
    '{"objective":{"choiceId":"wrong"}}', true, 'exam-test-owner-token')->>'state' = 'in_progress';
  ASSERT public.get_online_exam_result(v_session->>'id', v_session->>'secret', 'exam-test-owner-token')->>'state' = 'in_progress';
  ASSERT public.get_online_exam_answer_feedback(v_session->>'id', v_session->>'secret', 'exam-test-owner-token')->'answers' = '{}'::jsonb,
    'atEnd feedback appeared before submission';

  -- Status is read-only and has exactly four non-personal keys, even without portal auth.
  v_session := public.get_online_exam_session_status(v_session->>'id', v_session->>'secret');
  ASSERT v_session->>'state' = 'in_progress';
  ASSERT v_session - 'state' - 'startedAt' - 'expiresAt' - 'serverNow' = '{}'::jsonb, 'Status leaked data';
END;
$$;
RESET ROLE;
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.exam_attempts WHERE id = '__exam_test_owner_attempt'), 'Early auto submission consumed attempt';
  ASSERT (SELECT answers = '{}'::jsonb AND student_name = 'Test Owner' AND grade_id = '__exam_test_grade'
    AND group_id = '__exam_test_group' FROM public.online_exam_sessions WHERE id = '__exam_test_owner_session'),
    'Untrusted identity accepted or early timeout changed answers';
END;
$$;

SET LOCAL ROLE anon;
DO $$
DECLARE v_session JSONB; v_result JSONB;
BEGIN
  SELECT payload INTO v_session FROM exam_test_sessions WHERE kind = 'owner';
  PERFORM pg_temp.expect_denied(format('SELECT public.get_online_exam_session_status(%L, %L)', v_session->>'id', 'wrong-secret'));
  PERFORM pg_temp.expect_denied(format('SELECT public.get_online_exam_result(%L, %L)', v_session->>'id', v_session->>'secret'));
  PERFORM pg_temp.expect_denied(format('SELECT public.get_online_exam_answer_feedback(%L, %L, %L)', v_session->>'id', v_session->>'secret', 'exam-test-other-token'));
  PERFORM pg_temp.expect_denied(format('SELECT public.submit_online_exam_session(%L, %L, NULL, false, %L)', v_session->>'id', v_session->>'secret', 'exam-test-other-token'));

  ASSERT public.save_online_exam_progress(v_session->>'id', v_session->>'secret',
    '{"objective":{"choiceId":"right"},"essay":{"text":"Student answer"}}')->>'state' = 'saved';
  v_result := public.submit_online_exam_session(v_session->>'id', v_session->>'secret',
    '{"objective":{"choiceId":"right"},"essay":{"text":"Student answer"}}', false, 'exam-test-owner-token');
  ASSERT v_result->>'state' = 'submitted' AND v_result->>'timedOut' = 'false', 'Manual submission mislabelled';
  ASSERT (v_result->'attempt'->>'score')::numeric = 2, 'Objective grading changed';
  ASSERT (v_result->'attempt'->'manual_override'->>'manualScore')::numeric = 0;
  ASSERT v_result->'feedback'->'objective'->>'choiceId' = 'right', 'atEnd objective feedback missing';
  ASSERT NOT (v_result->'feedback' ? 'essay'), 'Essay model answer leaked';
END;
$$;
RESET ROLE;

-- Teacher adds an unreleased review, override, and adoption AFTER the first submission.
UPDATE public.exam_attempts
   SET answers = answers || '{"essay":{"text":"Student answer","review":{"score":3,"comment":"Private teacher comment"}}}'::jsonb,
       manual_override = manual_override || '{"manualScore":3,"score":5,"reason":"Private override","adoptedAt":"2026-09-07T12:00:00Z"}'::jsonb
 WHERE id = '__exam_test_owner_attempt';

SET LOCAL ROLE anon;
DO $$
DECLARE v_session JSONB; v_result JSONB; v_repeat JSONB;
BEGIN
  SELECT payload INTO v_session FROM exam_test_sessions WHERE kind = 'owner';
  v_result := public.get_online_exam_result(v_session->>'id', v_session->>'secret', 'exam-test-owner-token');
  v_repeat := public.submit_online_exam_session(v_session->>'id', v_session->>'secret', '{}', false, 'exam-test-owner-token');
  ASSERT v_result->'attempt' = v_repeat->'attempt', 'Repeat submission bypassed safe result gate';
  ASSERT NOT (v_result->'attempt'->'answers'->'essay' ? 'review'), 'Unreleased review leaked';
  ASSERT (v_result->'attempt'->'manual_override'->>'manualScore')::numeric = 0, 'Unreleased manual grade leaked';
  ASSERT NOT (v_result->'attempt'->'manual_override' ? 'score'), 'Unreleased override leaked';
  ASSERT v_result->'attempt'->'manual_override'->>'adoptedAt' = '2026-09-07T12:00:00Z', 'Adoption flag lost';
  PERFORM pg_temp.expect_denied(format('SELECT public.get_online_exam_result(%L, %L)', v_session->>'id', v_session->>'secret'));
  PERFORM pg_temp.expect_denied(format('SELECT public.get_online_exam_result(%L, %L, %L)', v_session->>'id', v_session->>'secret', 'exam-test-other-token'));
  PERFORM pg_temp.expect_denied(format('SELECT public.submit_online_exam_session(%L, %L)', v_session->>'id', v_session->>'secret'));
END;
$$;
RESET ROLE;

UPDATE public.exam_attempts SET manual_override = manual_override || '{"resultReleasedAt":"2026-09-07T12:30:00Z"}'::jsonb
 WHERE id = '__exam_test_owner_attempt';
-- Closing the exam/review window must NOT hide the owner's already submitted result.
UPDATE public.exams SET questions = questions || '{"reviewOpen":true,"allowOnline":false}'::jsonb WHERE id = '__exam_test_private';
SET LOCAL ROLE anon;
DO $$
DECLARE v_session JSONB; v_result JSONB;
BEGIN
  SELECT payload INTO v_session FROM exam_test_sessions WHERE kind = 'owner';
  v_result := public.get_online_exam_result(v_session->>'id', v_session->>'secret', 'exam-test-owner-token');
  ASSERT (v_result->'attempt'->'manual_override'->>'manualScore')::numeric = 3;
  ASSERT v_result->'attempt'->'answers'->'essay'->'review'->>'comment' = 'Private teacher comment';
  ASSERT (v_result->'attempt'->'manual_override'->>'score')::numeric = 5;

  v_session := public.start_online_exam_session('__exam_test_guest_session', '__exam_test_guest_attempt', '__exam_test_public', NULL, 'Public Guest');
  INSERT INTO exam_test_sessions VALUES ('guest', v_session);
  PERFORM public.save_online_exam_progress(v_session->>'id', v_session->>'secret', '{"saved":{"text":"Before timeout"}}');
END;
$$;
RESET ROLE;

-- Expiry is controlled on the test server; no wall-clock manipulation by the client.
UPDATE public.online_exam_sessions SET started_at = clock_timestamp() - interval '61 seconds', expires_at = clock_timestamp() - interval '1 second'
 WHERE id = '__exam_test_guest_session';
SET LOCAL ROLE anon;
DO $$
DECLARE v_session JSONB; v_result JSONB;
BEGIN
  SELECT payload INTO v_session FROM exam_test_sessions WHERE kind = 'guest';
  ASSERT public.get_online_exam_session_status(v_session->>'id', v_session->>'secret')->>'state' = 'expired';
  ASSERT public.save_online_exam_progress(v_session->>'id', v_session->>'secret', '{"late":{"text":"Too late"}}')->>'state' = 'expired';
  v_result := public.submit_online_exam_session(v_session->>'id', v_session->>'secret', '{"late":{"text":"Too late"}}', true);
  ASSERT v_result->>'state' = 'submitted' AND v_result->>'timedOut' = 'true';
  ASSERT v_result->'attempt'->'answers' = '{"saved":{"text":"Before timeout"}}'::jsonb, 'Late answers accepted or saved answers lost';
  ASSERT public.get_online_exam_result(v_session->>'id', v_session->>'secret')->>'state' = 'submitted', 'Public guest result unavailable';
END;
$$;
RESET ROLE;

UPDATE public.exams SET questions = questions || '{"accessMode":"members"}'::jsonb WHERE id = '__exam_test_public';
UPDATE public.student_sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE student_id = '__exam_test_owner';
SET LOCAL ROLE anon;
DO $$
DECLARE v_session JSONB;
BEGIN
  SELECT payload INTO v_session FROM exam_test_sessions WHERE kind = 'guest';
  PERFORM pg_temp.expect_denied(format('SELECT public.get_online_exam_result(%L, %L)', v_session->>'id', v_session->>'secret'));
  PERFORM pg_temp.expect_denied(format('SELECT public.get_online_exam_answer_feedback(%L, %L)', v_session->>'id', v_session->>'secret'));
  PERFORM pg_temp.expect_denied(format('SELECT public.submit_online_exam_session(%L, %L)', v_session->>'id', v_session->>'secret'));
  SELECT payload INTO v_session FROM exam_test_sessions WHERE kind = 'owner';
  PERFORM pg_temp.expect_denied(format('SELECT public.get_online_exam_result(%L, %L, %L)', v_session->>'id', v_session->>'secret', 'exam-test-owner-token'));
END;
$$;
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT count(*) = 2 FROM public.exam_attempts WHERE id IN ('__exam_test_owner_attempt', '__exam_test_guest_attempt')), 'Idempotency failed';
  ASSERT (SELECT answers->'essay'->'review'->>'comment' = 'Private teacher comment' FROM public.exam_attempts WHERE id = '__exam_test_owner_attempt'), 'Read-only result mutated review';
END;
$$;
-- Existing device bans / per-device limits / extra-attempt grants must survive 029.
INSERT INTO public.exams(id, title, academic_year, duration, questions, created_at, updated_at)
VALUES ('__exam_test_limits', 'Limit test', '', 30,
  '{"deliveryMode":"online","allowOnline":true,"accessMode":"public","maxAttempts":1,"items":[]}', '', '');
INSERT INTO public.device_bans(id, fp_hash, reason) VALUES ('__exam_test_ban', repeat('d',64), 'Test only');
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM pg_temp.expect_denied($q$ SELECT public.start_online_exam_session(
    '__exam_test_banned_session', '__exam_test_banned_attempt', '__exam_test_limits', NULL, 'Banned Guest',
    p_device_card=>repeat('e',32), p_device_fp=>repeat('d',64)) $q$);
  PERFORM public.start_online_exam_session('__exam_test_limited_first', '__exam_test_limited_attempt1', '__exam_test_limits',
    NULL, 'First Guest', p_device_card=>repeat('c',32));
  PERFORM pg_temp.expect_denied($q$ SELECT public.start_online_exam_session(
    '__exam_test_limited_second', '__exam_test_limited_attempt2', '__exam_test_limits', NULL, 'Different Name',
    p_device_card=>repeat('c',32)) $q$);
END;
$$;
RESET ROLE;
INSERT INTO public.device_attempt_grants(id, exam_id, card, extra)
VALUES ('__exam_test_extra', '__exam_test_limits', repeat('c',32), 1);
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.start_online_exam_session('__exam_test_limited_second', '__exam_test_limited_attempt2', '__exam_test_limits',
    NULL, 'Different Name', p_device_card=>repeat('c',32));
  PERFORM pg_temp.expect_denied($q$ SELECT public.start_online_exam_session(
    '__exam_test_limited_third', '__exam_test_limited_attempt3', '__exam_test_limits', NULL, 'Third Guest',
    p_device_card=>repeat('c',32)) $q$);
END;
$$;
RESET ROLE;

-- Revocation must deny a still-valid-looking cookie as well, not only expiry.
UPDATE public.student_sessions SET expires_at = '2999-01-01T00:00:00.000Z' WHERE student_id = '__exam_test_owner';
INSERT INTO public.student_accounts(id, email, student_id, active)
VALUES ('__exam_test_account', 'exam-test-only@example.invalid', '__exam_test_owner', false);
SET LOCAL ROLE anon;
DO $$
DECLARE v_session JSONB;
BEGIN
  SELECT payload INTO v_session FROM exam_test_sessions WHERE kind='owner';
  PERFORM pg_temp.expect_denied(format('SELECT public.get_online_exam_result(%L, %L, %L)', v_session->>'id', v_session->>'secret', 'exam-test-owner-token'));
END;
$$;
RESET ROLE;
UPDATE public.student_accounts SET active=true WHERE id='__exam_test_account';
DELETE FROM public.student_sessions WHERE student_id='__exam_test_owner';
SET LOCAL ROLE anon;
DO $$
DECLARE v_session JSONB;
BEGIN
  SELECT payload INTO v_session FROM exam_test_sessions WHERE kind='owner';
  PERFORM pg_temp.expect_denied(format('SELECT public.get_online_exam_result(%L, %L, %L)', v_session->>'id', v_session->>'secret', 'exam-test-owner-token'));
END;
$$;
RESET ROLE;

ROLLBACK;
