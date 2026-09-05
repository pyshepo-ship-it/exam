-- ============================================================
-- 024_exam_attempts_and_review_gate.sql
-- إصلاحان في بوابة الاختبار الإلكتروني، والخادم هو الحكم فيهما:
--   1) «تم الامتحان — فتح المراجعة للجميع» صار يعني إغلاق الاختبار فعلياً:
--      يبقى ظاهراً للطالب للمراجعة فقط، ولا تُقبل بعده أي محاولة جديدة.
--   2) حد المحاولات (maxAttempts) يحتسب للطالب المسجَّل محاولاته كزائر أيضاً
--      بالاسم والمجموعة نفسها، فلا يلتف عليه أحد بتسجيل الخروج.
-- ملاحظة: قيمة maxAttempts تعيش داخل exams.questions (غلاف الإعدادات)؛
-- وكانت شاشة المحرر تمسحها عند الحفظ فيصبح الاختبار بلا حد — أُصلح ذلك في
-- الواجهة (buildExamFromForm) مع هذا الترحيل.
--
-- CREATE OR REPLACE تُبقي SECURITY DEFINER فقط إن ذُكرت صراحةً هنا، ولذلك
-- نعيد كتابة الدالة كاملة كما في 015 مع الإضافتين أعلاه، ثم نعيد الصلاحيات.
-- آمنة للتشغيل أكثر من مرة.
-- ============================================================

CREATE OR REPLACE FUNCTION public.start_online_exam_session(
  p_session_id TEXT,
  p_attempt_id TEXT,
  p_exam_id TEXT,
  p_student_id TEXT DEFAULT NULL,
  p_student_name TEXT DEFAULT '',
  p_phone TEXT DEFAULT NULL,
  p_grade_id TEXT DEFAULT '',
  p_group_id TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exam RECORD;
  v_meta JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_from TIMESTAMPTZ;
  v_until TIMESTAMPTZ;
  v_minutes INTEGER;
  v_limit INTEGER := 0;
  v_used INTEGER := 0;
  v_secret TEXT;
BEGIN
  IF COALESCE(length(trim(p_session_id)), 0) < 12
     OR COALESCE(length(trim(p_attempt_id)), 0) < 12
     OR COALESCE(length(trim(p_exam_id)), 0) < 1 THEN
    RAISE EXCEPTION 'معرف جلسة الاختبار غير صالح';
  END IF;
  IF COALESCE(length(trim(p_student_name)), 0) < 2 THEN
    RAISE EXCEPTION 'اسم الطالب مطلوب لبدء الاختبار';
  END IF;

  SELECT id, duration, questions, grade_id, group_id
    INTO v_exam
    FROM public.exams
   WHERE id = p_exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الاختبار غير موجود أو حُذف';
  END IF;

  v_meta := CASE
    WHEN jsonb_typeof(v_exam.questions) = 'object' THEN v_exam.questions
    ELSE '{}'::jsonb
  END;

  -- اختبار إلكتروني منشور فقط. نحافظ على توافق السجل القديم الذي لا يحمل deliveryMode.
  IF COALESCE(
       v_meta->>'deliveryMode',
       CASE WHEN v_meta->>'allowOnline' = 'true' THEN 'online' ELSE 'offline' END
     ) <> 'online'
     OR COALESCE(v_meta->>'allowOnline', 'false') <> 'true' THEN
    RAISE EXCEPTION 'هذا الاختبار غير منشور إلكترونياً';
  END IF;
  -- «تم الامتحان — فتح المراجعة للجميع» ينهي الاختبار: لا محاولات جديدة بعده.
  IF COALESCE(v_meta->>'reviewOpen', 'false') = 'true' THEN
    RAISE EXCEPTION 'انتهى هذا الاختبار — المراجعة متاحة الآن فقط';
  END IF;
  IF COALESCE(v_meta->>'accessMode', 'members') <> 'public'
     AND NULLIF(trim(p_student_id), '') IS NULL THEN
    RAISE EXCEPTION 'هذا الاختبار مخصص للطلاب المسجلين';
  END IF;
  IF v_exam.grade_id IS NOT NULL AND v_exam.grade_id <> ''
     AND COALESCE(p_grade_id, '') <> v_exam.grade_id THEN
    RAISE EXCEPTION 'الصف لا يطابق صف الاختبار';
  END IF;
  IF v_exam.group_id IS NOT NULL AND v_exam.group_id <> ''
     AND COALESCE(p_group_id, '') <> v_exam.group_id THEN
    RAISE EXCEPTION 'المجموعة لا تطابق مجموعة الاختبار';
  END IF;
  IF jsonb_typeof(v_meta->'targetGroupIds') = 'array'
     AND jsonb_array_length(v_meta->'targetGroupIds') > 0
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(v_meta->'targetGroupIds') AS target_group(id)
        WHERE target_group.id = COALESCE(p_group_id, '')
     ) THEN
    RAISE EXCEPTION 'المجموعة غير مستهدفة بهذا الاختبار';
  END IF;

  IF COALESCE(v_meta->>'availabilityMode', 'always') = 'scheduled' THEN
    IF NULLIF(v_meta->>'availableFrom', '') IS NULL OR NULLIF(v_meta->>'availableUntil', '') IS NULL THEN
      RAISE EXCEPTION 'نافذة إتاحة الاختبار غير مكتملة';
    END IF;
    BEGIN
      v_from := (v_meta->>'availableFrom')::timestamptz;
      v_until := (v_meta->>'availableUntil')::timestamptz;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'نافذة إتاحة الاختبار غير صالحة';
    END;
    IF v_now < v_from OR v_now > v_until THEN
      RAISE EXCEPTION 'الاختبار غير متاح في هذا الوقت';
    END IF;
  END IF;

  IF COALESCE(v_meta->>'maxAttempts', '') ~ '^[0-9]+$' THEN
    v_limit := (v_meta->>'maxAttempts')::integer;
  END IF;
  -- يمنع الضغط/الطلبات المتوازية من تجاوز حد المحاولات بين count و insert.
  PERFORM pg_advisory_xact_lock(hashtext(
    p_exam_id || ':' || COALESCE(NULLIF(trim(p_student_id), ''), lower(trim(p_student_name)) || ':' || COALESCE(p_group_id, ''))
  ));
  IF v_limit > 0 THEN
    IF p_student_id IS NOT NULL AND trim(p_student_id) <> '' THEN
      -- محاولات حسابه + محاولاته كزائر بالاسم والمجموعة نفسها (لا يلتف أحد على
      -- الحد بتسجيل الخروج أو بفتح الرابط العام من متصفح آخر).
      SELECT count(*) INTO v_used
        FROM public.online_exam_sessions
       WHERE exam_id = p_exam_id
         AND (
           student_id = p_student_id
           OR (
             student_id IS NULL
             AND lower(trim(student_name)) = lower(trim(p_student_name))
             AND group_id = COALESCE(p_group_id, '')
           )
         );
    ELSE
      SELECT count(*) INTO v_used
        FROM public.online_exam_sessions
       WHERE exam_id = p_exam_id
         AND student_id IS NULL
         AND lower(trim(student_name)) = lower(trim(p_student_name))
         AND group_id = COALESCE(p_group_id, '');
    END IF;
    IF v_used >= v_limit THEN
      RAISE EXCEPTION 'استُنفد الحد الأقصى للمحاولات لهذا الاختبار';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.online_exam_sessions WHERE id = p_session_id OR attempt_id = p_attempt_id) THEN
    RAISE EXCEPTION 'هذه الجلسة مستخدمة بالفعل';
  END IF;

  -- سر عشوائي غير قابل للتخمين عملياً؛ لا يظهر أبداً في جدول قابل للقراءة العامة.
  v_secret := md5(random()::text || clock_timestamp()::text || p_session_id)
    || md5(random()::text || clock_timestamp()::text || p_attempt_id);
  v_minutes := GREATEST(1, LEAST(COALESCE(v_exam.duration, 60)::integer, 1440));

  INSERT INTO public.online_exam_sessions (
    id, attempt_id, session_secret, exam_id, student_id, student_name,
    phone, grade_id, group_id, started_at, expires_at, updated_at
  ) VALUES (
    p_session_id, p_attempt_id, v_secret, p_exam_id, NULLIF(trim(p_student_id), ''), trim(p_student_name),
    NULLIF(trim(p_phone), ''), COALESCE(p_grade_id, ''), COALESCE(p_group_id, ''),
    v_now, v_now + make_interval(secs => v_minutes * 60), v_now
  );

  RETURN jsonb_build_object(
    'id', p_session_id,
    'secret', v_secret,
    'attemptId', p_attempt_id,
    'startedAt', v_now,
    'expiresAt', v_now + make_interval(secs => v_minutes * 60)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_online_exam_session(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_online_exam_session(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
