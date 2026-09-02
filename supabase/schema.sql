-- ============================================================
-- 🛡️ المخطط الكامل الآمن للتطبيق — Supabase (النسخة النهائية)
-- ============================================================
-- كيف تشغّله:
--   Supabase Dashboard → SQL Editor → New query
--   → الصق هذا الكود كاملًا → Run
--
-- ✅ آمن 100% عند إعادة التشغيل في أي وقت:
--   • كل جدول: CREATE TABLE IF NOT EXISTS → إن كان موجودًا يُتجاوزه كما هو
--   • كل فهرس: CREATE INDEX IF NOT EXISTS → يُنشأ ما ينقص فقط
--   • كل سياسة أمان: DROP POLICY IF EXISTS + CREATE → تُحدَّث تعريفات
--     السياسة فقط ولا تمسّ البيانات مطلقًا
--   • الملف كله داخل معاملة (BEGIN/COMMIT) واحدة: إن فشلت أي جملة
--     يعود كل شيء كما كان — لا نصف مخطط
--   • لا يوجد DROP TABLE ولا DROP COLUMN ولا TRuncate →
--     بياناتك الحالية (طلاب، مدفوعات، امتحانات...) لن تتأثر أبدًا
--
-- 📦 ما ينشئه (15 جدولًا + الفهارس + كل سياسات RLS):
--   grades, groups, students, dues, payments, exams, sessions,
--   attendance, announcements, honorees, shared_files,
--   important_links, year_archives, app_settings, exam_attempts
-- ============================================================

BEGIN;

-- ============================================================
-- 1) الجداول (إنشاء فقط ما لا يوجد)
-- ============================================================

-- الصفوف الدراسية
CREATE TABLE IF NOT EXISTS grades (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- المجموعات (كل مجموعة تابعة لصف)
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  grade_id TEXT NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days JSONB NOT NULL DEFAULT '[]',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  monthly_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  students_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_groups_grade ON groups(grade_id);

-- الطلاب
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  grade_id TEXT REFERENCES grades(id) ON DELETE SET NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_students_grade ON students(grade_id);
CREATE INDEX IF NOT EXISTS idx_students_group ON students(group_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);

-- الاستحقاقات (مستحقات شهرية لكل طالب)
CREATE TABLE IF NOT EXISTS dues (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dues_student ON dues(student_id);
CREATE INDEX IF NOT EXISTS idx_dues_month_year ON dues(month, year);

-- المدفوعات
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  due_id TEXT,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_date TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_month_year ON payments(month, year);

-- الاختبارات (الأسئلة كاملة كـ JSONB)
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  grade_id TEXT REFERENCES grades(id) ON DELETE SET NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  month INTEGER,
  unit TEXT,
  academic_year TEXT NOT NULL,
  duration INTEGER,
  total_marks INTEGER,
  questions JSONB NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exams_grade ON exams(grade_id);
CREATE INDEX IF NOT EXISTS idx_exams_month ON exams(month);

-- الحصص
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  session_date TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_group ON sessions(group_id);

-- الحضور (كل سجل حضور مرتبط بحصة وطالب)
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present',
  late_minutes INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);

-- الإعلانات
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL
);

-- لوحة الشرف (المتميز هذا الشهر)
CREATE TABLE IF NOT EXISTS honorees (
  id TEXT PRIMARY KEY,
  student_id TEXT,
  student_name TEXT NOT NULL,
  group_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_honorees_group ON honorees(group_id);
CREATE INDEX IF NOT EXISTS idx_honorees_month_year ON honorees(month, year);

-- ملفات للتحميل
CREATE TABLE IF NOT EXISTS shared_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL DEFAULT 'upload',
  data_url TEXT,
  url TEXT,
  added_at TEXT NOT NULL
);

-- روابط مهمة
CREATE TABLE IF NOT EXISTS important_links (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  added_at TEXT NOT NULL
);

-- أرشيف السنوات المغلقة
CREATE TABLE IF NOT EXISTS year_archives (
  id TEXT PRIMARY KEY,
  academic_year TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}',
  data JSONB NOT NULL DEFAULT '{}'
);

-- إعدادات التطبيق (السنة الدراسية الحالية، رقم واتساب التواصل...)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- محاولات الطلاب في الاختبارات الإلكترونية
CREATE TABLE IF NOT EXISTS exam_attempts (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  student_id TEXT,
  student_name TEXT NOT NULL,
  group_id TEXT NOT NULL DEFAULT '',
  grade_id TEXT NOT NULL DEFAULT '',
  answers JSONB NOT NULL DEFAULT '{}',
  score NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_marks NUMERIC(10,2) NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON exam_attempts(exam_id);

-- ============================================================
-- 2) تفعيل Row Level Security على كل الجداول
--    (تفعيل مكرر = آمن، لا يغيّر شيئًا إن كان مفعّلًا)
-- ============================================================
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE honorees ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE important_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3) سياسات الأمان
--    DROP IF EXISTS + CREATE = تُحدَّث التعريفات عند إعادة التشغيل
--    دون أي تأثير على البيانات
-- ============================================================

-- 3.1) وصول كامل (قراءة/كتابة/حذف/تعديل) للمستخدم المصادق فقط (المدير)
DROP POLICY IF EXISTS "authenticated full access" ON grades;
CREATE POLICY "authenticated full access" ON grades FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON groups;
CREATE POLICY "authenticated full access" ON groups FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON students;
CREATE POLICY "authenticated full access" ON students FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON dues;
CREATE POLICY "authenticated full access" ON dues FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON payments;
CREATE POLICY "authenticated full access" ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON exams;
CREATE POLICY "authenticated full access" ON exams FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON sessions;
CREATE POLICY "authenticated full access" ON sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON attendance;
CREATE POLICY "authenticated full access" ON attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON announcements;
CREATE POLICY "authenticated full access" ON announcements FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON honorees;
CREATE POLICY "authenticated full access" ON honorees FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON shared_files;
CREATE POLICY "authenticated full access" ON shared_files FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON important_links;
CREATE POLICY "authenticated full access" ON important_links FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON year_archives;
CREATE POLICY "authenticated full access" ON year_archives FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON app_settings;
CREATE POLICY "authenticated full access" ON app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated full access" ON exam_attempts;
CREATE POLICY "authenticated full access" ON exam_attempts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3.2) قراءة عامة (بدون تسجيل دخول) لجداول الصفحة الرئيسية —
--      حتى يراها الطلاب في أي جهاز
DROP POLICY IF EXISTS "public read announcements" ON announcements;
CREATE POLICY "public read announcements" ON announcements FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public read honorees" ON honorees;
CREATE POLICY "public read honorees" ON honorees FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public read shared_files" ON shared_files;
CREATE POLICY "public read shared_files" ON shared_files FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public read important_links" ON important_links;
CREATE POLICY "public read important_links" ON important_links FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public read grades" ON grades;
CREATE POLICY "public read grades" ON grades FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public read groups" ON groups;
CREATE POLICY "public read groups" ON groups FOR SELECT TO anon, authenticated USING (true);

-- 3.3) قراءة عامة لإعدادات الموقع (رقم واتساب + السنة الدراسية)
--      لعرضها في فوتر الصفحة العامة
DROP POLICY IF EXISTS "public read app_settings" ON app_settings;
CREATE POLICY "public read app_settings" ON app_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public read exams" ON exams;
CREATE POLICY "public read exams" ON exams FOR SELECT TO anon USING (
  jsonb_typeof(questions) = 'object'
  AND COALESCE(questions->>'allowOnline', 'false') = 'true'
);
DROP POLICY IF EXISTS "anon insert exam_attempts" ON exam_attempts;
CREATE POLICY "anon insert exam_attempts" ON exam_attempts FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "anon insert honorees" ON honorees;
CREATE POLICY "anon insert honorees" ON honorees FOR INSERT TO anon WITH CHECK (true);

GRANT INSERT ON exam_attempts TO anon;
GRANT INSERT ON honorees TO anon;

-- ============================================================
-- 3.4) صلاحيات الجداول (GRANT) — مهم جداً
--      بدون هذه الأوامر قد يظهر خطأ "permission denied for table ..."
--      حتى لو كانت سياسات RLS صحيحة، لأن الصلاحية تُفحص قبل RLS.
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

-- ============================================================
-- 4) اكتمل!
--    لا توجد أي أوامر حذف بيانات في هذا الملف.
--    جاهز لإعادة التشغيل في أي وقت دون أي مخاطرة.
-- ============================================================

COMMIT;
