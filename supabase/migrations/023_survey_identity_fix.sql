-- ============================================================
-- 023) إصلاح «الاستبيان غير موجود» + هوية المُجيب بلا رقم هاتف إجباري
-- ============================================================
-- (١) العطل الذي كان يمنع كل الردود
-- ------------------------------------------------------------
-- في ترحيل 022 أُعيد إنشاء public.submit_survey_response بـ
-- CREATE OR REPLACE FUNCTION بدون كلمة SECURITY DEFINER (كانت موجودة في 021).
-- وCREATE OR REPLACE لا «يرث» خصائص الدالة القديمة: أي دالة بلا SECURITY DEFINER
-- تعمل بصلاحيات المنادي = دور anon (كل التطبيق ينادي Supabase بمفتاح anon، حتى
-- الطالب المسجَّل — جلسته سرّ داخل الدالة لا دور قاعدة بيانات).
--
-- ولأن RLS مفعّل على public.surveys وليس لـ anon أي سياسة قراءة، فإن أول جملة
-- في الدالة: SELECT * FROM public.surveys WHERE id = p_survey_id
-- كانت تعود صفرَ صفوف دائمًا ⇒ ترجع الدالة «الاستبيان غير موجود» لكل مُجيب:
-- الزائر في وضع التخفي، والطالب المسجَّل الذي أجاب فعلًا، والجميع.
-- (ولو تجاوزت ذلك لفشلت بعدها على surveys_for_student المسحوبة من anon.)
--
-- الإصلاح هنا: إعادة تعريف الدالة بـ SECURITY DEFINER + فحص تثبيت في نهاية
-- الملف يرفض الترحيل إن بقيت أي دالة استبيان بلا SECURITY DEFINER، وبوابة في
-- scripts/sql-schema-audit.mjs تمنع تكرار هذا الصنف من الأخطاء في أي دالة
-- ممنوحة لـ anon مستقبلًا.
--
-- (٢) رقم الهاتف لم يعد إجباريًا
-- ------------------------------------------------------------
-- كان الرقم هو «الهوية» الوحيدة التي تمنع الرد المكرر، وهذا خطأ عملي:
--   • أي زائر يكتب رقمًا وهميًا مختلفًا في كل مرة ⇒ منع التكرار وهمي أصلًا.
--   • ومن يطلب رقم هاتف من زائر بلا تسجيل يُفقد الاستبيان معناه (استبيانات
--     Google لا تطلب شيئًا، وحقل الاسم فيها اختياري).
-- صار لكل استبيان طريقة تحقق يختارها المعلم (surveys.guest_identity):
--   device (الافتراضي) : بلا أي بيانات — المتصفح/الجهاز يُعرَّف ببطاقة عشوائية
--                        يصدرها الموقع ويحتفظ بها (localStorage + كوكي سنة)،
--                        وتُحسب منها بصمة موقّعة بملح الاستبيان في الخادم.
--                        يُضاف إليها كشف تلقائي للتكرار من نفس الشبكة/المتصفح
--                        (وضع التخفي، نافذة جديدة) فتُعلَّم الردود المشتبه بها
--                        للمعلم ويستطيع استبعادها من النتائج بضغطة.
--   strict            : ردّ واحد لكل شبكة+متصفح فعليًا (يمنع وضع التخفي تمامًا،
--                        وقد يمنع طالبين على نفس الواي-فاي بنفس المتصفح).
--   phone             : السلوك القديم — الرقم مطلوب ويربط الرد بحساب الطالب.
--   open              : بلا أي منع (تصويت حر) — يبقى حدّ إغراق فقط.
-- والاسم: surveys.name_mode = off | optional (الافتراضي) | required.
--
-- (٣) تحصين ضد فقد البصمات عند مزامنة لوحة المعلم
-- ------------------------------------------------------------
-- لوحة المعلم ترفع survey_responses بـ upsert بكل الأعمدة التي تعرفها فقط،
-- وupsert في PostgREST يستبدل الصف كاملًا: الأعمدة غير المُرسلة تعود لقيمها
-- الافتراضية ⇒ كانت مزامنة واحدة من المعلم تمسح identity_hash فيعود التكرار
-- ممكنًا بصمت. مُشغِّل جديد يحمي الأعمدة المملوكة للخادم من أي عميل.
--
-- التشغيل: Supabase ← SQL Editor ← الصق الملف كاملًا ← Run (آمن للتكرار)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1) أعمدة جديدة
-- ------------------------------------------------------------
ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS guest_identity TEXT NOT NULL DEFAULT 'device';
ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS name_mode TEXT NOT NULL DEFAULT 'optional';

ALTER TABLE public.surveys DROP CONSTRAINT IF EXISTS surveys_guest_identity_chk;
ALTER TABLE public.surveys
  ADD CONSTRAINT surveys_guest_identity_chk
  CHECK (guest_identity IN ('device', 'strict', 'phone', 'open'));

ALTER TABLE public.surveys DROP CONSTRAINT IF EXISTS surveys_name_mode_chk;
ALTER TABLE public.surveys
  ADD CONSTRAINT surveys_name_mode_chk
  CHECK (name_mode IN ('off', 'optional', 'required'));

-- الاستبيانات المجهولة لا تعرض حقل اسم أصلًا
UPDATE public.surveys SET name_mode = 'off'
  WHERE anonymous IS TRUE AND name_mode <> 'off';

ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS net_hash TEXT;
ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS duplicate_suspect BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_survey_responses_net
  ON public.survey_responses (survey_id, version, net_hash);

-- ------------------------------------------------------------
-- 2) بطاقة الجهاز: تنظيف ما يرسله العميل قبل أي استعمال
--    (نص عشوائي يولّده المتصفح مرة واحدة — لا معنى له خارج هذا الموقع،
--     ولا يُقبل إلا بطول معقول من حروف وأرقام وشرطات)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.survey_device_key(p_device TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE
    WHEN length(d) BETWEEN 16 AND 128 THEN d
    ELSE NULL
  END
  FROM (SELECT lower(regexp_replace(coalesce(p_device, ''), '[^A-Za-z0-9-]', '', 'g')) AS d) t
$$;

REVOKE ALL ON FUNCTION public.survey_device_key(TEXT) FROM PUBLIC;

-- ------------------------------------------------------------
-- 3) بصمة الطلب من ترويسات PostgREST (عنوان الشبكة + المتصفح)
--    لا تُخزَّن خامًا أبدًا: تُهشَّر بملح الاستبيان قبل الحفظ، فلا يستطيع
--    أحد — ولا المعلم — استخراج عنوان IP من قاعدة البيانات. وظيفتها الوحيدة
--    كشف «نفس الشخص من نافذة تخفٍّ جديدة» وحدّ الإغراق.
--    الأفضلية لـ cf-connecting-ip لأن العميل لا يستطيع تزويره (تضعه شبكة
--    Cloudflare أمام Supabase)، ثم x-real-ip، ثم آخر عنوان في x-forwarded-for
--    (آخر عنصر يضيفه أقرب وسيط — أول عنصر يستطيع العميل حقنه بنفسه).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.survey_request_fingerprint()
RETURNS TEXT
LANGUAGE plpgsql STABLE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_headers JSONB;
  v_xff     TEXT;
  v_parts   TEXT[];
  v_ip      TEXT;
  v_ua      TEXT;
  v_lang    TEXT;
BEGIN
  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  IF v_headers IS NULL THEN
    RETURN NULL;                     -- نداء من SQL Editor مثلًا: لا ترويسات
  END IF;

  v_ip := btrim(coalesce(v_headers ->> 'cf-connecting-ip', ''));
  IF v_ip = '' THEN
    v_ip := btrim(coalesce(v_headers ->> 'x-real-ip', ''));
  END IF;
  IF v_ip = '' THEN
    v_xff := coalesce(v_headers ->> 'x-forwarded-for', '');
    IF btrim(v_xff) <> '' THEN
      v_parts := string_to_array(v_xff, ',');
      v_ip := btrim(v_parts[array_length(v_parts, 1)]);
    END IF;
  END IF;

  IF v_ip = '' OR v_ip IS NULL THEN
    RETURN NULL;
  END IF;

  v_ua   := left(btrim(coalesce(v_headers ->> 'user-agent', '')), 400);
  v_lang := left(btrim(coalesce(v_headers ->> 'accept-language', '')), 120);

  RETURN v_ip || '|' || v_ua || '|' || v_lang;
END;
$$;

REVOKE ALL ON FUNCTION public.survey_request_fingerprint() FROM PUBLIC;

-- ------------------------------------------------------------
-- 4) حماية الأعمدة المملوكة للخادم من أي عميل (بما فيه لوحة المعلم)
--    upsert من الواجهة يرسل الأعمدة التي يعرفها فقط، والباقي يعود لقيمته
--    الافتراضية — فكانت مزامنة واحدة تمسح البصمات ويعود التكرار ممكنًا.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.survey_response_protect()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  NEW.identity_hash     := COALESCE(NEW.identity_hash, OLD.identity_hash);
  NEW.net_hash          := COALESCE(NEW.net_hash, OLD.net_hash);
  -- علامة الاشتباه لا تُمحى من عميل قديم لا يعرف العمود
  NEW.duplicate_suspect := COALESCE(NEW.duplicate_suspect, false) OR COALESCE(OLD.duplicate_suspect, false);
  -- النسخة تُحدَّد لحظة الإرسال ولا تُعدَّل بعدها
  NEW.version           := COALESCE(OLD.version, NEW.version, 1);
  NEW.survey_id         := COALESCE(OLD.survey_id, NEW.survey_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_survey_response_protect ON public.survey_responses;
CREATE TRIGGER trg_survey_response_protect
  BEFORE UPDATE ON public.survey_responses
  FOR EACH ROW EXECUTE FUNCTION public.survey_response_protect();

-- ------------------------------------------------------------
-- 5) get_public_surveys — يعرف الزائر ببطاقة جهازه (بلا رقم)
--    p_phone بقي للتوافق ولحالة «أنا مسجَّل عند المعلم» الاختيارية.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_public_surveys(TEXT);

CREATE OR REPLACE FUNCTION public.get_public_surveys(
  p_phone     TEXT DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_key TEXT := public.survey_phone_key(p_phone);
  v_dev TEXT := public.survey_device_key(p_device_id);
  v_fp  TEXT := public.survey_request_fingerprint();
  v_sid TEXT := NULL;
BEGIN
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
    -- «أجبت» = (استبيان:نسخة). تُحسب بمطابقة بصمة هذا الزائر مهما كان مصدرها:
    -- حسابه، أو رقمه إن أدخله، أو بطاقة جهازه، أو شبكته في الوضع المشدَّد.
    'answeredKeys', coalesce((
      SELECT jsonb_agg(DISTINCT k) FROM (
        SELECT r.survey_id || ':' || r.version AS k
        FROM public.survey_responses r
        WHERE (v_sid IS NOT NULL AND r.student_id = v_sid)
           OR (v_key IS NOT NULL AND public.survey_phone_key(r.phone) = v_key)
        UNION
        SELECT s.id || ':' || s.version
        FROM public.surveys s
        WHERE EXISTS (
          SELECT 1 FROM public.survey_responses x
          WHERE x.survey_id = s.id
            AND x.version = s.version
            AND (
              (x.identity_hash IS NOT NULL AND x.identity_hash IN (
                 public.survey_response_hash(s.response_salt, CASE WHEN v_sid IS NOT NULL THEN 'sid:' || v_sid END),
                 public.survey_response_hash(s.response_salt, CASE WHEN v_key IS NOT NULL THEN 'ph:'  || v_key END),
                 public.survey_response_hash(s.response_salt, CASE WHEN v_dev IS NOT NULL THEN 'dev:' || v_dev END)
              ))
              OR (s.guest_identity = 'strict' AND v_fp IS NOT NULL
                  AND x.net_hash = public.survey_response_hash(s.response_salt, 'net:' || v_fp))
            )
        )
      ) t), '[]'::jsonb)
  );
END;
$$;

-- ------------------------------------------------------------
-- 6) submit_survey_response — SECURITY DEFINER (إصلاح العطل) + الهوية الجديدة
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_survey_response(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_survey_response(
  p_token          TEXT,
  p_survey_id      TEXT,
  p_answers        JSONB,
  p_guest_name     TEXT DEFAULT NULL,
  p_guest_phone    TEXT DEFAULT NULL,
  p_guest_grade_id TEXT DEFAULT NULL,
  p_guest_group_id TEXT DEFAULT NULL,
  p_device_id      TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_survey   public.surveys%ROWTYPE;
  v_mode     TEXT := 'device';
  v_names    TEXT := 'optional';
  v_sid      TEXT := NULL;
  v_name     TEXT := '';
  v_phone    TEXT := NULL;
  v_grade    TEXT := NULL;
  v_group    TEXT := NULL;
  v_dev      TEXT := NULL;
  v_fp       TEXT := NULL;
  v_identity TEXT := NULL;
  v_hash     TEXT := NULL;
  v_net      TEXT := NULL;
  v_existing TEXT := NULL;
  v_suspect  BOOLEAN := false;
  v_new_id   TEXT;
  v_row      JSONB;
  v_recent   INTEGER := 0;
  v_status   TEXT := '';
BEGIN
  SELECT * INTO v_survey FROM public.surveys WHERE id = p_survey_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'missing',
      'error', 'لم يعد هذا الاستبيان متاحًا — حدِّث الصفحة');
  END IF;
  IF v_survey.published IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'الاستبيان غير متاح حاليًا');
  END IF;
  IF v_survey.deadline IS NOT NULL AND v_survey.deadline < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'انتهى موعد الاستبيان');
  END IF;

  v_mode  := coalesce(nullif(v_survey.guest_identity, ''), 'device');
  v_names := coalesce(nullif(v_survey.name_mode, ''), 'optional');
  v_dev   := public.survey_device_key(p_device_id);
  v_fp    := public.survey_request_fingerprint();

  -- ----------------------------------------------------------
  -- هوية المُجيب
  -- ----------------------------------------------------------
  IF p_token IS NOT NULL AND p_token <> '' THEN
    -- طالب مسجَّل: هويته من سرّ جلسته فقط (لا يُصدَّق اسم ولا رقم مُدخل يدويًا)
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

    v_phone := public.survey_phone_key(p_guest_phone);

    -- الرقم لم يعد مطلوبًا إلا إن اختار المعلم طريقة «رقم الهاتف»
    IF v_mode = 'phone' AND v_phone IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'اكتب رقم هاتف صحيح (11 رقمًا)');
    END IF;

    -- الاسم: مخفي / اختياري / مطلوب — والمجهول لا يحفظ اسمًا مهما أُرسل
    IF v_survey.anonymous IS TRUE OR v_names = 'off' THEN
      v_name := '';
    ELSE
      v_name := btrim(coalesce(p_guest_name, ''));
      IF v_names = 'required' AND length(v_name) < 2 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'اكتب اسمك من فضلك');
      END IF;
    END IF;

    -- رقم مسجّل كطالب؟ يُربط الرد بحسابه (نفس بصمته في بوابته)
    IF v_phone IS NOT NULL THEN
      SELECT st.id INTO v_sid
      FROM public.students st
      WHERE public.survey_phone_key(st.phone) = v_phone
      LIMIT 1;
    END IF;

    IF v_sid IS NOT NULL THEN
      SELECT st.name, st.grade_id, st.group_id
        INTO v_name, v_grade, v_group
      FROM public.students st WHERE st.id = v_sid;
      v_identity := 'sid:' || v_sid;
    ELSE
      v_grade := nullif(btrim(coalesce(p_guest_grade_id, '')), '');
      v_group := nullif(btrim(coalesce(p_guest_group_id, '')), '');
      -- ترتيب الهوية: الرقم إن وُجد، وإلا بطاقة الجهاز، وإلا بصمة الشبكة
      v_identity := CASE
        WHEN v_phone IS NOT NULL THEN 'ph:'  || v_phone
        WHEN v_dev   IS NOT NULL THEN 'dev:' || v_dev
        WHEN v_fp    IS NOT NULL THEN 'net:' || v_fp
        ELSE NULL
      END;
    END IF;
  END IF;

  -- هل الاستبيان موجّه لهذا المُجيب فعلاً؟ (الصف/المجموعة/الجميع)
  IF NOT EXISTS (SELECT 1 FROM public.surveys_for_student(v_sid) x WHERE x.id = p_survey_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'هذا الاستبيان غير موجّه إليك');
  END IF;

  v_hash := public.survey_response_hash(v_survey.response_salt, v_identity);
  IF v_fp IS NOT NULL THEN
    v_net := public.survey_response_hash(v_survey.response_salt, 'net:' || v_fp);
  END IF;

  -- تصويت حر: لا هوية ولا منع تكرار (اختيار صريح من المعلم)
  IF v_mode = 'open' AND v_sid IS NULL THEN
    v_hash := NULL;
  END IF;

  -- بلا أي وسيلة تعريف (ولا وضع حر) لا نضمن عدم التكرار ⇒ نرفض بدل إفساد النتائج
  IF v_hash IS NULL AND v_mode <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'تعذّر فتح الاستبيان في هذا المتصفح — فعّل تخزين المواقع أو جرّب متصفحًا آخر');
  END IF;

  -- ----------------------------------------------------------
  -- ردّه السابق على هذه النسخة؟ (تكرار = تحديث ردّه هو، لا صف ثانٍ)
  -- ----------------------------------------------------------
  IF v_hash IS NOT NULL OR (v_mode = 'strict' AND v_net IS NOT NULL) THEN
    SELECT r.id INTO v_existing
    FROM public.survey_responses r
    WHERE r.survey_id = p_survey_id
      AND r.version = v_survey.version
      AND (
        (v_hash IS NOT NULL AND r.identity_hash = v_hash)
        -- الوضع المشدَّد: نفس الشبكة والمتصفح = نفس الشخص (يمنع وضع التخفي)
        OR (v_mode = 'strict' AND v_sid IS NULL AND v_net IS NOT NULL AND r.net_hash = v_net)
      )
    ORDER BY (v_hash IS NOT NULL AND r.identity_hash = v_hash) DESC, r.created_at DESC
    LIMIT 1;
  END IF;

  IF v_existing IS NOT NULL THEN
    IF v_survey.lock_after_submit IS TRUE THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'locked', 'responseId', v_existing,
        'error', 'أُرسلت إجابتك ولا يمكن تعديلها — إن احتجت تعديلًا تواصل مع المعلم'
      );
    END IF;

    UPDATE public.survey_responses
      SET answers       = coalesce(p_answers, '{}'::jsonb),
          identity_hash = COALESCE(identity_hash, v_hash),
          net_hash      = COALESCE(net_hash, v_net)
      WHERE id = v_existing;

    SELECT to_jsonb(r) INTO v_row FROM public.survey_responses r WHERE r.id = v_existing;
    RETURN jsonb_build_object(
      'ok', true, 'responseId', v_existing, 'updated', true, 'code', 'updated',
      'version', v_survey.version, 'response', v_row - 'identity_hash' - 'net_hash'
    );
  END IF;

  -- حماية إغراق للزوار: ردود كثيرة متتابعة من نفس الشبكة والمتصفح
  IF v_sid IS NULL AND v_net IS NOT NULL THEN
    SELECT count(*) INTO v_recent
    FROM public.survey_responses r
    WHERE r.net_hash = v_net
      AND r.created_at > now() - interval '1 hour';
    IF v_recent >= 40 THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'عدد المحاولات كبير الآن — انتظر قليلًا ثم أعد المحاولة');
    END IF;
  END IF;

  -- كشف التكرار المُرجَّح: نفس الشبكة والمتصفح أجابا على نفس النسخة من قبل
  -- (وضع التخفي/متصفح آخر على نفس الجهاز). لا يُمنع الردّ في الوضع الافتراضي
  -- — يُعلَّم فقط ليستبعده المعلم من النتائج بضغطة إن شاء.
  IF v_sid IS NULL AND v_net IS NOT NULL AND v_mode IN ('device', 'phone') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.survey_responses r
      WHERE r.survey_id = p_survey_id
        AND r.version = v_survey.version
        AND r.net_hash = v_net
    ) INTO v_suspect;
  END IF;

  -- الاستبيان المجهول: لا هوية مخزَّنة إطلاقًا — البصمات وحدها تمنع التكرار
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
     answers, identity_hash, net_hash, duplicate_suspect, created_at)
  VALUES
    (v_new_id, p_survey_id, v_survey.version, v_sid, coalesce(v_name, ''), v_phone,
     v_grade, v_group, coalesce(p_answers, '{}'::jsonb), v_hash, v_net, v_suspect, now());

  SELECT to_jsonb(r) INTO v_row FROM public.survey_responses r WHERE r.id = v_new_id;
  RETURN jsonb_build_object(
    'ok', true, 'responseId', v_new_id, 'version', v_survey.version,
    'response', v_row - 'identity_hash' - 'net_hash'
  );
EXCEPTION
  WHEN unique_violation THEN
    -- سباق بين طلبين لنفس البصمة في نفس اللحظة: لا يُدرج مكرر
    RETURN jsonb_build_object('ok', false, 'code', 'duplicate',
      'error', 'سبق إرسال ردك على هذا الاستبيان');
  WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'error', 'تعذر حفظ الرد — أعد المحاولة');
END;
$$;

-- ------------------------------------------------------------
-- 7) الصلاحيات
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_public_surveys(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_public_surveys(TEXT, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.submit_survey_response(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_survey_response(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;

-- ------------------------------------------------------------
-- 8) فحص التثبيت: لا دالة استبيان بلا SECURITY DEFINER
--    هذا هو الفحص الذي كان سيمنع عطل 022 من الوصول للطلاب أصلًا.
-- ------------------------------------------------------------
DO $guard$
DECLARE
  v_bad TEXT;
BEGIN
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ' | ')
    INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('submit_survey_response', 'get_public_surveys',
                      'get_student_surveys', 'surveys_for_student')
    AND p.prosecdef IS FALSE;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'دوال الاستبيان التالية بلا SECURITY DEFINER فلن تقرأ جدول surveys بدور anon (سيظهر «الاستبيان غير موجود»): %',
      v_bad;
  END IF;
END
$guard$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- فحوص سريعة بعد التشغيل:
--   SELECT proname, prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND proname LIKE '%survey%';        -- كلها true
--   SELECT id, title, guest_identity, name_mode FROM public.surveys;
--
-- اختبار عملي (بلا رقم هاتف إطلاقًا):
--   SELECT public.submit_survey_response(NULL, '<id>', '{}'::jsonb, NULL, NULL, NULL, NULL,
--                                        'device-aaaaaaaaaaaaaaaa');
--   SELECT public.submit_survey_response(NULL, '<id>', '{"q1":{"text":"ثانية"}}'::jsonb, NULL, NULL, NULL, NULL,
--                                        'device-aaaaaaaaaaaaaaaa');   -- updated = true
--   SELECT count(*) FROM public.survey_responses WHERE survey_id = '<id>';  -- = 1
-- ------------------------------------------------------------
