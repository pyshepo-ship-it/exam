-- ============================================================
-- 016) تأمين بوابة الطالب: قراءة مقيّدة + جلسات آمنة
-- ============================================================
-- المشكلة التي يحلها هذا الترحيل:
--   1) كانت بوابة الطالب تقرأ بيانات الطلاب/الدرجات/المالية عبر مفتاح anon
--      وتُفلتر في المتصفح، فتُرسَل بيانات كل الطلاب خلف الكواليس (تسريب PII)،
--      بينما الجداول الحسّاسة (students/dues/payments/attendance) بلا سياسة
--      قراءة لـ anon أصلاً، فكانت البوابة معطّلة ("غير محدد").
--   2) جلسة الطالب كانت مجرد كوكي base64 بلا توقيع، فيستطيع أي أحد انتحاله.
-- الحل:
--   • جلسة آمنة: student_login يتحقق من كلمة المرور (بصمة SHA-256 في قاعدة
--     البيانات) ويصدر توكين عشوائي يُخزَّن بصمته في student_sessions.
--   • القراءة الوحيدة لبيانات الطالب تمر عبر get_student_portal_data / 
--     get_student_inquiries (SECURITY DEFINER) بالتحقق من التوكين، فتعيد
--     بيانات الطالب المسجَّل فقط.
--   • لا قراءة خام (SELECT) لـ anon على جداول الطلاب/الدرجات/المالية/السجل.
--   • جداول الطلبات (تسجيل/نقل/استفسار/شرف) تبقى قابلة للإدراج للزوار.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1) جلسات الطلاب الآمنة (لا وصول لـ anon/authenticated مباشرة)
--    يكتب فيها فقط student_login / student_logout (SECURITY DEFINER)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_sessions (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_student_sessions_token_hash ON student_sessions(token_hash);
ALTER TABLE student_sessions ENABLE ROW LEVEL SECURITY;
-- لا وصول لأي دور (حتى authenticated)؛ الدوال المالكة فقط تصل إليها،
-- لأن token_hash سرّ جلسة حساس.
REVOKE ALL ON TABLE public.student_sessions FROM anon, authenticated;
-- لا سياسات على student_sessions؛ الدوال المالكة فقط تصل إليها.

-- ------------------------------------------------------------
-- 2) جداول بوابة الطالب (من 008/009) — تُنشأ إن لم تكن موجودة
-- ------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_student_accounts_email ON student_accounts(email);
CREATE INDEX IF NOT EXISTS idx_student_accounts_student ON student_accounts(student_id);
-- أمان على قواعد قديمة: العمود قد يكون ناقصاً من ترحيلات سابقة
ALTER TABLE student_accounts ADD COLUMN IF NOT EXISTS password_hash TEXT;

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

-- ------------------------------------------------------------
-- 3) RLS على جداول البوابة: وصول كامل للمعلم، ولا قراءة لـ anon.
--    الزائر يرسل طلباته فقط (إدراج) — أما القراءة فتمرّ عبر الدوال الآمنة.
-- ------------------------------------------------------------
ALTER TABLE manual_grades            ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_transfer_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries                ENABLE ROW LEVEL SECURITY;

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

-- إزالة أي قراءة عامة قديمة (من 008/009) ثم إبقاء الإدراج للطلبات فقط
DROP POLICY IF EXISTS "public read" ON manual_grades;
DROP POLICY IF EXISTS "public read" ON registration_requests;
DROP POLICY IF EXISTS "public insert" ON registration_requests;
DROP POLICY IF EXISTS "public read" ON group_transfer_requests;
DROP POLICY IF EXISTS "public insert" ON group_transfer_requests;
DROP POLICY IF EXISTS "public read" ON student_history;
DROP POLICY IF EXISTS "public read" ON student_accounts;
DROP POLICY IF EXISTS "public read" ON inquiries;
DROP POLICY IF EXISTS "public insert" ON inquiries;

CREATE POLICY "anon insert registration_requests" ON registration_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon insert group_transfer_requests" ON group_transfer_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon insert inquiries" ON inquiries FOR INSERT TO anon WITH CHECK (true);

-- لا قراءة REST لـ anon على بيانات الطلاب/الدرجات/السجل/الاستفسارات/الحسابات
REVOKE SELECT ON TABLE public.manual_grades FROM anon;
REVOKE SELECT ON TABLE public.student_history FROM anon;
REVOKE SELECT ON TABLE public.group_transfer_requests FROM anon;
REVOKE SELECT ON TABLE public.inquiries FROM anon;
REVOKE SELECT ON TABLE public.student_accounts FROM anon;
-- registration_requests يبقى مقروءاً لـ anon لمساعدة مسار التسجيل/الحالة في الواجهة؛
-- كلمات المرور بصمات SHA-256 ولا يكفي قراءتها لانتحال الدخول (تتطلب كلمة المرور نصاً).

-- ------------------------------------------------------------
-- 4) دوال الدخول الآمنة
-- ------------------------------------------------------------
-- التحقق من البريد/الحالة/كلمة المرور (بصمة SHA-256 في قاعدة البيانات
-- أو بصمة FNV القديمة المرسلة من العميل للتوافق الرجعي) ثم إصدار توكين جلسة.
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
  IF v_req.id IS NULL AND v_account.student_id IS NOT NULL THEN
    SELECT * INTO v_req FROM public.registration_requests
      WHERE linked_student_id = v_account.student_id AND status = 'approved'
      ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_account.id IS NULL AND v_req.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'لا يوجد حساب بهذا البريد — سجِّل أولاً من صفحة التسجيل');
  END IF;

  v_sha := encode(digest(p_password, 'sha256'), 'hex');
  IF v_req.password_hash IS NOT NULL AND v_req.password_hash <> '' THEN
    IF v_req.password_hash = v_sha OR (p_legacy_fnv IS NOT NULL AND v_req.password_hash = p_legacy_fnv) THEN v_ok := true; END IF;
  END IF;
  IF NOT v_ok AND v_account.password_hash IS NOT NULL AND v_account.password_hash <> '' THEN
    IF v_account.password_hash = v_sha OR (p_legacy_fnv IS NOT NULL AND v_account.password_hash = p_legacy_fnv) THEN v_ok := true; END IF;
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'كلمة المرور غير صحيحة');
  END IF;

  IF v_req.id IS NOT NULL AND v_req.status = 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'pending', 'error', 'طلبك لا يزال قيد المراجعة — انتظر موافقة المعلم ثم حاول مجدداً');
  END IF;
  IF v_req.id IS NOT NULL AND v_req.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'rejected', 'error',
      'تم رفض طلب التسجيل' || CASE WHEN COALESCE(v_req.review_note, '') <> '' THEN ': ' || v_req.review_note ELSE '' END);
  END IF;
  IF v_account.id IS NOT NULL AND v_account.active = false THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'error', 'تم إيقاف حسابك من تسجيل الدخول — يرجى التواصل مع المعلم');
  END IF;

  v_student_id := COALESCE(v_account.student_id, v_req.linked_student_id);
  SELECT * INTO v_student FROM public.students WHERE id = v_student_id;
  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'حسابك غير مربوط ببيانات طالب — يرجى التواصل مع المعلم');
  END IF;
  IF v_student.status = 'inactive' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'blocked', 'error', 'حسابك موقوف حالياً — يرجى التواصل مع المعلم');
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
    'ok', true,
    'studentId', v_student_id,
    'name', v_student.name,
    'email', v_mail,
    'token', v_token,
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

-- ------------------------------------------------------------
-- 5) قراءة بيانات الطالب (SECURITY DEFINER) — تعيد بيانات الطالب المسجَّل
--    فقط، بلا أي قائمة أخرى من بقية الطلاب.
-- ------------------------------------------------------------
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
  SELECT student_id INTO v_student_id FROM public.student_sessions
    WHERE token_hash = v_hash
      AND expires_at > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'جلسة غير صالحة أو منتهية — سجّل الدخول من جديد');
  END IF;

  SELECT * INTO v_student FROM public.students WHERE id = v_student_id;
  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'الطالب غير موجود');
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
    'ok', true,
    'student', to_jsonb(v_student),
    'manualGrades', COALESCE(v_manual, '[]'::jsonb),
    'dues', COALESCE(v_dues, '[]'::jsonb),
    'payments', COALESCE(v_payments, '[]'::jsonb),
    'attendance', COALESCE(v_att, '[]'::jsonb),
    'history', COALESCE(v_hist, '[]'::jsonb),
    'transferRequests', COALESCE(v_transfers, '[]'::jsonb)
  );
END;
$$;

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
  SELECT student_id INTO v_student_id FROM public.student_sessions
    WHERE token_hash = v_hash
      AND expires_at > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'جلسة غير صالحة أو منتهية');
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY created_at), '[]'::jsonb) INTO v_rows
    FROM public.inquiries i WHERE i.student_id = v_student_id;
  RETURN jsonb_build_object('ok', true, 'inquiries', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

-- ------------------------------------------------------------
-- 6) الصلاحيات
-- ------------------------------------------------------------
GRANT ALL PRIVILEGES ON TABLE public.manual_grades TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.registration_requests TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.group_transfer_requests TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.student_history TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.student_accounts TO authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.inquiries TO authenticated, service_role;
GRANT INSERT ON TABLE public.registration_requests TO anon;
GRANT INSERT ON TABLE public.group_transfer_requests TO anon;
GRANT INSERT ON TABLE public.inquiries TO anon;

REVOKE ALL ON FUNCTION public.student_login(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_logout(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_portal_data(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_inquiries(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_login(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_logout(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_portal_data(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_inquiries(TEXT) TO anon, authenticated;

COMMIT;
