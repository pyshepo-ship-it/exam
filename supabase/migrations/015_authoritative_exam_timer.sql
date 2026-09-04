-- ============================================================
-- Migration 015: جلسات الاختبار ذات المؤقت المعتمد من الخادم
--
-- يضيف طبقة زمنية مستقلة عن ساعة المتصفح:
--   1) الخادم يحدد started_at و expires_at عند الضغط على «بدء الاختبار».
--   2) الإجابات تحفظ في جلسة الخادم أثناء الأداء ولا تقبل تعديلاً بعد الموعد.
--   3) التسليم ينسخ آخر إجابات مقبولة فقط إلى exam_attempts ويحسب الجزء
--      الموضوعي على الخادم. لذلك لا يمنح تغيير ساعة الجهاز وقتاً إضافياً.
--
-- لا يحذف هذا الملف أي بيانات قديمة. المحاولات القديمة تبقى قابلة للعرض.
-- ============================================================

BEGIN;

-- قواعد منشأة من schema.sql القديم قد لا تحمل هذا العمود؛ نضمنه قبل دالة التسليم.
ALTER TABLE public.exam_attempts ADD COLUMN IF NOT EXISTS manual_override JSONB;

CREATE TABLE IF NOT EXISTS public.online_exam_sessions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL UNIQUE,
  session_secret TEXT NOT NULL,
  exam_id TEXT NOT NULL,
  student_id TEXT,
  student_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  grade_id TEXT NOT NULL DEFAULT '',
  group_id TEXT NOT NULL DEFAULT '',
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_online_exam_sessions_identity
  ON public.online_exam_sessions (exam_id, student_id, student_name, group_id);
CREATE INDEX IF NOT EXISTS idx_online_exam_sessions_expiry
  ON public.online_exam_sessions (expires_at)
  WHERE submitted_at IS NULL;

ALTER TABLE public.online_exam_sessions ENABLE ROW LEVEL SECURITY;
-- لا تقرأ الجلسات أو أسرارها مباشرة من أي عميل؛ الوصول حصراً عبر RPC أدناه.
REVOKE ALL ON TABLE public.online_exam_sessions FROM anon, authenticated;
GRANT ALL ON TABLE public.online_exam_sessions TO service_role;

-- ------------------------------------------------------------
-- بدء جلسة: الوقت والهوية والحد الأقصى للمحاولات تتحقق داخل PostgreSQL.
-- ------------------------------------------------------------
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
      SELECT count(*) INTO v_used
        FROM public.online_exam_sessions
       WHERE exam_id = p_exam_id AND student_id = p_student_id;
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

-- ------------------------------------------------------------
-- حفظ التقدم: لا يقبل الخادم تعديلاً بعد expires_at.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_online_exam_progress(
  p_session_id TEXT,
  p_session_secret TEXT,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.online_exam_sessions%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF jsonb_typeof(COALESCE(p_answers, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'صيغة الإجابات غير صالحة';
  END IF;
  IF octet_length(COALESCE(p_answers, '{}'::jsonb)::text) > 262144 THEN
    RAISE EXCEPTION 'حجم الإجابات أكبر من الحد المسموح';
  END IF;

  SELECT * INTO v_session
    FROM public.online_exam_sessions
   WHERE id = p_session_id AND session_secret = p_session_secret
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'جلسة الاختبار غير صالحة';
  END IF;
  IF v_session.submitted_at IS NOT NULL THEN
    RETURN jsonb_build_object('state', 'submitted');
  END IF;
  IF v_now >= v_session.expires_at THEN
    RETURN jsonb_build_object('state', 'expired', 'expiresAt', v_session.expires_at);
  END IF;

  UPDATE public.online_exam_sessions
     SET answers = COALESCE(p_answers, '{}'::jsonb), updated_at = v_now
   WHERE id = v_session.id;
  RETURN jsonb_build_object('state', 'saved', 'expiresAt', v_session.expires_at);
END;
$$;

-- ------------------------------------------------------------
-- تسليم الجلسة: يعتمد على آخر إجابات قُبلت قبل الموعد، ويحسب الجزء الموضوعي
-- داخل الخادم. المقال يبقى pending_review مهما وُجد نموذج إجابة داخلي.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_online_exam_session(
  p_session_id TEXT,
  p_session_secret TEXT,
  p_answers JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.online_exam_sessions%ROWTYPE;
  v_exam RECORD;
  v_meta JSONB;
  v_items JSONB;
  v_answers JSONB;
  v_question JSONB;
  v_sub JSONB;
  v_answer JSONB;
  v_type INTEGER;
  v_marks NUMERIC;
  v_mode TEXT;
  v_correct BOOLEAN;
  v_manual BOOLEAN;
  v_expected TEXT;
  v_auto_score NUMERIC := 0;
  v_auto_total NUMERIC := 0;
  v_manual_total NUMERIC := 0;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_duration_seconds INTEGER;
  v_status TEXT;
  v_meta_attempt JSONB;
  v_existing_attempt public.exam_attempts%ROWTYPE;
BEGIN
  IF p_answers IS NOT NULL AND jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'صيغة الإجابات غير صالحة';
  END IF;
  IF p_answers IS NOT NULL AND octet_length(p_answers::text) > 262144 THEN
    RAISE EXCEPTION 'حجم الإجابات أكبر من الحد المسموح';
  END IF;

  SELECT * INTO v_session
    FROM public.online_exam_sessions
   WHERE id = p_session_id AND session_secret = p_session_secret
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'جلسة الاختبار غير صالحة';
  END IF;
  IF v_session.submitted_at IS NOT NULL THEN
    -- تسليم مكرر بعد فقد اتصال العميل: نعيد نفس المحاولة بدلاً من إنشاء أخرى.
    SELECT * INTO v_existing_attempt
      FROM public.exam_attempts
     WHERE id = v_session.attempt_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'state', 'submitted',
        'timedOut', COALESCE((v_existing_attempt.manual_override->>'timedOut')::boolean, false),
        'attempt', jsonb_build_object(
          'id', v_existing_attempt.id,
          'examId', v_existing_attempt.exam_id,
          'studentId', v_existing_attempt.student_id,
          'studentName', v_existing_attempt.student_name,
          'phone', v_existing_attempt.phone,
          'groupId', v_existing_attempt.group_id,
          'gradeId', v_existing_attempt.grade_id,
          'answers', v_existing_attempt.answers,
          'score', v_existing_attempt.score,
          'totalMarks', v_existing_attempt.total_marks,
          'autoScore', COALESCE((v_existing_attempt.manual_override->>'autoScore')::numeric, v_existing_attempt.score),
          'autoTotal', COALESCE((v_existing_attempt.manual_override->>'autoTotal')::numeric, v_existing_attempt.total_marks),
          'manualScore', COALESCE((v_existing_attempt.manual_override->>'manualScore')::numeric, 0),
          'manualTotal', COALESCE((v_existing_attempt.manual_override->>'manualTotal')::numeric, 0),
          'gradingStatus', COALESCE(v_existing_attempt.manual_override->>'gradingStatus', 'reviewed'),
          'startedAt', v_existing_attempt.started_at,
          'submittedAt', v_existing_attempt.submitted_at,
          'durationSeconds', v_existing_attempt.duration_seconds,
          'timedOut', COALESCE((v_existing_attempt.manual_override->>'timedOut')::boolean, false)
        ),
        'timedOut', COALESCE((v_existing_attempt.manual_override->>'timedOut')::boolean, false)
      );
    END IF;
    RAISE EXCEPTION 'المحاولة المسلَّمة غير موجودة';
  END IF;

  -- التسليم اليدوي قبل الموعد يمكنه حمل آخر لقطة مباشرة؛ بعد الموعد نستخدم
  -- فقط لقطة progress المقبولة سابقاً، فلا يضيف الطالب إجابات بعد انتهاء الوقت.
  v_answers := v_session.answers;
  IF v_now < v_session.expires_at AND p_answers IS NOT NULL THEN
    v_answers := p_answers;
    UPDATE public.online_exam_sessions
       SET answers = v_answers, updated_at = v_now
     WHERE id = v_session.id;
  END IF;

  SELECT id, duration, total_marks, questions
    INTO v_exam
    FROM public.exams
   WHERE id = v_session.exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'لم يعد الاختبار متاحاً للتسليم';
  END IF;
  v_meta := CASE WHEN jsonb_typeof(v_exam.questions) = 'object' THEN v_exam.questions ELSE '{}'::jsonb END;
  v_items := CASE WHEN jsonb_typeof(v_meta->'items') = 'array' THEN v_meta->'items' ELSE '[]'::jsonb END;
  v_mode := CASE
    WHEN v_meta->>'onlineExamMode' IN ('objective', 'essay', 'mixed') THEN v_meta->>'onlineExamMode'
    ELSE ''
  END;

  FOR v_question IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_type := CASE WHEN COALESCE(v_question->>'questionType', '') ~ '^[0-9]+$'
      THEN (v_question->>'questionType')::integer ELSE 0 END;
    FOR v_sub IN SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_question->'subQuestions') = 'array' THEN v_question->'subQuestions' ELSE '[]'::jsonb END
    ) LOOP
      v_marks := CASE
        WHEN COALESCE(v_sub->>'marks', '') ~ '^[0-9]+(\.[0-9]+)?$' AND (v_sub->>'marks')::numeric > 0
          THEN (v_sub->>'marks')::numeric
        ELSE 1
      END;
      v_answer := COALESCE(v_answers -> COALESCE(v_sub->>'id', ''), '{}'::jsonb);
      v_manual := false;
      v_correct := false;

      -- الأنماط الحديثة: المقال يدوي دائماً، والموضوعي يقتصر على 1 و3.
      IF v_mode = 'essay' THEN
        v_manual := true;
      ELSIF v_mode = 'mixed' AND v_type NOT IN (1, 3) THEN
        v_manual := true;
      ELSIF v_mode = 'objective' AND v_type NOT IN (1, 3) THEN
        v_manual := true;
      ELSIF v_mode = '' AND v_type = 4 THEN
        v_manual := true;
      END IF;

      IF NOT v_manual THEN
        IF v_type = 1 THEN
          SELECT EXISTS (
            SELECT 1
              FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(v_sub->'choices') = 'array' THEN v_sub->'choices' ELSE '[]'::jsonb END
              ) AS choice_item(value)
             WHERE COALESCE(choice_item.value->>'isCorrect', 'false') = 'true'
               AND choice_item.value->>'id' = v_answer->>'choiceId'
          ) INTO v_correct;
        ELSIF v_type = 3 THEN
          v_correct := (v_sub->>'isTrue' IN ('true', 'false'))
            AND (v_answer->>'isTrue' = v_sub->>'isTrue');
        ELSIF v_type = 5 THEN
          v_expected := COALESCE(v_sub->'corrections'->0->>'correctAnswer', '');
          v_correct := v_expected <> ''
            AND lower(regexp_replace(trim(COALESCE(v_answer->>'text', '')), '\s+', ' ', 'g'))
              = lower(regexp_replace(trim(v_expected), '\s+', ' ', 'g'));
        ELSE
          v_expected := COALESCE(v_sub->>'correctAnswer', '');
          v_correct := v_expected <> ''
            AND lower(regexp_replace(trim(COALESCE(v_answer->>'text', '')), '\s+', ' ', 'g'))
              = lower(regexp_replace(trim(v_expected), '\s+', ' ', 'g'));
        END IF;
        v_auto_total := v_auto_total + v_marks;
        IF v_correct THEN v_auto_score := v_auto_score + v_marks; END IF;
      ELSE
        v_manual_total := v_manual_total + v_marks;
      END IF;
    END LOOP;
  END LOOP;

  v_status := CASE WHEN v_manual_total > 0 THEN 'pending_review' ELSE 'reviewed' END;
  v_duration_seconds := LEAST(
    EXTRACT(EPOCH FROM (v_session.expires_at - v_session.started_at))::integer,
    GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_session.started_at))::integer)
  );
  v_meta_attempt := jsonb_build_object(
    'autoScore', round(v_auto_score, 2),
    'autoTotal', round(v_auto_total, 2),
    'manualScore', 0,
    'manualTotal', round(v_manual_total, 2),
    'gradingStatus', v_status,
    'timedOut', v_now >= v_session.expires_at
  );

  INSERT INTO public.exam_attempts (
    id, exam_id, student_id, student_name, phone, group_id, grade_id, answers,
    score, total_marks, started_at, submitted_at, duration_seconds, manual_override
  ) VALUES (
    v_session.attempt_id, v_session.exam_id, v_session.student_id, v_session.student_name,
    v_session.phone, v_session.group_id, v_session.grade_id, v_answers,
    round(v_auto_score, 2), round(v_auto_total + v_manual_total, 2),
    v_session.started_at::text, v_now::text, v_duration_seconds, v_meta_attempt
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE public.online_exam_sessions
     SET submitted_at = v_now, updated_at = v_now
   WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'state', 'submitted',
    'timedOut', v_now >= v_session.expires_at,
    'attempt', jsonb_build_object(
      'id', v_session.attempt_id,
      'examId', v_session.exam_id,
      'studentId', v_session.student_id,
      'studentName', v_session.student_name,
      'phone', v_session.phone,
      'groupId', v_session.group_id,
      'gradeId', v_session.grade_id,
      'answers', v_answers,
      'score', round(v_auto_score, 2),
      'totalMarks', round(v_auto_total + v_manual_total, 2),
      'autoScore', round(v_auto_score, 2),
      'autoTotal', round(v_auto_total, 2),
      'manualScore', 0,
      'manualTotal', round(v_manual_total, 2),
      'gradingStatus', v_status,
      'startedAt', v_session.started_at,
      'submittedAt', v_now,
      'durationSeconds', v_duration_seconds,
      'timedOut', v_now >= v_session.expires_at
    )
  );
END;
$$;

-- ------------------------------------------------------------
-- قراءة ورقة الاختبار للطلاب: نعيد النصوص وخيارات الإجابة فقط من دون مفاتيح
-- التصحيح. لا يقرأ anon جدول exams مباشرة، فلا تكون مفاتيح التصحيح في الشبكة.
-- مفاتيح التصحيح لا تخرج من هذه الدالة إطلاقاً؛ دالة التغذية الراجعة المقيّدة
-- بالجلسة أدناه هي وحدها التي تقرر ما يظهر بعد كل سؤال أو عند النهاية.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_online_exams()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'grade_id', e.grade_id,
      'group_id', e.group_id,
      'title', e.title,
      'month', e.month,
      'unit', e.unit,
      'academic_year', e.academic_year,
      'duration', e.duration,
      'total_marks', e.total_marks,
      'created_at', e.created_at,
      'updated_at', e.updated_at,
      'questions', jsonb_set(e.questions, '{items}', COALESCE((
        SELECT jsonb_agg(
          q.value || jsonb_build_object('subQuestions', COALESCE((
            SELECT jsonb_agg(
              (sq.value - 'correctAnswer' - 'isTrue' - 'corrections')
              || CASE
                WHEN q.value->>'questionType' = '1' THEN jsonb_build_object(
                  'choices', COALESCE((
                    SELECT jsonb_agg((choice.value - 'isCorrect') ORDER BY choice.ord)
                    FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(sq.value->'choices') = 'array'
                        THEN sq.value->'choices' ELSE '[]'::jsonb END
                    ) WITH ORDINALITY AS choice(value, ord)
                  ), '[]'::jsonb)
                )
                ELSE '{}'::jsonb
              END ORDER BY sq.ord
            )
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(q.value->'subQuestions') = 'array'
                THEN q.value->'subQuestions' ELSE '[]'::jsonb END
            ) WITH ORDINALITY AS sq(value, ord)
          ), '[]'::jsonb)) ORDER BY q.ord
        )
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(e.questions->'items') = 'array'
            THEN e.questions->'items' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS q(value, ord)
      ), '[]'::jsonb), true)
    )
  ), '[]'::jsonb)
  FROM public.exams e
  WHERE jsonb_typeof(e.questions) = 'object'
    AND COALESCE(e.questions->>'allowOnline', 'false') = 'true'
    AND COALESCE(
      e.questions->>'deliveryMode',
      CASE WHEN e.questions->>'allowOnline' = 'true' THEN 'online' ELSE 'offline' END
    ) = 'online';
$$;

-- ------------------------------------------------------------
-- مفاتيح الإجابة المسموح إظهارها لجلسة بعينها فقط. تُستخدم لإعداد «بعد كل
-- سؤال» و«في نهاية الاختبار»؛ المقال والتصحيح النموذجي لا يرجعان من هنا.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_online_exam_answer_feedback(
  p_session_id TEXT,
  p_session_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.online_exam_sessions%ROWTYPE;
  v_questions JSONB;
  v_items JSONB;
  v_question JSONB;
  v_sub JSONB;
  v_answer JSONB;
  v_meta JSONB;
  v_visibility TEXT;
  v_mode TEXT;
  v_type INTEGER;
  v_manual BOOLEAN;
  v_sub_id TEXT;
  v_choice_id TEXT;
  v_expected TEXT;
  v_feedback JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_session
    FROM public.online_exam_sessions
   WHERE id = p_session_id AND session_secret = p_session_secret;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'جلسة الاختبار غير صالحة';
  END IF;

  SELECT questions INTO v_questions FROM public.exams WHERE id = v_session.exam_id;
  IF v_questions IS NULL OR jsonb_typeof(v_questions) <> 'object' THEN
    RAISE EXCEPTION 'لم يعد الاختبار متاحاً';
  END IF;
  v_meta := v_questions;
  v_visibility := COALESCE(v_meta->>'answerVisibility', 'never');
  IF v_visibility NOT IN ('afterEach', 'atEnd') THEN
    RETURN jsonb_build_object('answers', v_feedback);
  END IF;
  IF v_visibility = 'atEnd' AND v_session.submitted_at IS NULL THEN
    RETURN jsonb_build_object('answers', v_feedback);
  END IF;

  v_mode := CASE WHEN v_meta->>'onlineExamMode' IN ('objective', 'essay', 'mixed')
    THEN v_meta->>'onlineExamMode' ELSE '' END;
  v_items := CASE WHEN jsonb_typeof(v_meta->'items') = 'array' THEN v_meta->'items' ELSE '[]'::jsonb END;
  FOR v_question IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_type := CASE WHEN COALESCE(v_question->>'questionType', '') ~ '^[0-9]+$'
      THEN (v_question->>'questionType')::integer ELSE 0 END;
    FOR v_sub IN SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_question->'subQuestions') = 'array' THEN v_question->'subQuestions' ELSE '[]'::jsonb END
    ) LOOP
      v_sub_id := COALESCE(v_sub->>'id', '');
      IF v_sub_id = '' THEN CONTINUE; END IF;
      IF v_visibility = 'afterEach' AND NOT (v_session.answers ? v_sub_id) THEN CONTINUE; END IF;
      v_manual := v_mode = 'essay'
        OR (v_mode = 'mixed' AND v_type NOT IN (1, 3))
        OR (v_mode = 'objective' AND v_type NOT IN (1, 3))
        OR (v_mode = '' AND v_type = 4);
      IF v_manual THEN CONTINUE; END IF;

      IF v_type = 1 THEN
        SELECT choice.value->>'id' INTO v_choice_id
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(v_sub->'choices') = 'array' THEN v_sub->'choices' ELSE '[]'::jsonb END
          ) AS choice(value)
         WHERE COALESCE(choice.value->>'isCorrect', 'false') = 'true'
         LIMIT 1;
        IF v_choice_id IS NOT NULL AND v_choice_id <> '' THEN
          v_feedback := v_feedback || jsonb_build_object(v_sub_id, jsonb_build_object('choiceId', v_choice_id));
        END IF;
      ELSIF v_type = 3 AND v_sub->>'isTrue' IN ('true', 'false') THEN
        v_feedback := v_feedback || jsonb_build_object(v_sub_id, jsonb_build_object('isTrue', (v_sub->>'isTrue')::boolean));
      ELSIF v_type = 5 THEN
        v_expected := COALESCE(v_sub->'corrections'->0->>'correctAnswer', '');
        IF v_expected <> '' THEN
          v_feedback := v_feedback || jsonb_build_object(v_sub_id, jsonb_build_object('text', v_expected));
        END IF;
      ELSIF v_type IN (2, 6, 7, 8) THEN
        v_expected := COALESCE(v_sub->>'correctAnswer', '');
        IF v_expected <> '' THEN
          v_feedback := v_feedback || jsonb_build_object(v_sub_id, jsonb_build_object('text', v_expected));
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('answers', v_feedback);
END;
$$;

-- ------------------------------------------------------------
-- استعادة نتيجة جلسة واحدة: السر العشوائي للجلسة هو القدرة الوحيدة المطلوبة.
-- لا يكشف هذا المسار أي مراجعة أو درجة مقالية أو تعليق قبل إطلاق النتيجة.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_online_exam_result(
  p_session_id TEXT,
  p_session_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.online_exam_sessions%ROWTYPE;
  v_attempt public.exam_attempts%ROWTYPE;
  v_meta JSONB;
  v_safe_meta JSONB := '{}'::jsonb;
  v_safe_answers JSONB := '{}'::jsonb;
  v_answer_key TEXT;
  v_answer_value JSONB;
  v_released BOOLEAN := false;
  v_feedback JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_session
    FROM public.online_exam_sessions
   WHERE id = p_session_id AND session_secret = p_session_secret;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'جلسة الاختبار غير صالحة';
  END IF;
  IF v_session.submitted_at IS NULL THEN
    RETURN jsonb_build_object('state', 'in_progress');
  END IF;

  SELECT * INTO v_attempt
    FROM public.exam_attempts
   WHERE id = v_session.attempt_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'in_progress');
  END IF;

  v_meta := CASE WHEN jsonb_typeof(v_attempt.manual_override) = 'object'
    THEN v_attempt.manual_override ELSE '{}'::jsonb END;
  v_released := NULLIF(COALESCE(v_meta->>'resultReleasedAt', ''), '') IS NOT NULL;

  -- إجابة الطالب نفسها مسموحة، لكن review لا يخرج قبل الإطلاق الصريح.
  FOR v_answer_key, v_answer_value IN
    SELECT key, value FROM jsonb_each(
      CASE WHEN jsonb_typeof(v_attempt.answers) = 'object' THEN v_attempt.answers ELSE '{}'::jsonb END
    )
  LOOP
    v_safe_answers := v_safe_answers || jsonb_build_object(
      v_answer_key,
      CASE WHEN v_released THEN v_answer_value ELSE v_answer_value - 'review' END
    );
  END LOOP;

  v_safe_meta := jsonb_strip_nulls(jsonb_build_object(
    'autoScore', v_meta->'autoScore',
    'autoTotal', v_meta->'autoTotal',
    -- لا يكشف التصحيح اليدوي قبل الإطلاق، حتى في بيانات الشبكة.
    'manualScore', CASE WHEN v_released THEN v_meta->'manualScore' ELSE to_jsonb(0) END,
    'manualTotal', v_meta->'manualTotal',
    'gradingStatus', v_meta->'gradingStatus',
    'resultReleasedAt', CASE WHEN v_released THEN v_meta->'resultReleasedAt' ELSE NULL END,
    'reviewedAt', v_meta->'reviewedAt',
    'timedOut', v_meta->'timedOut'
  ));
  IF v_released AND jsonb_typeof(v_meta->'score') = 'number' THEN
    v_safe_meta := v_safe_meta || jsonb_strip_nulls(jsonb_build_object(
      'score', v_meta->'score',
      'reason', v_meta->'reason',
      'at', v_meta->'at'
    ));
  END IF;

  -- نفس قواعد afterEach / atEnd؛ المقال لا يملك مفتاحاً في هذه الدالة.
  v_feedback := COALESCE(
    public.get_online_exam_answer_feedback(p_session_id, p_session_secret)->'answers',
    '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'state', 'submitted',
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'exam_id', v_attempt.exam_id,
      'student_id', v_attempt.student_id,
      'student_name', v_attempt.student_name,
      'group_id', v_attempt.group_id,
      'grade_id', v_attempt.grade_id,
      'answers', v_safe_answers,
      'score', v_attempt.score,
      'total_marks', v_attempt.total_marks,
      'started_at', v_attempt.started_at,
      'submitted_at', v_attempt.submitted_at,
      'duration_seconds', v_attempt.duration_seconds,
      'manual_override', v_safe_meta
    ),
    'feedback', v_feedback
  );
END;
$$;

-- لا يستطيع anon قراءة أو إدراج محاولة مباشرة وتجاوز ساعة الخادم. المعلم
-- المصادق فقط يحتفظ بصلاحية الإدارة/الترحيل عبر سياسة authenticated الموجودة مسبقاً.
DROP POLICY IF EXISTS "anon insert exam_attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "public insert" ON public.exam_attempts;
DROP POLICY IF EXISTS "public read" ON public.exam_attempts;
DROP POLICY IF EXISTS "anon read exam_attempts" ON public.exam_attempts;
-- لا توجد قراءة أو كتابة REST مباشرة للمحاولات؛ النتيجة تعود فقط بسر الجلسة.
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.exam_attempts FROM anon;
-- قد يكون عرض العدّاد موجوداً في قواعد قديمة فقط؛ لم يعد مساراً عاماً بعد أن
-- صار start_online_exam_session يفرض الحد داخل المعاملة.
DO $$
BEGIN
  IF to_regclass('public.exam_attempt_counts') IS NOT NULL THEN
    REVOKE SELECT ON TABLE public.exam_attempt_counts FROM anon;
  END IF;
END $$;

-- لا نسمح بقراءة questions الخام من REST؛ get_public_online_exams هو المسار
-- الوحيد للزائر ويزيل مفاتيح التصحيح قبل خروجها من PostgreSQL.
DROP POLICY IF EXISTS "public read exams" ON public.exams;
DROP POLICY IF EXISTS "anon read exams" ON public.exams;
REVOKE SELECT ON TABLE public.exams FROM anon;

REVOKE ALL ON FUNCTION public.start_online_exam_session(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_online_exam_progress(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_online_exam_session(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_online_exams() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_online_exam_answer_feedback(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_online_exam_result(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_online_exam_session(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_online_exam_progress(TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_online_exam_session(TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_online_exams() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_online_exam_answer_feedback(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_online_exam_result(TEXT, TEXT) TO anon, authenticated;

COMMIT;
