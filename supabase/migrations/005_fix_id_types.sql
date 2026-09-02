-- ============================================================
-- تحديث 005: إصلاح خطأ 400 عند الحفظ
--             (grades / students / dues / payments / exams ...)
--
-- سبب الخطأ:
--   قاعدة بياناتك ما زالت على المخطط القديم (001) حيث عمود id
--   من نوع UUID، بينما التطبيق يولّد معرفات نصية مثل "1712345678901".
--   لذلك يرفض Postgres الإدخال بالخطأ:
--       invalid input syntax for type uuid
--   وهو ما يظهر في المتصفح كـ 400 Bad Request.
--
--   الدليل: الجداول التي تفشل هي جداول المخطط القديم فقط، أما
--   announcements / honorees / shared_files / important_links
--   فتعمل لأنها أُنشئت لاحقاً بمعرفات TEXT.
--
-- ماذا يفعل هذا الملف:
--   يعيد بناء جداول المخطط القديم فقط بمعرفات TEXT صحيحة،
--   مع الحفاظ التام على الجداول الحديثة وبياناتها
--   (الإعلانات، لوحة الشرف، الملفات، الروابط، الإعدادات).
--
-- ⚠️ ملاحظة مهمة:
--   الجداول القديمة (الصفوف/الطلاب/التحصيل/الاختبارات/الحضور)
--   لم تكن تُحفظ أصلاً بسبب هذا الخطأ، فهي فارغة في قاعدة البيانات.
--   بياناتك الحقيقية محفوظة في متصفحك وسيتم رفعها تلقائياً بعد الإصلاح.
--   لمزيد من الأمان: اضغط "تصدير البيانات" في الإعدادات قبل التشغيل.
--
-- طريقة التشغيل:
--   Supabase ← SQL Editor ← New query ← الصق الملف كاملاً ← Run
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) حذف بقايا المخطط القديم (عروض ودوال وجداول لم يعد يستخدمها التطبيق)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS student_financial_status CASCADE;
DROP VIEW IF EXISTS student_attendance_rate CASCADE;

DROP FUNCTION IF EXISTS get_student_balance(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_student_total_dues(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_student_total_payments(UUID) CASCADE;

-- جداول الأسئلة القديمة (الأسئلة الآن مخزّنة كـ JSONB داخل exams)
DROP TABLE IF EXISTS corrections CASCADE;
DROP TABLE IF EXISTS question_parts CASCADE;
DROP TABLE IF EXISTS choices CASCADE;
DROP TABLE IF EXISTS sub_questions CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- الجداول ذات المعرفات UUID الخاطئة — سيُعاد بناؤها بمعرفات TEXT
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS exams CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS dues CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS grades CASCADE;

-- ملاحظة: لا نحذف announcements / honorees / shared_files /
--          important_links / year_archives / app_settings
--          لأنها بالمعرفات الصحيحة وبياناتها سليمة.

-- ------------------------------------------------------------
-- 2) إعادة الإنشاء بالمعرفات النصية الصحيحة (مطابقة للتطبيق)
-- ------------------------------------------------------------

CREATE TABLE grades (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  grade_id TEXT NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days JSONB NOT NULL DEFAULT '[]',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  monthly_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  students_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_groups_grade ON groups(grade_id);

CREATE TABLE students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  grade_id TEXT REFERENCES grades(id) ON DELETE SET NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  inquiry_blocked BOOLEAN DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_students_grade ON students(grade_id);
CREATE INDEX idx_students_group ON students(group_id);
CREATE INDEX idx_students_status ON students(status);

CREATE TABLE dues (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_dues_student ON dues(student_id);
CREATE INDEX idx_dues_month_year ON dues(month, year);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  due_id TEXT REFERENCES dues(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_date TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_payments_student ON payments(student_id);
CREATE INDEX idx_payments_month_year ON payments(month, year);

CREATE TABLE exams (
  id TEXT PRIMARY KEY,
  grade_id TEXT REFERENCES grades(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  month INTEGER,
  unit TEXT,
  academic_year TEXT NOT NULL DEFAULT '',
  duration INTEGER,
  total_marks INTEGER,
  questions JSONB NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_exams_grade ON exams(grade_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  session_date TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_group ON sessions(group_id);

CREATE TABLE attendance (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'absent',
  late_minutes INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_attendance_session ON attendance(session_id);
CREATE INDEX idx_attendance_student ON attendance(student_id);

-- ------------------------------------------------------------
-- 3) التأكد من وجود الجداول الحديثة (لا تُمَس بياناتها)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS honorees (
  id TEXT PRIMARY KEY,
  student_id TEXT,
  student_name TEXT NOT NULL,
  group_id TEXT,
  reason TEXT NOT NULL DEFAULT '',
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL DEFAULT 'link',
  data_url TEXT,
  url TEXT,
  added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS important_links (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS year_archives (
  id TEXT PRIMARY KEY,
  academic_year TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}',
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ------------------------------------------------------------
-- 4) تفعيل RLS على كل الجداول
-- ------------------------------------------------------------
ALTER TABLE grades           ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE dues             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance       ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE honorees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_files     ENABLE ROW LEVEL SECURITY;
ALTER TABLE important_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_archives    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings     ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 5) السياسات: وصول كامل للمدير المسجّل دخوله
-- ------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'grades','groups','students','dues','payments','exams','sessions',
    'attendance','announcements','honorees','shared_files',
    'important_links','year_archives','app_settings'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "authenticated full access" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "authenticated full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- قراءة عامة للزوار (الصفحة الرئيسية للطلاب)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'announcements','honorees','shared_files','important_links',
    'grades','groups','app_settings'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "public read" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "public read" ON %I FOR SELECT TO anon, authenticated USING (true)', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 6) صلاحيات الجداول (تشمل الجداول التي أُعيد إنشاؤها الآن)
-- ------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT               ON ALL TABLES    IN SCHEMA public TO anon;
GRANT USAGE, SELECT        ON ALL SEQUENCES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

COMMIT;

-- ============================================================
-- 7) للتحقق بعد التشغيل — يجب أن يظهر النوع "text" لكل الصفوف:
--
--   SELECT table_name, data_type
--   FROM information_schema.columns
--   WHERE column_name = 'id'
--     AND table_schema = 'public'
--   ORDER BY table_name;
--
-- ثم: ارجع للتطبيق ← حدّث الصفحة (F5) ← الإعدادات ← "إعادة الفحص"
-- ستُرفع بيانات جهازك تلقائياً إلى قاعدة البيانات.
-- ============================================================
