-- 021: الاستبيانات (Surveys)
-- يستهدف المعلم بالاستبيان فصلًا كاملًا أو مجموعات محددة أو الجميع،
-- ويظهر للطالب في حسابه، وللزائر في لوحة الإعلانات إن فُتح للزوار.
--
-- أمان البيانات:
--   • anon لا يقرأ survey_responses إطلاقًا (أسماء وإجابات طلاب آخرين) —
--     القراءة والإرسال عبر دوال SECURITY DEFINER فقط.
--   • anon لا يقرأ مسودات الاستبيانات — المنشور والمفتوح للزوار فقط.
--   • authenticated (لوحة تحكم المعلم) صلاحية كاملة كبقية الجداول.

-- ============================================================
-- الجداول
-- ============================================================

CREATE TABLE IF NOT EXISTS public.surveys (
  id           text PRIMARY KEY,
  title        text NOT NULL,
  description  text DEFAULT '',
  audience     text NOT NULL DEFAULT 'all',
  grade_id     text REFERENCES public.grades(id) ON DELETE SET NULL,
  group_ids    jsonb NOT NULL DEFAULT '[]'::jsonb,
  questions    jsonb NOT NULL DEFAULT '[]'::jsonb,
  published    boolean NOT NULL DEFAULT false,
  allow_guests boolean NOT NULL DEFAULT false,
  anonymous    boolean NOT NULL DEFAULT false,
  deadline     timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surveys_published
  ON public.surveys (published, allow_guests, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_surveys_grade
  ON public.surveys (grade_id);

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id           text PRIMARY KEY,
  survey_id    text NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  student_id   text REFERENCES public.students(id) ON DELETE SET NULL,
  student_name text NOT NULL DEFAULT '',
  phone        text,
  grade_id     text REFERENCES public.grades(id) ON DELETE SET NULL,
  group_id     text REFERENCES public.groups(id) ON DELETE SET NULL,
  answers      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_survey
  ON public.survey_responses (survey_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_survey_responses_student
  ON public.survey_responses (student_id);

ALTER TABLE public.surveys DROP CONSTRAINT IF EXISTS surveys_audience_chk;
ALTER TABLE public.surveys
  ADD CONSTRAINT surveys_audience_chk CHECK (audience IN ('all', 'grade', 'group'));

-- استجابة واحدة لكل هوية (طالب أو رقم زائر) — الاستبيانات المجهولة تُستثنى
DROP INDEX IF EXISTS public.uq_survey_response_student;
CREATE UNIQUE INDEX uq_survey_response_student
  ON public.survey_responses (survey_id, student_id)
  WHERE student_id IS NOT NULL;
DROP INDEX IF EXISTS public.uq_survey_response_phone;
CREATE UNIQUE INDEX uq_survey_response_phone
  ON public.survey_responses (survey_id, phone)
  WHERE student_id IS NULL AND phone IS NOT NULL AND phone <> '';

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access surveys" ON public.surveys;
CREATE POLICY "authenticated full access surveys"
  ON public.surveys FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated full access survey_responses" ON public.survey_responses;
CREATE POLICY "authenticated full access survey_responses"
  ON public.survey_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- الزائر: لا قراءة مباشرة للجداول — كل شيء عبر الدوال الآمنة أدناه
DROP POLICY IF EXISTS "anon read surveys" ON public.surveys;
DROP POLICY IF EXISTS "anon read survey_responses" ON public.survey_responses;

-- ============================================================
-- أدوات مساعدة
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

/** توحيد صيغة رقم الهاتف المصري كما في بقية التطبيق (11 أو 12 رقمًا) */
CREATE OR REPLACE FUNCTION public.survey_norm_phone(p_phone text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN d IS NULL OR length(d) NOT IN (10, 11, 12) THEN NULL
    WHEN length(d) = 12 AND left(d, 2) = '20' THEN d
    WHEN length(d) = 11 AND left(d, 1) = '0' THEN '20' || substr(d, 2)
    WHEN length(d) = 11 AND left(d, 1) = '2' THEN '0' || d
    WHEN length(d) = 10 THEN '20' || d
    ELSE NULL
  END
  FROM (SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') AS d) t
  WHERE coalesce(p_phone, '') <> '';
$$;

/** الاستبيانات الموجّهة لطالب معيّن (منشورة وضمن المهلة) */
CREATE OR REPLACE FUNCTION public.surveys_for_student(p_student_id text)
RETURNS SETOF public.surveys
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s.*
  FROM public.surveys s
  LEFT JOIN public.students st ON st.id = p_student_id
  WHERE s.published = true
    AND (s.deadline IS NULL OR s.deadline > now())
    AND (
      s.audience = 'all'
      OR (s.audience = 'grade' AND s.grade_id IS NOT NULL AND s.grade_id = st.grade_id)
      OR (s.audience = 'group' AND st.group_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.group_ids) gid WHERE gid = st.group_id))
    )
  ORDER BY s.created_at DESC;
$$;

-- ============================================================
-- RPC: استبيانات الطالب المسجّل (بحسابه)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_student_surveys(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_sid text;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'انتهت الجلسة — أعد تسجيل الدخول');
  END IF;

  -- expires_at محفوظ كنص ISO بنمط المشروع (016/017) — تُقارن نصّياً
  SELECT student_id INTO v_sid
  FROM public.student_sessions
  WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex')
    AND expires_at > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  IF v_sid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'انتهت الجلسة — أعد تسجيل الدخول');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'surveys', coalesce((SELECT jsonb_agg(to_jsonb(s))
                         FROM public.surveys_for_student(v_sid) s), '[]'::jsonb),
    'responses', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
                           FROM public.survey_responses r
                           WHERE r.student_id = v_sid), '[]'::jsonb)
  );
END;
$$;

-- ============================================================
-- RPC: استبيانات لوحة الإعلانات العامة (زائر بالاسم والرقم)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_public_surveys(p_phone text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_norm  text := public.survey_norm_phone(p_phone);
  v_sid   text := NULL;
BEGIN
  -- الهوية تُستنتج من رقم الهاتف في جدول الطلاب (لا يوجد عمود phone في
  -- student_accounts — الحساب مرتبط بالطالب عبر student_id)
  IF v_norm IS NOT NULL THEN
    SELECT st.id INTO v_sid FROM public.students st WHERE st.phone = v_norm LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'surveys', coalesce((SELECT jsonb_agg(to_jsonb(s))
                         FROM public.surveys s
                         WHERE s.published = true
                           AND s.allow_guests = true
                           AND s.id IN (SELECT x.id FROM public.surveys_for_student(v_sid) x)
                        ), '[]'::jsonb),
    'answeredSurveyIds', coalesce((SELECT jsonb_agg(r.survey_id)
                                   FROM public.survey_responses r
                                   WHERE v_norm IS NOT NULL AND r.phone = v_norm), '[]'::jsonb)
  );
END;
$$;

-- ============================================================
-- RPC: إرسال رد (طالب مسجّل أو زائر) — يُدرج في السحابة مباشرة
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_survey_response(
  p_token          text,
  p_survey_id      text,
  p_answers        jsonb,
  p_guest_name     text DEFAULT NULL,
  p_guest_phone    text DEFAULT NULL,
  p_guest_grade_id text DEFAULT NULL,
  p_guest_group_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_survey   public.surveys%ROWTYPE;
  v_sid      text := NULL;
  v_name     text := '';
  v_phone    text := NULL;
  v_grade    text := NULL;
  v_group    text := NULL;
  v_anon     boolean := false;
  v_existing text := NULL;
  v_new_id   text;
  v_row      jsonb;
BEGIN
  SELECT * INTO v_survey FROM public.surveys WHERE id = p_survey_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'الاستبيان غير موجود');
  END IF;
  IF v_survey.published IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'الاستبيان غير متاح حاليًا');
  END IF;
  IF v_survey.deadline IS NOT NULL AND v_survey.deadline < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'انتهى موعد الاستبيان');
  END IF;

  IF p_token IS NOT NULL AND p_token <> '' THEN
    -- طالب مسجّل: هويته من سرّ الجلسة فقط (لا يُصدَّق اسم مُدخل يدويًا)
    SELECT ss.student_id INTO v_sid
    FROM public.student_sessions ss
    WHERE ss.token_hash = encode(digest(p_token, 'sha256'), 'hex')
      AND ss.expires_at > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

    IF v_sid IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'انتهت الجلسة — أعد تسجيل الدخول');
    END IF;

    SELECT st.name, st.phone, st.grade_id, st.group_id
      INTO v_name, v_phone, v_grade, v_group
    FROM public.students st
    WHERE st.id = v_sid;

    IF (SELECT st.status FROM public.students st WHERE st.id = v_sid) = 'inactive' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'حسابك موقوف — تواصل مع إدارة المعهد');
    END IF;
  ELSE
    -- زائر من لوحة الإعلانات
    IF v_survey.allow_guests IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'error', 'هذا الاستبيان للطلاب المسجلين فقط');
    END IF;

    -- الاستبيان المجهول لا يطلب اسمًا ولا رقمًا من الزائر أصلًا
    IF v_survey.anonymous IS TRUE THEN
      v_anon := true;
    ELSE
      v_name  := btrim(coalesce(p_guest_name, ''));
      v_phone := public.survey_norm_phone(p_guest_phone);

      IF length(v_name) < 2 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'اكتب اسمك كاملًا كما في كشف الحضور');
      END IF;
      IF v_phone IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'اكتب رقم هاتف صحيح (11 رقمًا)');
      END IF;

      -- ربط تلقائي بحساب طالب إن وُجد بنفس الرقم
      SELECT st.id INTO v_sid FROM public.students st WHERE st.phone = v_phone LIMIT 1;

      IF v_sid IS NOT NULL THEN
        SELECT st.name, st.grade_id, st.group_id
          INTO v_name, v_grade, v_group
        FROM public.students st WHERE st.id = v_sid;
      ELSE
        v_grade := nullif(btrim(coalesce(p_guest_grade_id, '')), '');
        v_group := nullif(btrim(coalesce(p_guest_group_id, '')), '');
      END IF;
    END IF;
  END IF;

  -- هل الاستبيان موجّه لهذا المُجيب فعلاً؟ (الصف/المجموعة/الجميع)
  -- الزائر غير المعروف (v_sid فارغ) يرى استبيانات «الجميع» فقط.
  IF NOT EXISTS (SELECT 1 FROM public.surveys_for_student(v_sid) x WHERE x.id = p_survey_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'هذا الاستبيان غير موجّه إليك');
  END IF;

  -- استبيان مجهول: لا تُخزَّن أي هوية
  IF v_survey.anonymous IS TRUE THEN
    v_anon  := true;
    v_sid   := NULL;
    v_name  := '';
    v_phone := NULL;
    v_grade := NULL;
    v_group := NULL;
  END IF;

  IF NOT v_anon THEN
    SELECT r.id INTO v_existing
    FROM public.survey_responses r
    WHERE r.survey_id = p_survey_id
      AND ((v_sid IS NOT NULL AND r.student_id = v_sid)
           OR (v_sid IS NULL AND v_phone IS NOT NULL AND r.phone = v_phone))
    LIMIT 1;
  END IF;

  IF v_existing IS NOT NULL THEN
    UPDATE public.survey_responses
    SET answers = coalesce(p_answers, '{}'::jsonb)
    WHERE id = v_existing;

    SELECT to_jsonb(r) INTO v_row FROM public.survey_responses r WHERE r.id = v_existing;
    RETURN jsonb_build_object('ok', true, 'responseId', v_existing, 'updated', true, 'response', v_row);
  END IF;

  v_new_id := 'sr-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.survey_responses
    (id, survey_id, student_id, student_name, phone, grade_id, group_id, answers, created_at)
  VALUES
    (v_new_id, p_survey_id, v_sid, coalesce(v_name, ''), v_phone, v_grade, v_group,
     coalesce(p_answers, '{}'::jsonb), now());

  SELECT to_jsonb(r) INTO v_row FROM public.survey_responses r WHERE r.id = v_new_id;
  RETURN jsonb_build_object('ok', true, 'responseId', v_new_id, 'response', v_row);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'سبق إرسال ردك على هذا الاستبيان');
  WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'error', 'تعذر حفظ الرد — أعد المحاولة');
END;
$$;

-- ============================================================
-- صلاحيات
-- ============================================================

REVOKE ALL ON FUNCTION public.survey_norm_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.survey_norm_phone(text) TO anon, authenticated;

-- أداة داخلية: تناديها الدوال المالكة فقط (لا حاجة لصلاحية anon عليها)
REVOKE ALL ON FUNCTION public.surveys_for_student(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.surveys_for_student(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.surveys_for_student(text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_student_surveys(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_surveys(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_public_surveys(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_surveys(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.submit_survey_response(text, text, jsonb, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_survey_response(text, text, jsonb, text, text, text, text)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
