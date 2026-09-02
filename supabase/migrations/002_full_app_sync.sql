-- ============================================================
-- 🔄 مزامنة التطبيق الكامل مع Supabase
-- شغّل هذا الملف في Supabase → SQL Editor → New query → Run
-- ============================================================
-- هذا المخطط يحل محل الجداول القديمة (التي لم يكن الكود يستخدمها).
-- جميع المعرفات TEXT لأنها مولّدة من التطبيق نفسه.
-- ============================================================

-- 1) حذف الجداول/العروض القديمة إن وُجدت (كانت غير مستخدمة)
DROP VIEW IF EXISTS student_financial_status;
DROP VIEW IF EXISTS student_attendance_rate;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS sub_questions CASCADE;
DROP TABLE IF EXISTS choices CASCADE;
DROP TABLE IF EXISTS question_parts CASCADE;
DROP TABLE IF EXISTS corrections CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS exams CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS dues CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS grades CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS honorees CASCADE;
DROP TABLE IF EXISTS shared_files CASCADE;
DROP TABLE IF EXISTS important_links CASCADE;
DROP TABLE IF EXISTS year_archives CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;

-- ============================================================
-- 2) الجداول
-- ============================================================

-- الصفوف الدراسية
CREATE TABLE grades (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- المجموعات
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

-- الطلاب
CREATE TABLE students (
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
CREATE INDEX idx_students_grade ON students(grade_id);
CREATE INDEX idx_students_group ON students(group_id);
CREATE INDEX idx_students_status ON students(status);

-- الاستحقاقات
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

-- المدفوعات
CREATE TABLE payments (
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
CREATE INDEX idx_payments_student ON payments(student_id);
CREATE INDEX idx_payments_month_year ON payments(month, year);

-- الاختبارات (الأسئلة كاملة JSONB)
CREATE TABLE exams (
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
CREATE INDEX idx_exams_grade ON exams(grade_id);
CREATE INDEX idx_exams_month ON exams(month);

-- الحصص
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

-- الحضور
CREATE TABLE attendance (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present',
  late_minutes INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_attendance_session ON attendance(session_id);
CREATE INDEX idx_attendance_student ON attendance(student_id);

-- الإعلانات
CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL
);

-- لوحة الشرف
CREATE TABLE honorees (
  id TEXT PRIMARY KEY,
  student_id TEXT,
  student_name TEXT NOT NULL,
  group_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_honorees_group ON honorees(group_id);
CREATE INDEX idx_honorees_month_year ON honorees(month, year);

-- ملفات للتحميل
CREATE TABLE shared_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL DEFAULT 'upload',
  data_url TEXT,
  url TEXT,
  added_at TEXT NOT NULL
);

-- روابط مهمة
CREATE TABLE important_links (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  added_at TEXT NOT NULL
);

-- أرشيف السنوات المغلقة
CREATE TABLE year_archives (
  id TEXT PRIMARY KEY,
  academic_year TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}',
  data JSONB NOT NULL DEFAULT '{}'
);

-- إعدادات التطبيق (السنة الدراسية الحالية...)
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============================================================
-- 3) Row Level Security
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

-- وصول كامل للمستخدم المصادق عليه (المدير)
CREATE POLICY "authenticated full access" ON grades FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON groups FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON students FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON dues FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON exams FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON announcements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON honorees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON shared_files FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON important_links FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON year_archives FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access" ON app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- قراءة عامة للصفحة الرئيسية (بدون تسجيل دخول) — للطلاب
CREATE POLICY "public read announcements" ON announcements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read honorees" ON honorees FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read shared_files" ON shared_files FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read important_links" ON important_links FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read grades" ON grades FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read groups" ON groups FOR SELECT TO anon, authenticated USING (true);

-- ============================================================
-- 4) جاهز!
-- ============================================================
