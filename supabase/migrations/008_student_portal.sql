-- ============================================================
-- 008: بوابة الطلاب — التسجيل والتقارير والدرجات اليدوية
-- ============================================================
-- كيفية التشغيل (مطلوب مرة واحدة لتشغيل بوابة الطلاب على Supabase):
--   Supabase Dashboard → SQL Editor → New query
--   → الصق هذا الكود كاملاً → Run
--
-- ✅ آمن 100% عند إعادة التشغيل: IF NOT EXISTS / DROP+CREATE POLICY
--    ولا يحذف ولا يعدّل أي بيانات قائمة.
--
-- ما ينشئه:
--   manual_grades            : الدرجات اليدوية التي يسجلها المعلم
--   registration_requests    : طلبات التسجيل من بوابة الطالب
--   group_transfer_requests  : طلبات الانضمام لمجموعة أخرى
--   student_history          : سجل نشاط الطالب (نقل/تكريم/حساب...)
--   student_accounts         : حسابات البوابة (بريد ↔ طالب + تفعيل)
--   + عمود email للطلاب و days للمكرمين في لوحة الشرف
--
-- ملاحظات أمنية:
--  - الطالب يتفاعل بدون تسجيل دخول (مثل بقية الموقع العام):
--      * INSERT على طلبات التسجيل/النقل (لإرسال طلبه فقط)
--      * SELECT للقراءة (سياسة القراءة العامة المتبعة في المشروع)
--  - كلمة المرور لا تُخزَّن أبداً — تُخزَّن بصمة SHA-256 فقط.
--  - موافقة/رفض الطلبات يتم من لوحة المعلم (authenticated) فقط.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) أعمدة جديدة على جداول قائمة
-- ------------------------------------------------------------
ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE honorees ADD COLUMN IF NOT EXISTS days INTEGER;

-- ------------------------------------------------------------
-- 2) الجداول الجديدة
-- ------------------------------------------------------------

-- الدرجات اليدوية
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

-- طلبات التسجيل من بوابة الطالب
CREATE TABLE IF NOT EXISTS registration_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
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

-- طلبات الانضمام لمجموعة أخرى
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

-- سجل نشاط الطالب
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

-- حسابات بوابة الطلاب
CREATE TABLE IF NOT EXISTS student_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS idx_student_accounts_student ON student_accounts(student_id);

-- ------------------------------------------------------------
-- 3) RLS والصلاحيات (نفس نمط المشروع: قراءة عامة + كتابة للمصادقين)
--    + إضافة INSERT للزوار على جداول الطلبات فقط (الطالب يرسل طلبه
--      بدون تسجيل دخول — مثل بقية الموقع العام)
-- ------------------------------------------------------------
ALTER TABLE manual_grades            ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_transfer_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_accounts         ENABLE ROW LEVEL SECURITY;

-- المصادقون (المعلم): وصول كامل
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

-- الزوار (الطلاب): قراءة عامة + إرسال طلباتهم فقط
DROP POLICY IF EXISTS "public read" ON manual_grades;
CREATE POLICY "public read" ON manual_grades FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public read" ON registration_requests;
CREATE POLICY "public read" ON registration_requests FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public insert" ON registration_requests;
CREATE POLICY "public insert" ON registration_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "public read" ON group_transfer_requests;
CREATE POLICY "public read" ON group_transfer_requests FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public insert" ON group_transfer_requests;
CREATE POLICY "public insert" ON group_transfer_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "public read" ON student_history;
CREATE POLICY "public read" ON student_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public read" ON student_accounts;
CREATE POLICY "public read" ON student_accounts FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON TABLE manual_grades TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE manual_grades TO authenticated, service_role;
GRANT SELECT, INSERT ON TABLE registration_requests TO anon;
GRANT ALL PRIVILEGES ON TABLE registration_requests TO authenticated, service_role;
GRANT SELECT, INSERT ON TABLE group_transfer_requests TO anon;
GRANT ALL PRIVILEGES ON TABLE group_transfer_requests TO authenticated, service_role;
GRANT SELECT ON TABLE student_history TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE student_history TO authenticated, service_role;
GRANT SELECT ON TABLE student_accounts TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE student_accounts TO authenticated, service_role;

COMMIT;
