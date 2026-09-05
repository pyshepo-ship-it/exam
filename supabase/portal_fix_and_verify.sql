-- ============================================================================
-- 016-fix) إصلاح + تأمين بوابة الطالب + فحص سلامة شامل (آمن لإعادة التشغيل)
-- ============================================================================
-- يُشغَّل كاملاً في Supabase → SQL Editor.
-- هذا هو ملف الإصلاح المباشر إذا قَبِل تسجيل دخول الطالب ثم ظهرت شاشة
-- «تعذر تحميل بياناتك»: ثبّت الدوال أدناه ثم اخرج من حساب الطالب وادخل مجدداً.
--
-- ماذا يفعل:
--   1) يُنشئ الجداول/الأعمدة/الدوال/السياسات/الصلاحيات إن لم توجد (IDEMPOTENT).
--   2) يمنع أي قراءة خام (SELECT) من anon على بيانات الطلاب/الدرجات/المالية/السجل.
--   3) يجعل الدخول والقراءة عبر دوال SECURITY DEFINER فقط.
--   4) يفحص في النهاية سلامة الجداول وأعمدة RLS وصلاحيات anon والدوال، ويطبع تقريراً.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- (1) جداول بوابة الطالب — تُنشأ إن لم تكن موجودة + ضمان الأعمدة الناقصة
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manual_grades (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  grade_id TEXT REFERENCES grades(id) ON DELETE SET NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'تقييم',
  score NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_score NUMERIC(10,2) NOT NULL DEFAULT 0,
  month INTEGER NOT NULL DEFAULT 1,
  year INTEGER NOT NULL DEFAULT 2026,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS idx_manual_grades_student ON manual_grades(student_id);

CREATE TABLE IF NOT EXISTS registration_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  guardian_phone TEXT,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  grade_id TEXT REFERENCES grades(id) ON DELETE SET NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  linked_student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  reviewed_at TEXT
);
-- أعمدة قد تأتي ناقصة من ترحيلات سابقة
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS guardian_phone TEXT;
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS linked_student_id TEXT;
CREATE INDEX IF NOT EXISTS idx_reg_requests_email ON registration_requests(email);
CREATE INDEX IF NOT EXISTS idx_reg_requests_status ON registration_requests(status);

CREATE TABLE IF NOT EXISTS group_transfer_requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL DEFAULT '',
  from_group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  to_grade_id TEXT REFERENCES grades(id) ON DELETE SET NULL,
  to_group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  reviewed_at TEXT
);
ALTER TABLE group_transfer_requests ADD COLUMN IF NOT EXISTS student_name TEXT NOT NULL DEFAULT '';
ALTER TABLE group_transfer_requests ADD COLUMN IF NOT EXISTS to_grade_id TEXT;
CREATE INDEX IF NOT EXISTS idx_transfer_student ON group_transfer_requests(student_id);

CREATE TABLE IF NOT EXISTS student_history (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'account',
  title TEXT NOT NULL DEFAULT '',
  detail TEXT,
  date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS idx_student_history_student ON student_history(student_id);

CREATE TABLE IF NOT EXISTS student_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
-- قد يكون العمود ناقصاً في قواعد قديمة (قد لا يكون فيه كلمة مرور)
ALTER TABLE student_accounts ADD COLUMN IF NOT EXISTS password_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_student_accounts_email ON student_accounts(email);
CREATE INDEX IF NOT EXISTS idx_student_accounts_student ON student_accounts(student_id);

CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL DEFAULT '',
  grade_id TEXT REFERENCES grades(id) ON DELETE SET NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS idx_inquiries_student ON inquiries(student_id);

-- جلسات الطلاب الآمنة (لا وصول لـ anon/authenticated؛ الدوال المالكة فقط)
CREATE TABLE IF NOT EXISTS student_sessions (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_student_sessions_token_hash ON student_sessions(token_hash);

-- عمود قناة الاستفسار على الطلاب — قد يكون ناقصاً
ALTER TABLE students ADD COLUMN IF NOT EXISTS inquiry_blocked BOOLEAN DEFAULT false;

-- ----------------------------------------------------------------------------
-- (2) RLS: كل الجداول الحسّاسة مغلقة عن anon نهائياً
-- ----------------------------------------------------------------------------
ALTER TABLE manual_grades            ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_transfer_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_sessions         ENABLE ROW LEVEL SECURITY;

-- وصول كامل للمعلم (المصادق)
DROP POLICY IF EXISTS "authenticated full access" ON manual_grades;
CREATE POLICY "authenticated full access" ON manual_grades FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON registration_requests;
CREATE POLICY "authenticated full access" ON registration_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON group_transfer_requests;
CREATE POLICY "authenticated full access" ON group_transfer_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON student_history;
CREATE POLICY "authenticated full access" ON student_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON student_accounts;
CREATE POLICY "authenticated full access" ON student_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON inquiries;
CREATE POLICY "authenticated full access" ON inquiries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- إزالة أي سياسات قراءة عامة قديمة (من 008/009) ثم إبقاء الإدراج للطلبات فقط
DROP POLICY IF EXISTS "public read" ON manual_grades;
DROP POLICY IF EXISTS "public read" ON registration_requests;
DROP POLICY IF EXISTS "public insert" ON registration_requests;
DROP POLICY IF EXISTS "public read" ON group_transfer_requests;
DROP POLICY IF EXISTS "public insert" ON group_transfer_requests;
DROP POLICY IF EXISTS "public read" ON student_history;
DROP POLICY IF EXISTS "public read" ON student_accounts;
DROP POLICY IF EXISTS "public read" ON inquiries;
DROP POLICY IF EXISTS "public insert" ON inquiries;

-- الزائر يرسل طلباته فقط (إدراج) — لا قراءة لبيانات أي طالب/حساب/درجات/مالية/سجل
CREATE POLICY "anon insert registration_requests" ON registration_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon insert group_transfer_requests" ON group_transfer_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon insert inquiries" ON inquiries FOR INSERT TO anon WITH CHECK (true);

-- لا قراءة خام لـ anon على كل بيانات البوابة الحسّاسة
REVOKE SELECT ON TABLE public.manual_grades            FROM anon;
REVOKE SELECT ON TABLE public.student_history          FROM anon;
REVOKE SELECT ON TABLE public.group_transfer_requests  FROM anon;
REVOKE SELECT ON TABLE public.inquiries                FROM anon;
REVOKE SELECT ON TABLE public.student_accounts         FROM anon;
REVOKE SELECT ON TABLE public.registration_requests    FROM anon;
REVOKE SELECT ON TABLE public.student_sessions         FROM anon, authenticated;

-- الصلاحيات للأدوار الموثوقة
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.manual_grades           TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.registration_requests   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.group_transfer_requests TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_history         TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_accounts        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inquiries               TO authenticated, service_role;
GRANT INSERT ON TABLE public.registration_requests   TO anon;
GRANT INSERT ON TABLE public.group_transfer_requests TO anon;
GRANT INSERT ON TABLE public.inquiries               TO anon;

-- ----------------------------------------------------------------------------
-- (3) دوال الدخول الآمنة (SECURITY DEFINER) — قراءة داخلية بلا حاجة لقراءة anon
-- ----------------------------------------------------------------------------

-- التحقق من البريد/الحالة/كلمة المرور ثم إصدار توكين جلسة.
-- يُميّز النتائج برمز code حتى تعرض الواجهة الرسالة الصحيحة.
CREATE OR REPLACE FUNCTION public.student_login(p_email TEXT, p_password TEXT, p_legacy_fnv TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mail TEXT := lower(trim(p_email));
  v_account public.student_accounts%ROWTYPE;
  v_req public.registration_requests%ROWTYPE;
  v_student public.students%ROWTYPE;
  v_sha TEXT;
  v_ok BOOLEAN := false;
  v_student_id TEXT;
  v_token TEXT;
  v_exp_ms TEXT;
BEGIN
  SELECT * INTO v_account FROM public.student_accounts
    WHERE lower(email) = v_mail ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_req FROM public.registration_requests
    WHERE lower(email) = v_mail ORDER BY created_at DESC LIMIT 1;
  -- إن لم يوجد طلب بالبريد لكن الحساب مربوط بطلب معتمد (بريد تغيّر من المدرس)
  IF v_req.id IS NULL AND v_account.student_id IS NOT NULL THEN
    SELECT * INTO v_req FROM public.registration_requests
      WHERE linked_student_id = v_account.student_id AND status = 'approved'
      ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_account.id IS NULL AND v_req.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_account', 'error', 'لا يوجد حساب بهذا البريد — سجِّل أولاً من صفحة التسجيل');
  END IF;

  v_sha := encode(digest(p_password, 'sha256'), 'hex');
  IF v_req.password_hash IS NOT NULL AND v_req.password_hash <> '' THEN
    IF v_req.password_hash = v_sha OR (p_legacy_fnv IS NOT NULL AND v_req.password_hash = p_legacy_fnv) THEN v_ok := true; END IF;
  END IF;
  IF NOT v_ok AND v_account.password_hash IS NOT NULL AND v_account.password_hash <> '' THEN
    IF v_account.password_hash = v_sha OR (p_legacy_fnv IS NOT NULL AND v_account.password_hash = p_legacy_fnv) THEN v_ok := true; END IF;
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'code', 'wrong_password', 'error', 'كلمة المرور غير صحيحة');
  END IF;

  IF v_req.id IS NOT NULL AND v_req.status = 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pending', 'status', 'pending', 'error', 'طلبك لا يزال قيد المراجعة — انتظر موافقة المعلم ثم حاول مجدداً');
  END IF;
  IF v_req.id IS NOT NULL AND v_req.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rejected', 'status', 'rejected', 'error',
      'تم رفض طلب التسجيل' || CASE WHEN COALESCE(v_req.review_note, '') <> '' THEN ': ' || v_req.review_note ELSE '' END);
  END IF;
  IF v_account.id IS NOT NULL AND v_account.active = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'blocked', 'status', 'blocked', 'error', 'تم إيقاف حسابك من تسجيل الدخول — يرجى التواصل مع المعلم');
  END IF;

  v_student_id := COALESCE(v_account.student_id, v_req.linked_student_id);
  SELECT * INTO v_student FROM public.students WHERE id = v_student_id;
  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_linked', 'error', 'حسابك غير مربوط ببيانات طالب — يرجى التواصل مع المعلم');
  END IF;
  IF v_student.status = 'inactive' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'blocked', 'status', 'blocked', 'error', 'حسابك موقوف حالياً — يرجى التواصل مع المعلم');
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_exp_ms := to_char(now() + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  INSERT INTO public.student_sessions (student_id, token_hash, created_at, expires_at)
    VALUES (v_student_id, encode(digest(v_token, 'sha256'), 'hex'),
            to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), v_exp_ms)
  ON CONFLICT (student_id) DO UPDATE
    SET token_hash = EXCLUDED.token_hash,
        created_at = EXCLUDED.created_at,
        expires_at = EXCLUDED.expires_at;

  RETURN jsonb_build_object(
    'ok', true, 'code', 'ok', 'studentId', v_student_id,
    'name', v_student.name, 'email', v_mail, 'token', v_token,
    'exp', floor(extract(epoch from now()) * 1000)::bigint + 2592000000::bigint
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.student_logout(p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_hash TEXT;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN RETURN jsonb_build_object('ok', true); END IF;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');
  DELETE FROM public.student_sessions WHERE token_hash = v_hash;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- قراءة بيانات الطالب المسجَّل فقط عبر التوكين — بلا أي قائمة من بقية الطلاب
CREATE OR REPLACE FUNCTION public.get_student_portal_data(p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT := encode(digest(p_token, 'sha256'), 'hex');
  v_student_id TEXT;
  v_student public.students%ROWTYPE;
  v_manual jsonb; v_dues jsonb; v_payments jsonb; v_att jsonb; v_hist jsonb; v_transfers jsonb;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'جلسة غير صالحة — سجّل الدخول من جديد');
  END IF;
  SELECT student_id INTO v_student_id FROM public.student_sessions
    WHERE token_hash = v_hash
      AND expires_at > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'جلسة غير صالحة أو منتهية — سجّل الدخول من جديد');
  END IF;

  SELECT * INTO v_student FROM public.students WHERE id = v_student_id;
  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'الطالب غير موجود');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY created_at), '[]'::jsonb) INTO v_manual
    FROM public.manual_grades m WHERE m.student_id = v_student_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY year, month), '[]'::jsonb) INTO v_dues
    FROM public.dues d WHERE d.student_id = v_student_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY payment_date), '[]'::jsonb) INTO v_payments
    FROM public.payments p WHERE p.student_id = v_student_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY created_at), '[]'::jsonb) INTO v_att
    FROM public.attendance a WHERE a.student_id = v_student_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY created_at), '[]'::jsonb) INTO v_hist
    FROM public.student_history h WHERE h.student_id = v_student_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY created_at), '[]'::jsonb) INTO v_transfers
    FROM public.group_transfer_requests t WHERE t.student_id = v_student_id;

  RETURN jsonb_build_object(
    'ok', true, 'code', 'ok', 'student', to_jsonb(v_student),
    'manualGrades', COALESCE(v_manual, '[]'::jsonb),
    'dues', COALESCE(v_dues, '[]'::jsonb),
    'payments', COALESCE(v_payments, '[]'::jsonb),
    'attendance', COALESCE(v_att, '[]'::jsonb),
    'history', COALESCE(v_hist, '[]'::jsonb),
    'transferRequests', COALESCE(v_transfers, '[]'::jsonb)
  );
END;
$$;

-- استفسارات الطالب المسجَّل فقط (مثل قراءة بياناته)
CREATE OR REPLACE FUNCTION public.get_student_inquiries(p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT := encode(digest(p_token, 'sha256'), 'hex');
  v_student_id TEXT;
  v_rows jsonb;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'جلسة غير صالحة');
  END IF;
  SELECT student_id INTO v_student_id FROM public.student_sessions
    WHERE token_hash = v_hash
      AND expires_at > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'جلسة غير صالحة أو منتهية');
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY created_at), '[]'::jsonb) INTO v_rows
    FROM public.inquiries i WHERE i.student_id = v_student_id;
  RETURN jsonb_build_object('ok', true, 'code', 'ok', 'inquiries', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

-- صلاحيات الدوال: anon ينفّذها فقط (لا يقرأ مصدرها/بياناتها خاماً)
REVOKE ALL ON FUNCTION public.student_login(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_logout(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_portal_data(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_inquiries(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_login(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_logout(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_portal_data(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_inquiries(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.student_register(
  p_name TEXT,
  p_phone TEXT,
  p_guardian_phone TEXT,
  p_email TEXT,
  p_password_hash TEXT,
  p_grade_id TEXT,
  p_group_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mail TEXT := lower(trim(p_email));
  v_reg_open TEXT;
  v_auto TEXT;
  v_id TEXT;
  v_now TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  -- هل التسجيل مفتوح؟ (افتراضياً مفتوح إن لم يكن هناك سطر)
  SELECT value INTO v_reg_open FROM public.app_settings WHERE key = 'registrationOpen';
  IF COALESCE(v_reg_open, '1') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'closed', 'error', 'التسجيل مغلق حالياً — يرجى التواصل مع المعلم');
  END IF;

  -- هل «التفعيل المباشر» مفعّل؟ (افتراضياً مغلق — ينتظر موافقة المعلم)
  SELECT value INTO v_auto FROM public.app_settings WHERE key = 'autoApproveRegistration';
  IF COALESCE(v_auto, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_enabled', 'error', 'التفعيل المباشر غير مفعّل — يرسل الطلب إلى المعلم للموافقة');
  END IF;

  -- فريدية البريد
  IF EXISTS (SELECT 1 FROM public.students WHERE lower(COALESCE(email, '')) = v_mail)
     OR EXISTS (SELECT 1 FROM public.registration_requests WHERE lower(COALESCE(email, '')) = v_mail) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'email_taken', 'error', 'هذا البريد مسجَّل بالفعل — يمكنك تسجيل الدخول مباشرة');
  END IF;

  -- الصف يجب أن يكون موجوداً
  IF NOT EXISTS (SELECT 1 FROM public.grades WHERE id = p_grade_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_input', 'error', 'الصف المختار غير موجود');
  END IF;

  v_id := 'st-' || encode(gen_random_bytes(10), 'hex');

  INSERT INTO public.students (id, name, phone, email, grade_id, group_id, status, inquiry_blocked, created_at, updated_at)
    VALUES (v_id, trim(p_name), trim(p_phone), v_mail, p_grade_id, p_group_id, 'active', false, v_now, v_now);

  INSERT INTO public.registration_requests
    (id, name, phone, guardian_phone, email, password_hash, grade_id, group_id, status, reviewed_at, linked_student_id, created_at)
    VALUES
    ('reg-' || encode(gen_random_bytes(8), 'hex'), trim(p_name), trim(p_phone), trim(COALESCE(p_guardian_phone, '')),
     v_mail, p_password_hash, p_grade_id, p_group_id, 'approved', v_now, v_id, v_now);

  INSERT INTO public.student_accounts (id, email, student_id, active, password_hash, created_at)
    VALUES (v_mail, v_mail, v_id, true, p_password_hash, v_now);

  INSERT INTO public.student_history (id, student_id, type, title, detail, date, created_at)
    VALUES ('hist-' || encode(gen_random_bytes(8), 'hex'), v_id, 'account', 'تسجيل مباشر من بوابة الطالب',
            'أُنشئ الحساب تلقائياً (تفعيل مباشر) وأصبح الدخول متاحاً', v_now, v_now);

  RETURN jsonb_build_object('ok', true, 'code', 'ok', 'studentId', v_id, 'name', trim(p_name));
END;
$$;

-- ----------------------------------------------------------------------------
-- (2) تغيير الطالب لكلمة مروره من داخل بوابته (قسم الطلبات):
--     يتحقق من الجلسة (التوكين) ومن كلمة المرور القديمة ثم يحدّث بصمة
--     الحساب والطلب المعتمد معاً — كل ذلك داخل الخادم، بلا قراءة خام.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_student_password(
  p_token TEXT,
  p_old_password_hash TEXT,
  p_old_legacy_fnv TEXT,
  p_new_password_hash TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT := encode(digest(p_token, 'sha256'), 'hex');
  v_student_id TEXT;
  v_acc public.student_accounts%ROWTYPE;
  v_req public.registration_requests%ROWTYPE;
  v_ok BOOLEAN := false;
BEGIN
  IF p_token IS NULL OR p_token = '' OR p_new_password_hash IS NULL OR p_new_password_hash = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_input', 'error', 'بيانات غير صالحة — أعد المحاولة');
  END IF;

  SELECT student_id INTO v_student_id FROM public.student_sessions
    WHERE token_hash = v_hash
      AND expires_at > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'جلسة غير صالحة أو منتهية — سجّل الدخول من جديد');
  END IF;

  SELECT * INTO v_acc FROM public.student_accounts WHERE student_id = v_student_id ORDER BY created_at DESC LIMIT 1;
  IF v_acc.id IS NOT NULL AND COALESCE(v_acc.password_hash, '') <> '' THEN
    IF v_acc.password_hash = p_old_password_hash
       OR (p_old_legacy_fnv IS NOT NULL AND v_acc.password_hash = p_old_legacy_fnv) THEN
      v_ok := true;
    END IF;
  END IF;

  IF NOT v_ok THEN
    SELECT * INTO v_req FROM public.registration_requests
      WHERE linked_student_id = v_student_id AND status = 'approved'
      ORDER BY created_at DESC LIMIT 1;
    IF v_req.id IS NOT NULL AND COALESCE(v_req.password_hash, '') <> '' THEN
      IF v_req.password_hash = p_old_password_hash
         OR (p_old_legacy_fnv IS NOT NULL AND v_req.password_hash = p_old_legacy_fnv) THEN
        v_ok := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'code', 'wrong_old', 'error', 'كلمة المرور القديمة غير صحيحة');
  END IF;

  UPDATE public.student_accounts SET password_hash = p_new_password_hash WHERE student_id = v_student_id;
  UPDATE public.registration_requests SET password_hash = p_new_password_hash
    WHERE linked_student_id = v_student_id AND status = 'approved';

  RETURN jsonb_build_object('ok', true, 'code', 'ok');
END;
$$;

-- الصلاحيات: anon/authenticated يستطيعان الاستدعاء فقط — لا قراءة خام
REVOKE ALL ON FUNCTION public.student_register(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_student_password(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_register(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_student_password(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
-- ----------------------------------------------------------------------------
-- (4) الفحص الشامل — يطبع تقريراً في سجل الرسائل (Messages) يعرض مشاكل إن وُجدت
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  ok BOOLEAN;
  issues TEXT[] := '{}';
  required_tables TEXT[] := ARRAY[
    'grades','groups','students','dues','payments','exams','sessions','attendance',
    'announcements','honorees','shared_files','important_links','year_archives',
    'manual_grades','registration_requests','group_transfer_requests','student_history',
    'student_accounts','inquiries','student_sessions'
  ];
  required_functions TEXT[] := ARRAY[
    'student_login(text,text,text)','student_logout(text)',
    'get_student_portal_data(text)','get_student_inquiries(text)',
    'get_public_online_exams()','start_online_exam_session(text,text,text,text,text,text,text,text)',
    'get_online_exam_result(text,text)'
  ];
  portal_tables TEXT[] := ARRAY[
    'manual_grades','registration_requests','group_transfer_requests',
    'student_history','student_accounts','inquiries','student_sessions'
  ];
  t TEXT;
  fn TEXT;
BEGIN
  -- (أ) وجود الجداول
  FOREACH t IN ARRAY required_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      issues := issues || ('جدول مفقود: ' || t);
    END IF;
  END LOOP;

  -- (ب) تفعيل RLS على جداول البوابة الحسّاسة
  FOREACH t IN ARRAY portal_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      SELECT relrowsecurity INTO ok FROM pg_class WHERE oid = to_regclass('public.' || t);
      IF ok IS DISTINCT FROM true THEN
        issues := issues || ('RLS غير مفعّل: ' || t);
      END IF;
    END IF;
  END LOOP;

  -- (ج) منع القراءة الخام من anon
  FOREACH t IN ARRAY portal_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND has_table_privilege('anon', 'public.' || t, 'SELECT') THEN
      issues := issues || ('anon يملك SELECT على جدول حسّاس: ' || t);
    END IF;
  END LOOP;

  -- (د) وجود الدوال وامتلاك anon حق التنفيذ
  FOREACH fn IN ARRAY required_functions LOOP
    IF to_regprocedure('public.' || fn) IS NULL THEN
      issues := issues || ('دالة مفقودة: ' || fn);
    ELSE
      -- هل anon يستطيع تنفيذها (إن كانت من دوال البوابة الآمنة)؟
      IF fn LIKE 'student_login%' OR fn LIKE 'student_logout%' OR fn LIKE 'get_student_portal_data%'
         OR fn LIKE 'get_student_inquiries%' THEN
        IF NOT has_function_privilege('anon', 'public.' || fn, 'EXECUTE') THEN
          issues := issues || ('anon لا يملك تنفيذ: ' || fn);
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF array_length(issues, 1) IS NULL THEN
    RAISE NOTICE '✅ كل الفحوصات سليمة: الجداول موجودة، RLS مفعّل، anon بلا قراءة خام، والدوال متاحة.';
  ELSE
    RAISE NOTICE '⚠️ اكتُشفت % مشكلة/مشاكل:', array_length(issues, 1);
    FOREACH t IN ARRAY issues LOOP
      RAISE NOTICE '   - %', t;
    END LOOP;
    RAISE NOTICE '❌ أصلح المشاكل أعلاه ثم أعد تشغيل هذا الملف.';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- (5) عدّ سريع للسجلات الفعلية في كل جدول (للتأكد أن البيانات في السحابة)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  n BIGINT;
  counts TEXT[] := '{}';
  count_tables TEXT[] := ARRAY[
    'grades','students','registration_requests','student_accounts',
    'student_sessions','dues','exam_attempts'
  ];
BEGIN
  FOREACH t IN ARRAY count_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      counts := counts || (t || ' = ' || n);
    END IF;
  END LOOP;
  RAISE NOTICE 'عدد السجلات الفعلية في قاعدة البيانات: %', array_to_string(counts, ', ');
END;
$$;
