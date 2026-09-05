-- ============================================================
-- 022) ردّ واحد لكل مُجيب في كل نسخة — حتى في الاستبيانات المجهولة
-- ============================================================
-- المشكلة التي يُصلحها هذا الملف:
--   1) الاستبيان «المجهول الاسم» كان يحذف هوية المُجيب تمامًا (لا رقم طالب ولا
--      هاتف)، فلم تعد هناك أي وسيلة لمنع نفس الشخص من إرسال الرد مرات لا
--      نهائية — وهو إفساد لنتائج الاستبيان.
--   2) الزائر كان يفلت من «منع التكرار» بمجرد تغيير رقم هاتفه.
--   3) لا مفهوم «نسخة»: تعديل الأسئلة كان يبقي المجيبين عند «تمت الإجابة» رغم
--      أن الأسئلة صارت مختلفة، فلا تصلح إجاباتهم عليها.
--
-- الحل:
--   • لكل استبيان ملح عشوائي (surveys.response_salt) ولكل مُجيب بصمة
--     identity_hash = sha256(الملح | الهوية). البصمة تمنع التكرار دون أن تكشف
--     صاحبها: في الاستبيان المجهول لا يُخزَّن اسم ولا رقم ولا even معرف الطالب —
--     البصمة وحدها. وبلا الملح لا يستطيع أحد توليد بصمات لمطابقتها (الملح لا
--     يُرسل لأي عميل).
--   • رقم الهاتف إلزامي لكل زائر (حتى في المجهول): يُستخدم لحساب البصمة فقط.
--     بصمة الطالب المسجّل تُحسب من سرّ جلسته، فلا حاجة لرقمه.
--   • خيار للمعلم «قفل الإجابة بعد الإرسال» (lock_after_submit): يمنع حتى تصحيح
--     الإجابة. وفي الحالتين لا يُنشأ صف ثانٍ أبدًا — لا تتضخم النتائج.
--   • قيد فريد على (survey_id, version, identity_hash): ردّ واحد لنفس الشخص في
--     النسخة الواحدة. ومنشأ الرد مرة أخرى على استبيان آخر مسموح دائمًا، وكذلك
--     على نفس الاستبيان بعد أن يُعدّله المعلم (ترتفع النسخة فتُفتح الإجابة).
--   • رفع النسخة يتم في قاعدة البيانات بمُشغِّل (trigger) عند تغيّر مصفوفة
--     الأسئلة، ولا يُقبل تنزيل رقم النسخة من أي عميل بذاكرة قديمة.
--
-- التشغيل: Supabase ← SQL Editor ← الصق الملف كاملاً ← Run (آمن للتكرار)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1) الدالة الداخلية للحساب (تُنشأ أولًا لأنها تُستخدم في الترحيل أدناه)
--    لا صلاحيات لأحد عليها: تناديها دوال الاستبيان المالكة فقط.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.survey_response_hash(p_salt TEXT, p_identity TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_identity IS NULL OR p_identity = '' THEN NULL
    ELSE encode(digest(coalesce(p_salt, '') || '|' || p_identity, 'sha256'), 'hex')
  END
$$;

REVOKE ALL ON FUNCTION public.survey_response_hash(TEXT, TEXT) FROM PUBLIC;

-- ------------------------------------------------------------
-- 1-ب) مفتاح الهاتف: آخر ١١ رقمًا بعد توحيد الأرقام العربية-الهندية
--      لأن أرقام الطلاب في جدول students تُخزَّن كما كتبها المعلم
--      (010…, 2010…, ‎+20 101 …) — والمقارنة الحرفية كانت تفشل، فلا يُربط
--      ردّ الزائر بحساب صاحبه ولا يعمل منع التكرار عبر الأجهزة.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.survey_phone_key(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN length(d) >= 10 THEN right(d, 11) ELSE NULL END
  FROM (
    SELECT regexp_replace(
             translate(coalesce(p_phone, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
             '\D', '', 'g') AS d
  ) t
  WHERE coalesce(p_phone, '') <> ''
$$;

REVOKE ALL ON FUNCTION public.survey_phone_key(TEXT) FROM PUBLIC;

-- ------------------------------------------------------------
-- 2) الأعمدة الجديدة
-- ------------------------------------------------------------
ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS response_salt TEXT NOT NULL DEFAULT '';

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS lock_after_submit BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS identity_hash TEXT;

-- ملح لكل استبيان قديم (بلا ملح لا تُحسب بصمات)
UPDATE public.surveys
  SET response_salt = encode(gen_random_bytes(16), 'hex')
  WHERE response_salt IS NULL OR response_salt = '';

-- بصمات الردود القديمة حتى تدخل الفهرس الفريد ولا تُحسب شاذة
UPDATE public.survey_responses r
  SET identity_hash = public.survey_response_hash(
        s.response_salt,
        CASE WHEN r.student_id IS NOT NULL THEN 'sid:' || r.student_id
             ELSE 'ph:' || public.survey_phone_key(r.phone) END
      ),
      phone = COALESCE(public.survey_phone_key(r.phone), r.phone)
  FROM public.surveys s
  WHERE s.id = r.survey_id
    AND r.identity_hash IS NULL
    AND (r.student_id IS NOT NULL OR COALESCE(r.phone, '') <> '');

-- ------------------------------------------------------------
-- 3) الفهارس: ردّ واحد لكل بصمة في كل نسخة
--    تُلغى فهارس 021 (كانت تسمح بالتكرار في الاستبيان المجهول)
-- ------------------------------------------------------------
DROP INDEX IF EXISTS public.uq_survey_response_student;
DROP INDEX IF EXISTS public.uq_survey_response_phone;

CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_response_identity
  ON public.survey_responses (survey_id, version, identity_hash)
  WHERE identity_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_survey_responses_identity
  ON public.survey_responses (identity_hash);

-- ------------------------------------------------------------
-- 4) مُشغِّل النسخة: أسئلة جديدة = نسخة جديدة، ولا تنزيل للرقم
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.survey_touch_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.response_salt IS NULL OR NEW.response_salt = '' THEN
      NEW.response_salt := encode(gen_random_bytes(16), 'hex');
    END IF;
    IF NEW.version IS NULL OR NEW.version < 1 THEN
      NEW.version := 1;
    END IF;
    RETURN NEW;
  END IF;

  -- لا رجوع عن نسخة أعلى (عميل بذاكرة قديمة لا يكسر سجل الإجابات)
  NEW.version := GREATEST(coalesce(NEW.version, 1), coalesce(OLD.version, 1));

  IF NEW.questions IS DISTINCT FROM OLD.questions THEN
    -- تغيّرت الأسئلة = استبيان جديد عمليًا ⇒ يُفتح للجميع من جديد
    IF NEW.version <= OLD.version THEN
      NEW.version := OLD.version + 1;
    END IF;
    NEW.updated_at := now();
  END IF;

  -- الملح سرّ داخلي: لا يُسمح لأي عميل بتغييره (وإلا أُعيد ضبط البصمات)
  NEW.response_salt := OLD.response_salt;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_surveys_version ON public.surveys;
CREATE TRIGGER trg_surveys_version
  BEFORE INSERT OR UPDATE ON public.surveys
  FOR EACH ROW EXECUTE FUNCTION public.survey_touch_version();

-- ------------------------------------------------------------
-- 5) get_student_surveys — يضيف answeredKeys (يشمل الردود المجهولة)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_surveys(p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sid      TEXT;
  v_identity TEXT;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'انتهت الجلسة — أعد تسجيل الدخول');
  END IF;

  -- expires_at نص ISO بنمط المشروع (016/017)
  SELECT student_id INTO v_sid
  FROM public.student_sessions
  WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex')
    AND expires_at > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  IF v_sid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'انتهت الجلسة — أعد تسجيل الدخول');
  END IF;

  v_identity := 'sid:' || v_sid;

  RETURN jsonb_build_object(
    'ok', true,
    -- response_salt لا يُرسل للعميل إطلاقًا (منع توليد البصمات خارج الخادم)
    'surveys', coalesce((SELECT jsonb_agg(to_jsonb(s) - 'response_salt')
                         FROM public.surveys_for_student(v_sid) s), '[]'::jsonb),
    -- ردوده المعلومة الهوية (ليقرأ إجابته ويعدّلها ما دام الاستبيان مفتوحًا)
    'responses', coalesce((SELECT jsonb_agg(to_jsonb(r) - 'identity_hash' ORDER BY r.created_at DESC)
                           FROM public.survey_responses r
                           WHERE r.student_id = v_sid), '[]'::jsonb),
    -- مفاتيح «أجبت» لكل استبيان موجّه له — ويشمل المجهول (بالبصمة وحدها)
    'answeredKeys', coalesce((
      SELECT jsonb_agg(DISTINCT k) FROM (
        SELECT r.survey_id || ':' || r.version AS k
        FROM public.survey_responses r
        WHERE r.student_id = v_sid
        UNION
        SELECT s.id || ':' || s.version
        FROM public.surveys_for_student(v_sid) s
        WHERE public.survey_response_hash(s.response_salt, v_identity) IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.survey_responses x
            WHERE x.survey_id = s.id
              AND x.version = s.version
              AND x.identity_hash = public.survey_response_hash(s.response_salt, v_identity)
          )
      ) t), '[]'::jsonb)
  );
END;
$$;

-- ------------------------------------------------------------
-- 6) get_public_surveys — الزائر يُعرف ببصمته فقط، و«أجبت» بالنسخة
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_surveys(p_phone TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT := public.survey_phone_key(p_phone);
  v_sid TEXT := NULL;
BEGIN
  -- الهوية تُستنتج من رقم الهاتف في جدول الطلاب (student_accounts لا يحمل phone).
  -- المفتاح = آخر ١١ رقمًا، فيلتقط الطالب سواء سجّله المعلم بـ 010… أو 2010…
  IF v_key IS NOT NULL THEN
    SELECT st.id INTO v_sid
    FROM public.students st
    WHERE public.survey_phone_key(st.phone) = v_key
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'surveys', coalesce((SELECT jsonb_agg(to_jsonb(s) - 'response_salt')
                         FROM public.surveys s
                         WHERE s.published = true
                           AND s.allow_guests = true
                           AND s.id IN (SELECT x.id FROM public.surveys_for_student(v_sid) x)
                        ), '[]'::jsonb),
    'answeredKeys', coalesce((
      SELECT jsonb_agg(DISTINCT k) FROM (
        -- ردوده المعلومة (طالب مربوط أو رقم مسجل في الردود القديمة)
        SELECT r.survey_id || ':' || r.version AS k
        FROM public.survey_responses r
        WHERE (v_sid IS NOT NULL AND r.student_id = v_sid)
           OR (v_key IS NOT NULL AND public.survey_phone_key(r.phone) = v_key)
        UNION
        -- ردوده المجهولة: تُكتشف بالبصمة المحسوبة من مفتاح رقمه
        SELECT s.id || ':' || s.version
        FROM public.surveys s
        WHERE v_key IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.survey_responses x
            WHERE x.survey_id = s.id
              AND x.version = s.version
              AND x.identity_hash = public.survey_response_hash(
                    s.response_salt,
                    CASE WHEN v_sid IS NOT NULL THEN 'sid:' || v_sid ELSE 'ph:' || v_key END
                  )
          )
      ) t), '[]'::jsonb)
  );
END;
$$;

-- ------------------------------------------------------------
-- 7) submit_survey_response — ردّ واحد لكل بصمة في كل نسخة
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_survey_response(
  p_token          TEXT,
  p_survey_id      TEXT,
  p_answers        JSONB,
  p_guest_name     TEXT DEFAULT NULL,
  p_guest_phone    TEXT DEFAULT NULL,
  p_guest_grade_id TEXT DEFAULT NULL,
  p_guest_group_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_survey   public.surveys%ROWTYPE;
  v_sid      TEXT := NULL;
  v_name     TEXT := '';
  v_phone    TEXT := NULL;
  v_grade    TEXT := NULL;
  v_group    TEXT := NULL;
  v_identity TEXT := NULL;
  v_hash     TEXT := NULL;
  v_existing TEXT := NULL;
  v_new_id   TEXT;
  v_row      JSONB;
  v_recent   INTEGER := 0;
  v_status   TEXT := '';
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

  -- ------------------------------------------------------------
  -- هوية المُجيب → بصمة. مطلوبة في كل الحالات بلا استثناء.
  -- ------------------------------------------------------------
  IF p_token IS NOT NULL AND p_token <> '' THEN
    -- طالب مسجّل: هويته من سرّ الجلسة فقط (لا يُصدَّق اسم مُدخل يدويًا)
    SELECT ss.student_id INTO v_sid
    FROM public.student_sessions ss
    WHERE ss.token_hash = encode(digest(p_token, 'sha256'), 'hex')
      AND ss.expires_at > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

    IF v_sid IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'انتهت الجلسة — أعد تسجيل الدخول');
    END IF;

    SELECT st.name, st.phone, st.grade_id, st.group_id, st.status
      INTO v_name, v_phone, v_grade, v_group, v_status
    FROM public.students st
    WHERE st.id = v_sid;

    IF v_status = 'inactive' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'حسابك موقوف — تواصل مع المعلم');
    END IF;

    v_identity := 'sid:' || v_sid;
  ELSE
    -- زائر من لوحة الإعلانات
    IF v_survey.allow_guests IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'error', 'هذا الاستبيان للطلاب المسجلين فقط');
    END IF;

    v_name  := btrim(coalesce(p_guest_name, ''));
    -- مفتاح موحد (آخر ١١ رقمًا بعد تحويل الأرقام العربية-الهندية) — تُبنى عليه
    -- البصمة، فيبقى منع التكرار يعمل مهما كُتب الرقم بصيغة مختلفة
    v_phone := public.survey_phone_key(p_guest_phone);

    -- الرقم إلزامي دائمًا (حتى في المجهول): هو ما يمنع الرد المكرر.
    IF v_phone IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'اكتب رقم هاتف صحيح (11 رقمًا) — يُستخدم لمنع تكرار إجابتك فقط');
    END IF;
    -- في غير المجهول يُطلب الاسم أيضًا ليظهر للمعلم
    IF v_survey.anonymous IS NOT TRUE AND length(v_name) < 2 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'اكتب اسمك كاملًا كما في كشف الحضور');
    END IF;

    -- رقم مسجّل كطالب؟ تُربط الإجابة بالطالب (ونفس بصمته في حسابه)
    SELECT st.id INTO v_sid
    FROM public.students st
    WHERE public.survey_phone_key(st.phone) = v_phone
    LIMIT 1;
    IF v_sid IS NOT NULL THEN
      SELECT st.name, st.grade_id, st.group_id
        INTO v_name, v_grade, v_group
      FROM public.students st WHERE st.id = v_sid;
      v_identity := 'sid:' || v_sid;
    ELSE
      v_grade := nullif(btrim(coalesce(p_guest_grade_id, '')), '');
      v_group := nullif(btrim(coalesce(p_guest_group_id, '')), '');
      v_identity := 'ph:' || v_phone;
    END IF;
  END IF;

  v_hash := public.survey_response_hash(v_survey.response_salt, v_identity);
  IF v_hash IS NULL THEN
    -- بلا بصمة لا يمكن ضمان عدم التكرار ⇒ نرفض بدل إفساد النتائج
    RETURN jsonb_build_object('ok', false, 'error',
      'تعذر التحقق من هويتك — أعد المحاولة أو أدخل رقم هاتفك');
  END IF;

  -- هل أجاب على هذه النسخة تحديدًا؟ (تكرار = تحديث ردّه، لا صف جديد)
  SELECT r.id INTO v_existing
  FROM public.survey_responses r
  WHERE r.survey_id = p_survey_id
    AND r.version = v_survey.version
    AND r.identity_hash = v_hash
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- سبق لهذا الشخص أن أجاب على هذه النسخة: لا صف ثاني أبدًا.
    -- افتراضيًا يُسمح له بتصحيح إجابته فقط، والمعلم يستطيع قفل التعديل.
    IF v_survey.lock_after_submit IS TRUE THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'locked', 'responseId', v_existing,
        'error', 'أُرسلت إجابتك ولا يمكن تعديلها — إن احتجت تعديلًا تواصل مع المعلم'
      );
    END IF;

    UPDATE public.survey_responses
      SET answers = coalesce(p_answers, '{}'::jsonb)
      WHERE id = v_existing;

    SELECT to_jsonb(r) INTO v_row FROM public.survey_responses r WHERE r.id = v_existing;
    RETURN jsonb_build_object(
      'ok', true, 'responseId', v_existing, 'updated', true, 'code', 'updated',
      'version', v_survey.version, 'response', v_row - 'identity_hash'
    );
  END IF;

  -- حماية إغراق للزوار (ردود كثيرة متتابعة من نفس البصمة)
  IF v_sid IS NULL THEN
    SELECT count(*) INTO v_recent
    FROM public.survey_responses r
    WHERE r.identity_hash = v_hash
      AND r.created_at > now() - interval '1 hour';
    IF v_recent >= 12 THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'عدد المحاولات كبير الآن — انتظر قليلًا ثم أعد المحاولة');
    END IF;
  END IF;

  -- الاستبيان المجهول: لا هوية مخزَّنة إطلاقًا — البصمة وحدها تمنع التكرار
  IF v_survey.anonymous IS TRUE THEN
    v_sid   := NULL;
    v_name  := '';
    v_phone := NULL;
    v_grade := NULL;
    v_group := NULL;
  END IF;

  v_new_id := 'sr-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.survey_responses
    (id, survey_id, version, student_id, student_name, phone, grade_id, group_id,
     answers, identity_hash, created_at)
  VALUES
    (v_new_id, p_survey_id, v_survey.version, v_sid, coalesce(v_name, ''), v_phone,
     v_grade, v_group, coalesce(p_answers, '{}'::jsonb), v_hash, now());

  SELECT to_jsonb(r) INTO v_row FROM public.survey_responses r WHERE r.id = v_new_id;
  RETURN jsonb_build_object(
    'ok', true, 'responseId', v_new_id, 'version', v_survey.version,
    'response', v_row - 'identity_hash'
  );
EXCEPTION
  WHEN unique_violation THEN
    -- سباق بين طلبين لنفس البصمة في نفس اللحظة: لا يُدرج مكرر
    RETURN jsonb_build_object('ok', false, 'error', 'سبق إرسال ردك على هذا الاستبيان');
  WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'error', 'تعذر حفظ الرد — أعد المحاولة');
END;
$$;

-- ------------------------------------------------------------
-- 8) الصلاحيات (الدوال الثلاث العامة + المساعده داخلية)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_student_surveys(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_student_surveys(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_public_surveys(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_public_surveys(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.submit_survey_response(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_survey_response(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- تحديث كاش المخطط لدى PostgREST حتى يرى version / identity_hash
NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- فحوص سريعة بعد التشغيل:
--   SELECT id, title, version, (response_salt <> '') AS has_salt FROM public.surveys;
--   SELECT survey_id, version, count(*) FROM public.survey_responses GROUP BY 1,2;
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'survey_responses';
--
-- اختبار عملي — الرد الثاني لنفس الرقم لا يُنشئ صفًا جديدًا:
--   SELECT public.submit_survey_response(NULL, '<id>', '{}'::jsonb, 'زائر تجربة', '01000000001');
--   SELECT public.submit_survey_response(NULL, '<id>', '{"q1":{"text":"ثانية"}}'::jsonb,
--                                        'زائر تجربة', '٠١٠٠٠٠٠٠٠٠١');   -- نفس البصمة ⇒ updated=true
--   SELECT public.submit_survey_response(NULL, '<id>', '{}'::jsonb, 'زائر آخر', NULL);  -- مرفوض
--   SELECT count(*) FROM public.survey_responses WHERE survey_id = '<id>';  -- = 1
--
-- تعديل الأسئلة يفتح الإجابة من جديد (نسخة أعلى) بلا كسر للردود السابقة:
--   SELECT version FROM public.surveys WHERE id = '<id>';
-- ------------------------------------------------------------
