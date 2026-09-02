-- ============================================================
-- Migration 010: إصلاح ومواءمة شاملة (لصقة واحدة — آمن للتكرار idempotent)
-- ============================================================
-- الغرض: جعل قاعدة البيانات مطابقة تماماً لما يكتبه التطبيق فعلياً،
-- وإصلاح مشكلة «بريد الطالب لا يتسجل بشكل سليم» وأي جداول/أعمدة/سياسات ناقصة.
--
-- يعالج بالترتيب:
--   1) جداول البوابة الستة إن لم تكن موجودة (008)
--   2) كل الأعمدة الحرجة (008/009) + students.email
--   3) VIEW عدّاد محاولات الاختبار (009)
--   4) توحيد السياسات والصلاحيات: المدرس = authenticated / الزوار والطلاب = anon
-- ============================================================

-- ------------------------------------------------------------
-- 1) جداول البوابة — إنشاء إن لم توجد
-- ------------------------------------------------------------
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

CREATE TABLE IF NOT EXISTS group_transfer_requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  to_group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS student_history (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  date TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS idx_student_history_student ON student_history(student_id);

CREATE TABLE IF NOT EXISTS student_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS idx_student_accounts_email ON student_accounts(email);
CREATE INDEX IF NOT EXISTS idx_student_accounts_student ON student_accounts(student_id);

CREATE TABLE IF NOT EXISTS manual_grades (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  grade_id TEXT,
  group_id TEXT,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  score REAL NOT NULL DEFAULT 0,
  max_score REAL NOT NULL DEFAULT 100,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS idx_manual_grades_student ON manual_grades(student_id);

CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL DEFAULT '',
  grade_id TEXT,
  group_id TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2) الأعمدة الحرجة — كلها IF NOT EXISTS (لا تكرر ولا تفقد بيانات)
-- ------------------------------------------------------------
ALTER TABLE students              ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE students              ADD COLUMN IF NOT EXISTS inquiry_blocked BOOLEAN DEFAULT FALSE;
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS guardian_phone TEXT;
ALTER TABLE student_accounts      ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE exam_attempts         ADD COLUMN IF NOT EXISTS manual_override JSONB;
ALTER TABLE announcements         ADD COLUMN IF NOT EXISTS target_grade_ids JSONB;

-- ------------------------------------------------------------
-- 3) عدّاد محاولات الاختبار (بلا إجابات ولا درجات — للعامة)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.exam_attempt_counts AS
  SELECT exam_id, student_id, count(*)::int AS attempts
  FROM exam_attempts
  WHERE student_id IS NOT NULL
  GROUP BY exam_id, student_id;

-- ------------------------------------------------------------
-- 4) تفعيل RLS على كل جداول التطبيق
-- ------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 5) توحيد السياسات — نموذجان فقط:
--    • authenticated (جهاز المدرس بعد تسجيل الدخول): كل الصلاحيات
--    • anon (جهاز الطالب/الزائر): قراءة + إدراج محدد فقط
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  core_tables TEXT[] := ARRAY[
    'grades','groups','students','dues','payments','exams','sessions','attendance',
    'announcements','honorees','shared_files','important_links','year_archives','app_settings',
    'manual_grades','registration_requests','group_transfer_requests',
    'student_history','student_accounts','inquiries'
  ];
  anon_insert_tables TEXT[] := ARRAY[
    'registration_requests','group_transfer_requests','inquiries','exam_attempts','honorees'
  ];
BEGIN
  -- أ) المدرس: صلاحيات كاملة على كل الجداول
  FOREACH t IN ARRAY core_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "teacher full access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "teacher full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;

  -- ب) الزوار: قراءة كل شيء (الموقع العام وبوابة الطالب)
  FOREACH t IN ARRAY core_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "public read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "public read" ON public.%I FOR SELECT TO anon USING (true)', t);
  END LOOP;

  -- ج) الزوار: إدراج فقط في جداول التقديم (طلبات، استفسارات، محاولات، متفوقين)
  FOREACH t IN ARRAY anon_insert_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "public insert" ON public.%I', t);
    EXECUTE format('CREATE POLICY "public insert" ON public.%I FOR INSERT TO anon WITH CHECK (true)', t);
  END LOOP;
END $$;

-- إزالة أي سياسات قديمة بنفس الوظيفة كي لا تتعارض (بقيت من migrations سابقة)
DROP POLICY IF EXISTS "authenticated full access" ON grades;
DROP POLICY IF EXISTS "authenticated full access" ON groups;
DROP POLICY IF EXISTS "authenticated full access" ON students;
DROP POLICY IF EXISTS "authenticated full access" ON dues;
DROP POLICY IF EXISTS "authenticated full access" ON payments;
DROP POLICY IF EXISTS "authenticated full access" ON exams;
DROP POLICY IF EXISTS "authenticated full access" ON sessions;
DROP POLICY IF EXISTS "authenticated full access" ON attendance;
DROP POLICY IF EXISTS "authenticated full access" ON announcements;
DROP POLICY IF EXISTS "authenticated full access" ON honorees;
DROP POLICY IF EXISTS "authenticated full access" ON shared_files;
DROP POLICY IF EXISTS "authenticated full access" ON important_links;
DROP POLICY IF EXISTS "authenticated full access" ON year_archives;
DROP POLICY IF EXISTS "authenticated full access" ON app_settings;
DROP POLICY IF EXISTS "authenticated full access" ON manual_grades;
DROP POLICY IF EXISTS "authenticated full access" ON registration_requests;
DROP POLICY IF EXISTS "authenticated full access" ON group_transfer_requests;
DROP POLICY IF EXISTS "authenticated full access" ON student_history;
DROP POLICY IF EXISTS "authenticated full access" ON student_accounts;
DROP POLICY IF EXISTS "authenticated full access" ON exam_attempts;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON grades;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON groups;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON students;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON dues;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON payments;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON exams;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON sessions;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON attendance;
DROP POLICY IF EXISTS "public read exams" ON exams;
DROP POLICY IF EXISTS "public read app_settings" ON app_settings;
DROP POLICY IF EXISTS "public read announcements" ON announcements;
DROP POLICY IF EXISTS "public read honorees" ON honorees;
DROP POLICY IF EXISTS "public read shared_files" ON shared_files;
DROP POLICY IF EXISTS "public read important_links" ON important_links;
DROP POLICY IF EXISTS "public read grades" ON grades;
DROP POLICY IF EXISTS "public read groups" ON groups;
DROP POLICY IF EXISTS "public read" ON manual_grades;
DROP POLICY IF EXISTS "public read" ON registration_requests;
DROP POLICY IF EXISTS "public read" ON group_transfer_requests;
DROP POLICY IF EXISTS "public read" ON student_history;
DROP POLICY IF EXISTS "public read" ON student_accounts;
DROP POLICY IF EXISTS "public insert" ON registration_requests;
DROP POLICY IF EXISTS "public insert" ON group_transfer_requests;
DROP POLICY IF EXISTS "anon insert exam_attempts" ON exam_attempts;
DROP POLICY IF EXISTS "anon insert honorees" ON honorees;
DROP POLICY IF EXISTS "authenticated full inquiries" ON inquiries;
DROP POLICY IF EXISTS "anon read inquiries" ON inquiries;
DROP POLICY IF EXISTS "anon insert inquiries" ON inquiries;

-- ------------------------------------------------------------
-- 6) الصلاحيات GRANT — مطابقة للسياسات
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  all_tables TEXT[] := ARRAY[
    'grades','groups','students','dues','payments','exams','sessions','attendance',
    'announcements','honorees','shared_files','important_links','year_archives','app_settings',
    'manual_grades','registration_requests','group_transfer_requests',
    'student_history','student_accounts','inquiries','exam_attempts'
  ];
  anon_insert_tables TEXT[] := ARRAY[
    'registration_requests','group_transfer_requests','inquiries','exam_attempts','honorees'
  ];
BEGIN
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- المدرس: كل شيء
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
  END LOOP;

  -- الزوار: قراءة كل شيء
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', t);
  END LOOP;

  -- الزوار: إضافة فقط في جداول التقديم
  FOREACH t IN ARRAY anon_insert_tables LOOP
    EXECUTE format('GRANT INSERT ON TABLE public.%I TO anon', t);
  END LOOP;

  -- الخدمة
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;

  GRANT SELECT ON public.exam_attempt_counts TO anon, authenticated;
END $$;

-- ------------------------------------------------------------
-- 7) جعل الـ Views تستدعي بصلاحيات المستخدم (إصلاح تنبيه Linter)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.exam_attempt_counts') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.exam_attempt_counts SET (security_invoker = true)';
  END IF;
  IF to_regclass('public.group_schedule_conflicts') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.group_schedule_conflicts SET (security_invoker = true)';
  END IF;
END $$;

-- ============================================================
-- انتهى — شغّل supabase/health_check.sql للتأكد أن كل البنود ✅
-- ============================================================
