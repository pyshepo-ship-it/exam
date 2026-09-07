-- تشخيص قراءة فقط للمعلّم / SQL Editor، قبل 029 أو بعده. لا يغيّر أي محاولة.
-- لا يعرض أسرار الجلسات أو الإجابات أو أسماء/هواتف الطلاب.
-- تنبيه: التسليم المبكر قد يكون يدوياً سليماً؛ الطوابع وحدها لا تثبت سببه.
-- null في timedOut ليس false: قد يكون صف المحاولة أو حقيبة المراجعة أو المفتاح
-- مفقوداً. النسخة القديمة من المزامنة كانت تُسقط false عند إعادة حفظ المحاولة.
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';

-- 1) هل الإصلاح مطبق؟ وهل بقي توقيع قديم يمكنه تجاوز التحقق؟
SELECT
  to_regprocedure('public.get_online_exam_session_status(text,text)') IS NOT NULL AS has_clock_status,
  to_regprocedure('public.start_online_exam_session(text,text,text,text,text,text,text,text,text,text,text)') IS NOT NULL AS has_secure_start,
  to_regprocedure('public.submit_online_exam_session(text,text,jsonb,boolean,text)') IS NOT NULL AS has_conditional_submit,
  to_regprocedure('public.get_online_exam_result(text,text,text)') IS NOT NULL AS has_private_result_gate,
  to_regprocedure('public.get_online_exam_result(text,text)') IS NOT NULL AS unsafe_legacy_result_signature,
  to_regprocedure('public.submit_online_exam_session(text,text,jsonb)') IS NOT NULL AS unsafe_legacy_submit_signature;

-- 2) إعدادات تحتاج مراجعة. 0/السالب كان يُمنح دقيقة قبل 029 (الفارغ كان 60).
-- مدة 1 دقيقة صريحة ليست خطأ بذاتها؛ لا يعدّلها الإصلاح.
SELECT id AS exam_id, title, duration AS configured_minutes,
       questions->>'availabilityMode' AS availability_mode,
       questions->>'availableFrom' AS available_from,
       questions->>'availableUntil' AS available_until
FROM public.exams
WHERE COALESCE(questions->>'deliveryMode', CASE WHEN questions->>'allowOnline' = 'true' THEN 'online' ELSE 'offline' END) = 'online'
  AND (duration IS NULL OR duration <= 1 OR duration > 1440)
ORDER BY id;

-- 3) ملخص جميع جلسات آخر 14 يوماً، لا العينة المبكرة وحدها. نستخدم مواعيد
-- الجلسة الفعلية؛ إعداد مدة الاختبار الحالي قد يكون تغير بعد حدوث المشكلة.
-- لا نحول flag مجهولاً إلى false، ولا نستبعد تعارض true مع الطوابع الزمنية.
WITH recent AS (
  SELECT s.exam_id, s.started_at, s.expires_at, s.submitted_at,
         extract(epoch FROM (s.expires_at - s.started_at)) AS allocated_seconds,
         extract(epoch FROM (s.submitted_at - s.started_at)) AS elapsed_seconds,
         a.id IS NOT NULL AS attempt_found,
         CASE WHEN jsonb_typeof(a.manual_override->'timedOut') = 'boolean'
           THEN (a.manual_override->>'timedOut')::boolean END AS server_timed_out
  FROM public.online_exam_sessions s
  LEFT JOIN public.exam_attempts a ON a.id = s.attempt_id
  WHERE s.started_at >= clock_timestamp() - interval '14 days'
)
SELECT exam_id, count(*) AS sessions,
       count(*) FILTER (WHERE submitted_at IS NOT NULL) AS submitted_sessions,
       count(*) FILTER (WHERE allocated_seconds <= 61) AS one_minute_sessions,
       count(*) FILTER (WHERE submitted_at IS NOT NULL AND elapsed_seconds <= 30
         AND submitted_at < expires_at - interval '5 seconds') AS early_submissions_to_review,
       count(*) FILTER (WHERE submitted_at IS NOT NULL AND NOT attempt_found) AS submitted_without_attempt,
       count(*) FILTER (WHERE submitted_at IS NOT NULL AND attempt_found AND server_timed_out IS NULL) AS unknown_timeout_flags,
       count(*) FILTER (WHERE submitted_at IS NOT NULL AND server_timed_out IS NOT NULL
         AND server_timed_out <> (submitted_at >= expires_at)) AS timeout_flag_conflicts,
       count(*) FILTER (WHERE submitted_at IS NULL AND expires_at < clock_timestamp()) AS expired_without_submission
FROM recent
GROUP BY exam_id
ORDER BY early_submissions_to_review DESC, one_minute_sessions DESC;

-- 4) تفاصيل العينة المبكرة + تفسير null + حالة ترحيل الخادم في النتيجة نفسها.
-- هذه عينة مرشحة فقط (وبحد أقصى 200)، فلا تُحسب منها نسبة المتضررين إجمالاً.
-- أعداد مفاتيح الإجابات ليست نصوصاً ولا دليلاً على اكتمال الإجابة/صحتها.
-- وجود API الإصلاح لا يثبت نشر الواجهة الجديدة أو تحديث تبويب الطالب القديم.
SELECT s.id AS session_id, s.attempt_id, s.exam_id,
       s.started_at, s.expires_at, s.submitted_at,
       round(extract(epoch FROM (s.expires_at - s.started_at))) AS allocated_seconds,
       round(extract(epoch FROM (s.submitted_at - s.started_at))) AS elapsed_seconds,
       round(extract(epoch FROM (s.expires_at - s.submitted_at))) AS remaining_seconds_at_submission,
       s.submitted_at >= s.expires_at AS deadline_reached_at_submission,
       a.id IS NOT NULL AS attempt_found,
       CASE WHEN a.id IS NOT NULL THEN
         a.exam_id = s.exam_id AND a.student_id IS NOT DISTINCT FROM s.student_id
       END AS attempt_matches_session,
       a.manual_override->>'timedOut' AS server_timed_out,
       CASE
         WHEN a.id IS NULL THEN 'attempt_missing'
         WHEN a.manual_override IS NULL OR a.manual_override = 'null'::jsonb THEN 'metadata_missing'
         WHEN jsonb_typeof(a.manual_override) <> 'object' THEN 'metadata_invalid'
         WHEN NOT (a.manual_override ? 'timedOut') THEN 'flag_missing'
         WHEN a.manual_override->'timedOut' = 'null'::jsonb THEN 'flag_null'
         WHEN jsonb_typeof(a.manual_override->'timedOut') = 'boolean' THEN 'recorded'
         ELSE 'flag_invalid'
       END AS timeout_metadata_status,
       (SELECT count(*) FROM jsonb_object_keys(
         CASE WHEN jsonb_typeof(s.answers) = 'object' THEN s.answers ELSE '{}'::jsonb END
       )) AS session_answer_entries,
       CASE WHEN a.id IS NOT NULL THEN (SELECT count(*) FROM jsonb_object_keys(
         CASE WHEN jsonb_typeof(a.answers) = 'object' THEN a.answers ELSE '{}'::jsonb END
       )) END AS attempt_answer_entries,
       to_regprocedure('public.submit_online_exam_session(text,text,jsonb,boolean,text)') IS NOT NULL AS has_conditional_submit,
       to_regprocedure('public.submit_online_exam_session(text,text,jsonb)') IS NOT NULL AS unsafe_legacy_submit_signature
FROM public.online_exam_sessions s
LEFT JOIN public.exam_attempts a ON a.id = s.attempt_id
WHERE s.started_at >= clock_timestamp() - interval '14 days'
  AND (
    s.expires_at - s.started_at <= interval '61 seconds'
    OR (s.submitted_at - s.started_at <= interval '30 seconds'
        AND s.submitted_at < s.expires_at - interval '5 seconds')
  )
ORDER BY s.started_at DESC
LIMIT 200;

COMMIT;
