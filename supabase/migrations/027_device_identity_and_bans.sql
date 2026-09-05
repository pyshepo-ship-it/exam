-- ============================================================
-- 027_device_identity_and_bans.sql
--
-- التعرّف على الزائر بلا تسجيل دخول، وحظر جهاز المسيء، وربط المشاركات
-- المجهولة بالطالب المسجَّل — والخادم هو الحكم في كل ذلك.
--
-- الفكرة: كل متصفح يرسل قيمتين مستقلتين:
--   • البطاقة (device card): نص عشوائي يخزّنه المتصفح في ثلاثة أماكن.
--   • البصمة (fingerprint): هاش من خصائص العتاد يُحسب بلا تخزين، فيصمد أمام
--     مسح البيانات ونافذة التخفي.
-- تُخزَّن البطاقة كما هي (لا تدل على شخص) وتُخزَّن البصمة كما وصلت مهشَّرة من
-- المتصفح. أي منهما يكفي للتعرّف على الجهاز، والاثنان معًا يرفعان الثقة.
--
-- ما يضيفه هذا الملف:
--   1) جدول devices: سجل كل جهاز زار الموقع + آخر ظهور + عدد الزيارات
--      + ربطه بالطالب لحظة دخوله بحسابه (أول ربط وآخر ربط).
--   2) جدول device_bans: الحظر ورفعه بسجل كامل (من حظر ولماذا ومتى).
--   3) جدول device_events: تتبّع مختصر لأحداث الجهاز (زيارة/اختبار/استبيان/
--      استفسار) بلا أي محتوى شخصي، لعرض «سجل الجهاز» للمعلم.
--   4) أعمدة device_card / device_fp على exam_attempts و survey_responses
--      و inquiries كي يظهر زر الحظر بجانب كل مشاركة.
--   5) دوال RPC: touch_device (نبضة زيارة + كشف الحظر + الربط بالحساب)،
--      و identify_device (للمعلم: من هذا الجهاز؟).
--   6) تعديل start_online_exam_session: يرفض الجهاز المحظور، ويحتسب حد
--      المحاولات **على الجهاز** لا على الاسم — فتغيير الاسم لم يعد يمنح
--      محاولات جديدة (مع منح استثناء يدوي من المعلم عند الحاجة).
--   7) تعديل submit_survey_response: يرفض الجهاز المحظور ويسجّل بطاقته.
--
-- آمن للتشغيل أكثر من مرة.
-- ============================================================

-- ------------------------------------------------------------
-- 1) سجل الأجهزة
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.devices (
  card          TEXT PRIMARY KEY,
  fp_hash       TEXT,
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  visits        INTEGER NOT NULL DEFAULT 1,
  -- الطالب المرتبط: يُسجَّل لحظة دخوله بحسابه من هذا الجهاز
  student_id    TEXT REFERENCES public.students(id) ON DELETE SET NULL,
  linked_at     TIMESTAMPTZ,
  -- آخر اسم استعمله هذا الجهاز كزائر (للعرض فقط)
  last_guest_name TEXT,
  net_hash      TEXT,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_devices_fp      ON public.devices (fp_hash);
CREATE INDEX IF NOT EXISTS idx_devices_student ON public.devices (student_id);
CREATE INDEX IF NOT EXISTS idx_devices_seen    ON public.devices (last_seen DESC);

-- ------------------------------------------------------------
-- 2) الحظر — بالبطاقة و/أو بالبصمة (البصمة تمنع الالتفاف بمسح التخزين)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_bans (
  id          TEXT PRIMARY KEY,
  card        TEXT,
  fp_hash     TEXT,
  reason      TEXT NOT NULL DEFAULT '',
  -- لقطة تعريفية وقت الحظر (اسم الطالب إن كان معروفًا) للعرض في القائمة
  label       TEXT NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  lifted_at   TIMESTAMPTZ,
  CONSTRAINT device_bans_target_chk CHECK (
    NULLIF(trim(COALESCE(card, '')), '') IS NOT NULL
    OR NULLIF(trim(COALESCE(fp_hash, '')), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_device_bans_card ON public.device_bans (card) WHERE active;
CREATE INDEX IF NOT EXISTS idx_device_bans_fp   ON public.device_bans (fp_hash) WHERE active;

-- ------------------------------------------------------------
-- 3) أحداث الجهاز — سجل مختصر بلا محتوى شخصي
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_events (
  id         BIGSERIAL PRIMARY KEY,
  card       TEXT,
  fp_hash    TEXT,
  kind       TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  student_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_device_events_card ON public.device_events (card, created_at DESC);

-- ------------------------------------------------------------
-- 4) ربط المشاركات بالجهاز
-- ------------------------------------------------------------
ALTER TABLE public.exam_attempts     ADD COLUMN IF NOT EXISTS device_card TEXT;
ALTER TABLE public.exam_attempts     ADD COLUMN IF NOT EXISTS device_fp   TEXT;
ALTER TABLE public.survey_responses  ADD COLUMN IF NOT EXISTS device_card TEXT;
ALTER TABLE public.survey_responses  ADD COLUMN IF NOT EXISTS device_fp   TEXT;
ALTER TABLE public.inquiries         ADD COLUMN IF NOT EXISTS device_card TEXT;
ALTER TABLE public.inquiries         ADD COLUMN IF NOT EXISTS device_fp   TEXT;
ALTER TABLE public.online_exam_sessions ADD COLUMN IF NOT EXISTS device_card TEXT;
ALTER TABLE public.online_exam_sessions ADD COLUMN IF NOT EXISTS device_fp   TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_device
  ON public.online_exam_sessions (exam_id, device_card);

-- استثناء يدوي من المعلم: محاولات إضافية لجهاز بعينه في اختبار بعينه
CREATE TABLE IF NOT EXISTS public.device_attempt_grants (
  id         TEXT PRIMARY KEY,
  exam_id    TEXT NOT NULL,
  card       TEXT NOT NULL,
  extra      INTEGER NOT NULL DEFAULT 1,
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_device_grants ON public.device_attempt_grants (exam_id, card);

-- ------------------------------------------------------------
-- 5) الأمان: لا يقرأ الزائر أيًّا من هذه الجداول؛ المعلم فقط
-- ------------------------------------------------------------
ALTER TABLE public.devices               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_bans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_attempt_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teacher full access devices"        ON public.devices;
DROP POLICY IF EXISTS "teacher full access device_bans"    ON public.device_bans;
DROP POLICY IF EXISTS "teacher full access device_events"  ON public.device_events;
DROP POLICY IF EXISTS "teacher full access device_grants"  ON public.device_attempt_grants;
CREATE POLICY "teacher full access devices"       ON public.devices               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "teacher full access device_bans"   ON public.device_bans           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "teacher full access device_events" ON public.device_events         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "teacher full access device_grants" ON public.device_attempt_grants FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.devices               FROM anon;
REVOKE ALL ON TABLE public.device_bans           FROM anon;
REVOKE ALL ON TABLE public.device_events         FROM anon;
REVOKE ALL ON TABLE public.device_attempt_grants FROM anon;
GRANT ALL ON TABLE public.devices               TO authenticated, service_role;
GRANT ALL ON TABLE public.device_bans           TO authenticated, service_role;
GRANT ALL ON TABLE public.device_events         TO authenticated, service_role;
GRANT ALL ON TABLE public.device_attempt_grants TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.device_events_id_seq TO authenticated, service_role;

-- ------------------------------------------------------------
-- 6) أدوات داخلية
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.device_key_ok(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_value ~ '^[a-z0-9-]{16,128}$' THEN p_value
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.device_fp_ok(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_value ~ '^[a-f0-9]{64}$' THEN p_value
    ELSE NULL
  END;
$$;

/** هل هذا الجهاز محظور؟ يكفي أن تطابق البطاقة أو البصمة حظرًا ساريًا */
CREATE OR REPLACE FUNCTION public.device_is_banned(p_card TEXT, p_fp TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.device_bans b
     WHERE b.active
       AND (
         (public.device_key_ok(p_card) IS NOT NULL AND b.card = p_card)
         OR (public.device_fp_ok(p_fp) IS NOT NULL AND b.fp_hash = p_fp)
       )
  );
$$;

-- ------------------------------------------------------------
-- 7) نبضة الجهاز: تسجيل الزيارة + الربط بالحساب + إبلاغ الحظر
--    يناديها كل صفحة عامة مرة واحدة عند الفتح.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_device(
  p_card TEXT,
  p_fp   TEXT,
  p_token TEXT DEFAULT NULL,
  p_kind TEXT DEFAULT 'visit',
  p_detail TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_card TEXT := public.device_key_ok(p_card);
  v_fp   TEXT := public.device_fp_ok(p_fp);
  v_student TEXT;
  v_banned BOOLEAN;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_card IS NULL AND v_fp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'banned', false);
  END IF;

  v_banned := public.device_is_banned(v_card, v_fp);

  -- هوية الطالب من سرّ جلسته إن كان داخلاً بحسابه
  IF NULLIF(trim(COALESCE(p_token, '')), '') IS NOT NULL THEN
    SELECT s.student_id INTO v_student
      FROM public.student_sessions s
     WHERE s.token_hash = encode(digest(p_token, 'sha256'), 'hex')
       AND s.expires_at > v_now
     LIMIT 1;
  END IF;

  IF v_card IS NOT NULL THEN
    INSERT INTO public.devices (card, fp_hash, first_seen, last_seen, visits, student_id, linked_at)
    VALUES (v_card, v_fp, v_now, v_now, 1, v_student, CASE WHEN v_student IS NOT NULL THEN v_now END)
    ON CONFLICT (card) DO UPDATE
      SET last_seen  = v_now,
          visits     = public.devices.visits + 1,
          fp_hash    = COALESCE(EXCLUDED.fp_hash, public.devices.fp_hash),
          -- لا يُمسح ارتباط سابق بطالب، ويُحدَّث عند دخول طالب من الجهاز نفسه
          student_id = COALESCE(EXCLUDED.student_id, public.devices.student_id),
          linked_at  = CASE
            WHEN EXCLUDED.student_id IS NOT NULL THEN v_now
            ELSE public.devices.linked_at
          END;
  END IF;

  -- حدث واحد لكل نوع كل ١٠ دقائق حتى لا يتضخم السجل
  IF NOT EXISTS (
    SELECT 1 FROM public.device_events e
     WHERE e.card IS NOT DISTINCT FROM v_card
       AND e.kind = p_kind
       AND e.created_at > v_now - INTERVAL '10 minutes'
  ) THEN
    INSERT INTO public.device_events (card, fp_hash, kind, detail, student_id)
    VALUES (v_card, v_fp, COALESCE(NULLIF(trim(p_kind), ''), 'visit'), COALESCE(left(p_detail, 120), ''), v_student);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'banned', v_banned,
    'linked', v_student IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.touch_device(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_device(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.device_is_banned(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.device_is_banned(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- 8) من صاحب هذا الجهاز؟ — للوحة المعلم وحدها (authenticated)
--    تُرجع الطالب المرتبط بالبطاقة، أو بأي بطاقة تشترك في البصمة نفسها.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.identify_device(p_card TEXT, p_fp TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_card TEXT := public.device_key_ok(p_card);
  v_fp   TEXT := public.device_fp_ok(p_fp);
  v_row  RECORD;
  v_match TEXT := 'none';
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'هذه البيانات للمعلم فقط';
  END IF;

  -- (١) مطابقة بالبطاقة نفسها: أعلى ثقة
  SELECT d.*, s.name, s.phone, s.grade_id, s.group_id
    INTO v_row
    FROM public.devices d
    LEFT JOIN public.students s ON s.id = d.student_id
   WHERE v_card IS NOT NULL AND d.card = v_card
   LIMIT 1;
  IF FOUND AND v_row.student_id IS NOT NULL THEN
    v_match := 'card';
  ELSE
    -- (٢) مطابقة بالبصمة: الجهاز نفسه بعد مسح تخزينه أو من نافذة تخفٍّ
    SELECT d.*, s.name, s.phone, s.grade_id, s.group_id
      INTO v_row
      FROM public.devices d
      LEFT JOIN public.students s ON s.id = d.student_id
     WHERE v_fp IS NOT NULL AND d.fp_hash = v_fp AND d.student_id IS NOT NULL
     ORDER BY d.linked_at DESC NULLS LAST
     LIMIT 1;
    IF FOUND AND v_row.student_id IS NOT NULL THEN v_match := 'fingerprint'; END IF;
  END IF;

  IF v_match = 'none' THEN
    RETURN jsonb_build_object('ok', true, 'match', 'none');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'match', v_match,
    'confidence', CASE WHEN v_match = 'card' THEN 'high' ELSE 'medium' END,
    'studentId', v_row.student_id,
    'name', v_row.name,
    'phone', v_row.phone,
    'gradeId', v_row.grade_id,
    'groupId', v_row.group_id,
    'lastSeen', v_row.last_seen,
    'visits', v_row.visits
  );
END;
$$;

REVOKE ALL ON FUNCTION public.identify_device(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.identify_device(TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 9) بدء جلسة الاختبار: رفض المحظور + احتساب المحاولات على الجهاز
--    (تُعاد الدالة كاملة: CREATE OR REPLACE لا يرث SECURITY DEFINER)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.start_online_exam_session(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.start_online_exam_session(
  p_session_id TEXT,
  p_attempt_id TEXT,
  p_exam_id TEXT,
  p_student_id TEXT DEFAULT NULL,
  p_student_name TEXT DEFAULT '',
  p_phone TEXT DEFAULT NULL,
  p_grade_id TEXT DEFAULT '',
  p_group_id TEXT DEFAULT '',
  p_device_card TEXT DEFAULT NULL,
  p_device_fp TEXT DEFAULT NULL
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
  v_extra INTEGER := 0;
  v_secret TEXT;
  v_card TEXT := public.device_key_ok(p_device_card);
  v_fp   TEXT := public.device_fp_ok(p_device_fp);
BEGIN
  IF COALESCE(length(trim(p_session_id)), 0) < 12
     OR COALESCE(length(trim(p_attempt_id)), 0) < 12
     OR COALESCE(length(trim(p_exam_id)), 0) < 1 THEN
    RAISE EXCEPTION 'معرف جلسة الاختبار غير صالح';
  END IF;
  IF COALESCE(length(trim(p_student_name)), 0) < 2 THEN
    RAISE EXCEPTION 'اسم الطالب مطلوب لبدء الاختبار';
  END IF;

  IF public.device_is_banned(v_card, v_fp) THEN
    RAISE EXCEPTION 'تم إيقاف هذا الجهاز عن المشاركة — راجع المعلم';
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

  IF COALESCE(
       v_meta->>'deliveryMode',
       CASE WHEN v_meta->>'allowOnline' = 'true' THEN 'online' ELSE 'offline' END
     ) <> 'online'
     OR COALESCE(v_meta->>'allowOnline', 'false') <> 'true' THEN
    RAISE EXCEPTION 'هذا الاختبار غير منشور إلكترونياً';
  END IF;
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

  PERFORM pg_advisory_xact_lock(hashtext(
    p_exam_id || ':' || COALESCE(
      v_card,
      NULLIF(trim(p_student_id), ''),
      lower(trim(p_student_name)) || ':' || COALESCE(p_group_id, '')
    )
  ));

  IF v_limit > 0 THEN
    -- استثناء يدوي من المعلم لهذا الجهاز في هذا الاختبار
    IF v_card IS NOT NULL THEN
      SELECT COALESCE(sum(extra), 0) INTO v_extra
        FROM public.device_attempt_grants
       WHERE exam_id = p_exam_id AND card = v_card;
    END IF;

    -- المحاولات المحسوبة: هوية الحساب، أو الجهاز، أو الاسم+المجموعة —
    -- أيّها طابق. تغيير الاسم وحده لم يعد يمنح رصيدًا جديدًا.
    SELECT count(*) INTO v_used
      FROM public.online_exam_sessions os
     WHERE os.exam_id = p_exam_id
       AND (
         (NULLIF(trim(p_student_id), '') IS NOT NULL AND os.student_id = p_student_id)
         OR (v_card IS NOT NULL AND os.device_card = v_card)
         OR (v_fp IS NOT NULL AND os.device_fp = v_fp)
         OR (
           os.student_id IS NULL
           AND lower(trim(os.student_name)) = lower(trim(p_student_name))
           AND os.group_id = COALESCE(p_group_id, '')
         )
       );

    IF v_used >= v_limit + v_extra THEN
      RAISE EXCEPTION 'استُنفد الحد الأقصى للمحاولات لهذا الاختبار من هذا الجهاز';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.online_exam_sessions WHERE id = p_session_id OR attempt_id = p_attempt_id) THEN
    RAISE EXCEPTION 'هذه الجلسة مستخدمة بالفعل';
  END IF;

  v_secret := md5(random()::text || clock_timestamp()::text || p_session_id)
    || md5(random()::text || clock_timestamp()::text || p_attempt_id);
  v_minutes := GREATEST(1, LEAST(COALESCE(v_exam.duration, 60)::integer, 1440));

  INSERT INTO public.online_exam_sessions (
    id, attempt_id, session_secret, exam_id, student_id, student_name,
    phone, grade_id, group_id, started_at, expires_at, updated_at, device_card, device_fp
  ) VALUES (
    p_session_id, p_attempt_id, v_secret, p_exam_id, NULLIF(trim(p_student_id), ''), trim(p_student_name),
    NULLIF(trim(p_phone), ''), COALESCE(p_grade_id, ''), COALESCE(p_group_id, ''),
    v_now, v_now + make_interval(secs => v_minutes * 60), v_now, v_card, v_fp
  );

  -- تسجيل الجهاز وحدثه (بلا كسر بدء الاختبار إن فشل التسجيل)
  IF v_card IS NOT NULL THEN
    BEGIN
      INSERT INTO public.devices (card, fp_hash, last_seen, last_guest_name, student_id, linked_at)
      VALUES (v_card, v_fp, v_now, trim(p_student_name), NULLIF(trim(p_student_id), ''),
              CASE WHEN NULLIF(trim(p_student_id), '') IS NOT NULL THEN v_now END)
      ON CONFLICT (card) DO UPDATE
        SET last_seen = v_now,
            fp_hash = COALESCE(EXCLUDED.fp_hash, public.devices.fp_hash),
            last_guest_name = COALESCE(EXCLUDED.last_guest_name, public.devices.last_guest_name),
            student_id = COALESCE(public.devices.student_id, EXCLUDED.student_id),
            linked_at = COALESCE(public.devices.linked_at, EXCLUDED.linked_at);
      INSERT INTO public.device_events (card, fp_hash, kind, detail, student_id)
      VALUES (v_card, v_fp, 'exam_start', left(COALESCE(v_meta->>'title', p_exam_id), 120), NULLIF(trim(p_student_id), ''));
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'id', p_session_id,
    'secret', v_secret,
    'attemptId', p_attempt_id,
    'startedAt', v_now,
    'expiresAt', v_now + make_interval(secs => v_minutes * 60)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_online_exam_session(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_online_exam_session(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;


-- ------------------------------------------------------------
-- 11) الاستبيانات: رفض الجهاز المحظور + تسجيل بطاقته مع الرد
--     (نعيد الدالة كاملة من 023 مع الإضافتين، ونحذف التوقيع القديم أولاً)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_survey_response(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_survey_response(
  p_token          TEXT,
  p_survey_id      TEXT,
  p_answers        JSONB,
  p_guest_name     TEXT DEFAULT NULL,
  p_guest_phone    TEXT DEFAULT NULL,
  p_guest_grade_id TEXT DEFAULT NULL,
  p_guest_group_id TEXT DEFAULT NULL,
  p_device_id      TEXT DEFAULT NULL,
  p_device_fp      TEXT DEFAULT NULL
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
  -- جهاز أوقفه المعلم لا يشارك في أي استبيان
  IF public.device_is_banned(public.device_key_ok(p_device_id), public.device_fp_ok(p_device_fp)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'banned',
      'error', 'تم إيقاف هذا الجهاز عن المشاركة — راجع المعلم');
  END IF;
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
     answers, identity_hash, net_hash, duplicate_suspect, device_card, device_fp, created_at)
  VALUES
    (v_new_id, p_survey_id, v_survey.version, v_sid, coalesce(v_name, ''), v_phone,
     v_grade, v_group, coalesce(p_answers, '{}'::jsonb), v_hash, v_net, v_suspect,
     public.device_key_ok(p_device_id), public.device_fp_ok(p_device_fp), now());

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

REVOKE ALL ON FUNCTION public.submit_survey_response(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_survey_response(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- 9-ب) محاولة الاختبار ترث جهاز جلستها تلقائياً
--     (بدل إعادة كتابة submit_online_exam_session كاملة، ومع حماية
--      الأعمدة من upsert لوحة المعلم كما في مُشغِّل الاستبيانات)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exam_attempt_device_fill()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session RECORD;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- لا يمحو رفعُ لوحة المعلم بيانات الجهاز التي سجّلها الخادم
    NEW.device_card := COALESCE(NEW.device_card, OLD.device_card);
    NEW.device_fp   := COALESCE(NEW.device_fp, OLD.device_fp);
  END IF;

  IF NEW.device_card IS NULL OR NEW.device_fp IS NULL THEN
    SELECT device_card, device_fp INTO v_session
      FROM public.online_exam_sessions
     WHERE attempt_id = NEW.id
     LIMIT 1;
    IF FOUND THEN
      NEW.device_card := COALESCE(NEW.device_card, v_session.device_card);
      NEW.device_fp   := COALESCE(NEW.device_fp, v_session.device_fp);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exam_attempt_device ON public.exam_attempts;
CREATE TRIGGER trg_exam_attempt_device
  BEFORE INSERT OR UPDATE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.exam_attempt_device_fill();

REVOKE ALL ON FUNCTION public.exam_attempt_device_fill() FROM anon;

-- ------------------------------------------------------------
-- 10) فحص تثبيت
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'start_online_exam_session' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'start_online_exam_session فقدت SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'touch_device' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'touch_device يجب أن تكون SECURITY DEFINER';
  END IF;
  IF has_table_privilege('anon', 'public.devices', 'SELECT')
     OR has_table_privilege('anon', 'public.device_bans', 'SELECT') THEN
    RAISE EXCEPTION 'جداول الأجهزة يجب ألا تكون مقروءة من anon';
  END IF;
END;
$$;
