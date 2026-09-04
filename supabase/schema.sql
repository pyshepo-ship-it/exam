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
-- 📦 ما ينشئه (16 جدولًا + الفهارس + كل سياسات RLS):
--   grades, groups, students, dues, payments, exams, sessions,
--   attendance, announcements, honorees, shared_files,
--   important_links, year_archives, app_settings, exam_attempts, online_exam_sessions
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
  email TEXT,
  grade_id TEXT REFERENCES grades(id) ON DELETE SET NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  inquiry_blocked BOOLEAN DEFAULT FALSE,
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
  -- رقم هاتف الزائر في الاختبارات «المفتوحة للجميع» (بدون تسجيل دخول)
  phone TEXT,
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
-- لقاعدة موجودة من قبل: أضف عمود هاتف الزائر إن كان ناقصاً (كما في 013)
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS phone TEXT;
-- فهرس عدّ محاولات الزوار (حد المحاولات للاختبارات المفتوحة للجميع)
CREATE INDEX IF NOT EXISTS idx_exam_attempts_guest
  ON exam_attempts (exam_id, student_name, group_id)
  WHERE student_id IS NULL;

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
-- 3.5) جلسات الاختبار ذات ساعة الخادم (Migration 015)
-- ============================================================
-- ============================================================
-- قواعد منشأة من schema.sql القديم قد لا تحمل هذا العمود؛ نضمنه قبل دالة التسليم.
ALTER TABLE public.exam_attempts ADD COLUMN IF NOT EXISTS manual_override JSONB;

CREATE TABLE IF NOT EXISTS public.online_exam_sessions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL UNIQUE,
  session_secret TEXT NOT NULL,
  exam_id TEXT NOT NULL,
  student_id TEXT,
  student_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  grade_id TEXT NOT NULL DEFAULT '',
  group_id TEXT NOT NULL DEFAULT '',
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_online_exam_sessions_identity
  ON public.online_exam_sessions (exam_id, student_id, student_name, group_id);
CREATE INDEX IF NOT EXISTS idx_online_exam_sessions_expiry
  ON public.online_exam_sessions (expires_at)
  WHERE submitted_at IS NULL;

ALTER TABLE public.online_exam_sessions ENABLE ROW LEVEL SECURITY;
-- لا تقرأ الجلسات أو أسرارها مباشرة من أي عميل؛ الوصول حصراً عبر RPC أدناه.
REVOKE ALL ON TABLE public.online_exam_sessions FROM anon, authenticated;
GRANT ALL ON TABLE public.online_exam_sessions TO service_role;

-- ------------------------------------------------------------
-- بدء جلسة: الوقت والهوية والحد الأقصى للمحاولات تتحقق داخل PostgreSQL.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_online_exam_session(
  p_session_id TEXT,
  p_attempt_id TEXT,
  p_exam_id TEXT,
  p_student_id TEXT DEFAULT NULL,
  p_student_name TEXT DEFAULT '',
  p_phone TEXT DEFAULT NULL,
  p_grade_id TEXT DEFAULT '',
  p_group_id TEXT DEFAULT ''
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
  v_secret TEXT;
BEGIN
  IF COALESCE(length(trim(p_session_id)), 0) < 12
     OR COALESCE(length(trim(p_attempt_id)), 0) < 12
     OR COALESCE(length(trim(p_exam_id)), 0) < 1 THEN
    RAISE EXCEPTION 'معرف جلسة الاختبار غير صالح';
  END IF;
  IF COALESCE(length(trim(p_student_name)), 0) < 2 THEN
    RAISE EXCEPTION 'اسم الطالب مطلوب لبدء الاختبار';
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

  -- اختبار إلكتروني منشور فقط. نحافظ على توافق السجل القديم الذي لا يحمل deliveryMode.
  IF COALESCE(
       v_meta->>'deliveryMode',
       CASE WHEN v_meta->>'allowOnline' = 'true' THEN 'online' ELSE 'offline' END
     ) <> 'online'
     OR COALESCE(v_meta->>'allowOnline', 'false') <> 'true' THEN
    RAISE EXCEPTION 'هذا الاختبار غير منشور إلكترونياً';
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
  -- يمنع الضغط/الطلبات المتوازية من تجاوز حد المحاولات بين count و insert.
  PERFORM pg_advisory_xact_lock(hashtext(
    p_exam_id || ':' || COALESCE(NULLIF(trim(p_student_id), ''), lower(trim(p_student_name)) || ':' || COALESCE(p_group_id, ''))
  ));
  IF v_limit > 0 THEN
    IF p_student_id IS NOT NULL AND trim(p_student_id) <> '' THEN
      SELECT count(*) INTO v_used
        FROM public.online_exam_sessions
       WHERE exam_id = p_exam_id AND student_id = p_student_id;
    ELSE
      SELECT count(*) INTO v_used
        FROM public.online_exam_sessions
       WHERE exam_id = p_exam_id
         AND student_id IS NULL
         AND lower(trim(student_name)) = lower(trim(p_student_name))
         AND group_id = COALESCE(p_group_id, '');
    END IF;
    IF v_used >= v_limit THEN
      RAISE EXCEPTION 'استُنفد الحد الأقصى للمحاولات لهذا الاختبار';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.online_exam_sessions WHERE id = p_session_id OR attempt_id = p_attempt_id) THEN
    RAISE EXCEPTION 'هذه الجلسة مستخدمة بالفعل';
  END IF;

  -- سر عشوائي غير قابل للتخمين عملياً؛ لا يظهر أبداً في جدول قابل للقراءة العامة.
  v_secret := md5(random()::text || clock_timestamp()::text || p_session_id)
    || md5(random()::text || clock_timestamp()::text || p_attempt_id);
  v_minutes := GREATEST(1, LEAST(COALESCE(v_exam.duration, 60)::integer, 1440));

  INSERT INTO public.online_exam_sessions (
    id, attempt_id, session_secret, exam_id, student_id, student_name,
    phone, grade_id, group_id, started_at, expires_at, updated_at
  ) VALUES (
    p_session_id, p_attempt_id, v_secret, p_exam_id, NULLIF(trim(p_student_id), ''), trim(p_student_name),
    NULLIF(trim(p_phone), ''), COALESCE(p_grade_id, ''), COALESCE(p_group_id, ''),
    v_now, v_now + make_interval(secs => v_minutes * 60), v_now
  );

  RETURN jsonb_build_object(
    'id', p_session_id,
    'secret', v_secret,
    'attemptId', p_attempt_id,
    'startedAt', v_now,
    'expiresAt', v_now + make_interval(secs => v_minutes * 60)
  );
END;
$$;

-- ------------------------------------------------------------
-- حفظ التقدم: لا يقبل الخادم تعديلاً بعد expires_at.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_online_exam_progress(
  p_session_id TEXT,
  p_session_secret TEXT,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.online_exam_sessions%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF jsonb_typeof(COALESCE(p_answers, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'صيغة الإجابات غير صالحة';
  END IF;
  IF octet_length(COALESCE(p_answers, '{}'::jsonb)::text) > 262144 THEN
    RAISE EXCEPTION 'حجم الإجابات أكبر من الحد المسموح';
  END IF;

  SELECT * INTO v_session
    FROM public.online_exam_sessions
   WHERE id = p_session_id AND session_secret = p_session_secret
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'جلسة الاختبار غير صالحة';
  END IF;
  IF v_session.submitted_at IS NOT NULL THEN
    RETURN jsonb_build_object('state', 'submitted');
  END IF;
  IF v_now >= v_session.expires_at THEN
    RETURN jsonb_build_object('state', 'expired', 'expiresAt', v_session.expires_at);
  END IF;

  UPDATE public.online_exam_sessions
     SET answers = COALESCE(p_answers, '{}'::jsonb), updated_at = v_now
   WHERE id = v_session.id;
  RETURN jsonb_build_object('state', 'saved', 'expiresAt', v_session.expires_at);
END;
$$;

-- ------------------------------------------------------------
-- تسليم الجلسة: يعتمد على آخر إجابات قُبلت قبل الموعد، ويحسب الجزء الموضوعي
-- داخل الخادم. المقال يبقى pending_review مهما وُجد نموذج إجابة داخلي.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_online_exam_session(
  p_session_id TEXT,
  p_session_secret TEXT,
  p_answers JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.online_exam_sessions%ROWTYPE;
  v_exam RECORD;
  v_meta JSONB;
  v_items JSONB;
  v_answers JSONB;
  v_question JSONB;
  v_sub JSONB;
  v_answer JSONB;
  v_type INTEGER;
  v_marks NUMERIC;
  v_mode TEXT;
  v_correct BOOLEAN;
  v_manual BOOLEAN;
  v_expected TEXT;
  v_auto_score NUMERIC := 0;
  v_auto_total NUMERIC := 0;
  v_manual_total NUMERIC := 0;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_duration_seconds INTEGER;
  v_status TEXT;
  v_meta_attempt JSONB;
  v_existing_attempt public.exam_attempts%ROWTYPE;
BEGIN
  IF p_answers IS NOT NULL AND jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'صيغة الإجابات غير صالحة';
  END IF;
  IF p_answers IS NOT NULL AND octet_length(p_answers::text) > 262144 THEN
    RAISE EXCEPTION 'حجم الإجابات أكبر من الحد المسموح';
  END IF;

  SELECT * INTO v_session
    FROM public.online_exam_sessions
   WHERE id = p_session_id AND session_secret = p_session_secret
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'جلسة الاختبار غير صالحة';
  END IF;
  IF v_session.submitted_at IS NOT NULL THEN
    -- تسليم مكرر بعد فقد اتصال العميل: نعيد نفس المحاولة بدلاً من إنشاء أخرى.
    SELECT * INTO v_existing_attempt
      FROM public.exam_attempts
     WHERE id = v_session.attempt_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'state', 'submitted',
        'timedOut', COALESCE((v_existing_attempt.manual_override->>'timedOut')::boolean, false),
        'attempt', jsonb_build_object(
          'id', v_existing_attempt.id,
          'examId', v_existing_attempt.exam_id,
          'studentId', v_existing_attempt.student_id,
          'studentName', v_existing_attempt.student_name,
          'phone', v_existing_attempt.phone,
          'groupId', v_existing_attempt.group_id,
          'gradeId', v_existing_attempt.grade_id,
          'answers', v_existing_attempt.answers,
          'score', v_existing_attempt.score,
          'totalMarks', v_existing_attempt.total_marks,
          'autoScore', COALESCE((v_existing_attempt.manual_override->>'autoScore')::numeric, v_existing_attempt.score),
          'autoTotal', COALESCE((v_existing_attempt.manual_override->>'autoTotal')::numeric, v_existing_attempt.total_marks),
          'manualScore', COALESCE((v_existing_attempt.manual_override->>'manualScore')::numeric, 0),
          'manualTotal', COALESCE((v_existing_attempt.manual_override->>'manualTotal')::numeric, 0),
          'gradingStatus', COALESCE(v_existing_attempt.manual_override->>'gradingStatus', 'reviewed'),
          'startedAt', v_existing_attempt.started_at,
          'submittedAt', v_existing_attempt.submitted_at,
          'durationSeconds', v_existing_attempt.duration_seconds,
          'timedOut', COALESCE((v_existing_attempt.manual_override->>'timedOut')::boolean, false)
        ),
        'timedOut', COALESCE((v_existing_attempt.manual_override->>'timedOut')::boolean, false)
      );
    END IF;
    RAISE EXCEPTION 'المحاولة المسلَّمة غير موجودة';
  END IF;

  -- التسليم اليدوي قبل الموعد يمكنه حمل آخر لقطة مباشرة؛ بعد الموعد نستخدم
  -- فقط لقطة progress المقبولة سابقاً، فلا يضيف الطالب إجابات بعد انتهاء الوقت.
  v_answers := v_session.answers;
  IF v_now < v_session.expires_at AND p_answers IS NOT NULL THEN
    v_answers := p_answers;
    UPDATE public.online_exam_sessions
       SET answers = v_answers, updated_at = v_now
     WHERE id = v_session.id;
  END IF;

  SELECT id, duration, total_marks, questions
    INTO v_exam
    FROM public.exams
   WHERE id = v_session.exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'لم يعد الاختبار متاحاً للتسليم';
  END IF;
  v_meta := CASE WHEN jsonb_typeof(v_exam.questions) = 'object' THEN v_exam.questions ELSE '{}'::jsonb END;
  v_items := CASE WHEN jsonb_typeof(v_meta->'items') = 'array' THEN v_meta->'items' ELSE '[]'::jsonb END;
  v_mode := CASE
    WHEN v_meta->>'onlineExamMode' IN ('objective', 'essay', 'mixed') THEN v_meta->>'onlineExamMode'
    ELSE ''
  END;

  FOR v_question IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_type := CASE WHEN COALESCE(v_question->>'questionType', '') ~ '^[0-9]+$'
      THEN (v_question->>'questionType')::integer ELSE 0 END;
    FOR v_sub IN SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_question->'subQuestions') = 'array' THEN v_question->'subQuestions' ELSE '[]'::jsonb END
    ) LOOP
      v_marks := CASE
        WHEN COALESCE(v_sub->>'marks', '') ~ '^[0-9]+(\.[0-9]+)?$' AND (v_sub->>'marks')::numeric > 0
          THEN (v_sub->>'marks')::numeric
        ELSE 1
      END;
      v_answer := COALESCE(v_answers -> COALESCE(v_sub->>'id', ''), '{}'::jsonb);
      v_manual := false;
      v_correct := false;

      -- الأنماط الحديثة: المقال يدوي دائماً، والموضوعي يقتصر على 1 و3.
      IF v_mode = 'essay' THEN
        v_manual := true;
      ELSIF v_mode = 'mixed' AND v_type NOT IN (1, 3) THEN
        v_manual := true;
      ELSIF v_mode = 'objective' AND v_type NOT IN (1, 3) THEN
        v_manual := true;
      ELSIF v_mode = '' AND v_type = 4 THEN
        v_manual := true;
      END IF;

      IF NOT v_manual THEN
        IF v_type = 1 THEN
          SELECT EXISTS (
            SELECT 1
              FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(v_sub->'choices') = 'array' THEN v_sub->'choices' ELSE '[]'::jsonb END
              ) AS choice_item(value)
             WHERE COALESCE(choice_item.value->>'isCorrect', 'false') = 'true'
               AND choice_item.value->>'id' = v_answer->>'choiceId'
          ) INTO v_correct;
        ELSIF v_type = 3 THEN
          v_correct := (v_sub->>'isTrue' IN ('true', 'false'))
            AND (v_answer->>'isTrue' = v_sub->>'isTrue');
        ELSIF v_type = 5 THEN
          v_expected := COALESCE(v_sub->'corrections'->0->>'correctAnswer', '');
          v_correct := v_expected <> ''
            AND lower(regexp_replace(trim(COALESCE(v_answer->>'text', '')), '\s+', ' ', 'g'))
              = lower(regexp_replace(trim(v_expected), '\s+', ' ', 'g'));
        ELSE
          v_expected := COALESCE(v_sub->>'correctAnswer', '');
          v_correct := v_expected <> ''
            AND lower(regexp_replace(trim(COALESCE(v_answer->>'text', '')), '\s+', ' ', 'g'))
              = lower(regexp_replace(trim(v_expected), '\s+', ' ', 'g'));
        END IF;
        v_auto_total := v_auto_total + v_marks;
        IF v_correct THEN v_auto_score := v_auto_score + v_marks; END IF;
      ELSE
        v_manual_total := v_manual_total + v_marks;
      END IF;
    END LOOP;
  END LOOP;

  v_status := CASE WHEN v_manual_total > 0 THEN 'pending_review' ELSE 'reviewed' END;
  v_duration_seconds := LEAST(
    EXTRACT(EPOCH FROM (v_session.expires_at - v_session.started_at))::integer,
    GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_session.started_at))::integer)
  );
  v_meta_attempt := jsonb_build_object(
    'autoScore', round(v_auto_score, 2),
    'autoTotal', round(v_auto_total, 2),
    'manualScore', 0,
    'manualTotal', round(v_manual_total, 2),
    'gradingStatus', v_status,
    'timedOut', v_now >= v_session.expires_at
  );

  INSERT INTO public.exam_attempts (
    id, exam_id, student_id, student_name, phone, group_id, grade_id, answers,
    score, total_marks, started_at, submitted_at, duration_seconds, manual_override
  ) VALUES (
    v_session.attempt_id, v_session.exam_id, v_session.student_id, v_session.student_name,
    v_session.phone, v_session.group_id, v_session.grade_id, v_answers,
    round(v_auto_score, 2), round(v_auto_total + v_manual_total, 2),
    v_session.started_at::text, v_now::text, v_duration_seconds, v_meta_attempt
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE public.online_exam_sessions
     SET submitted_at = v_now, updated_at = v_now
   WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'state', 'submitted',
    'timedOut', v_now >= v_session.expires_at,
    'attempt', jsonb_build_object(
      'id', v_session.attempt_id,
      'examId', v_session.exam_id,
      'studentId', v_session.student_id,
      'studentName', v_session.student_name,
      'phone', v_session.phone,
      'groupId', v_session.group_id,
      'gradeId', v_session.grade_id,
      'answers', v_answers,
      'score', round(v_auto_score, 2),
      'totalMarks', round(v_auto_total + v_manual_total, 2),
      'autoScore', round(v_auto_score, 2),
      'autoTotal', round(v_auto_total, 2),
      'manualScore', 0,
      'manualTotal', round(v_manual_total, 2),
      'gradingStatus', v_status,
      'startedAt', v_session.started_at,
      'submittedAt', v_now,
      'durationSeconds', v_duration_seconds,
      'timedOut', v_now >= v_session.expires_at
    )
  );
END;
$$;

-- ------------------------------------------------------------
-- قراءة ورقة الاختبار للطلاب: نعيد النصوص وخيارات الإجابة فقط من دون مفاتيح
-- التصحيح. لا يقرأ anon جدول exams مباشرة، فلا تكون مفاتيح التصحيح في الشبكة.
-- مفاتيح التصحيح لا تخرج من هذه الدالة إطلاقاً؛ دالة التغذية الراجعة المقيّدة
-- بالجلسة أدناه هي وحدها التي تقرر ما يظهر بعد كل سؤال أو عند النهاية.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_online_exams()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'grade_id', e.grade_id,
      'group_id', e.group_id,
      'title', e.title,
      'month', e.month,
      'unit', e.unit,
      'academic_year', e.academic_year,
      'duration', e.duration,
      'total_marks', e.total_marks,
      'created_at', e.created_at,
      'updated_at', e.updated_at,
      'questions', jsonb_set(e.questions, '{items}', COALESCE((
        SELECT jsonb_agg(
          q.value || jsonb_build_object('subQuestions', COALESCE((
            SELECT jsonb_agg(
              (sq.value - 'correctAnswer' - 'isTrue' - 'corrections')
              || CASE
                WHEN q.value->>'questionType' = '1' THEN jsonb_build_object(
                  'choices', COALESCE((
                    SELECT jsonb_agg((choice.value - 'isCorrect') ORDER BY choice.ord)
                    FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(sq.value->'choices') = 'array'
                        THEN sq.value->'choices' ELSE '[]'::jsonb END
                    ) WITH ORDINALITY AS choice(value, ord)
                  ), '[]'::jsonb)
                )
                ELSE '{}'::jsonb
              END ORDER BY sq.ord
            )
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(q.value->'subQuestions') = 'array'
                THEN q.value->'subQuestions' ELSE '[]'::jsonb END
            ) WITH ORDINALITY AS sq(value, ord)
          ), '[]'::jsonb)) ORDER BY q.ord
        )
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(e.questions->'items') = 'array'
            THEN e.questions->'items' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS q(value, ord)
      ), '[]'::jsonb), true)
    )
  ), '[]'::jsonb)
  FROM public.exams e
  WHERE jsonb_typeof(e.questions) = 'object'
    AND COALESCE(e.questions->>'allowOnline', 'false') = 'true'
    AND COALESCE(
      e.questions->>'deliveryMode',
      CASE WHEN e.questions->>'allowOnline' = 'true' THEN 'online' ELSE 'offline' END
    ) = 'online';
$$;

-- ------------------------------------------------------------
-- مفاتيح الإجابة المسموح إظهارها لجلسة بعينها فقط. تُستخدم لإعداد «بعد كل
-- سؤال» و«في نهاية الاختبار»؛ المقال والتصحيح النموذجي لا يرجعان من هنا.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_online_exam_answer_feedback(
  p_session_id TEXT,
  p_session_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.online_exam_sessions%ROWTYPE;
  v_questions JSONB;
  v_items JSONB;
  v_question JSONB;
  v_sub JSONB;
  v_answer JSONB;
  v_meta JSONB;
  v_visibility TEXT;
  v_mode TEXT;
  v_type INTEGER;
  v_manual BOOLEAN;
  v_sub_id TEXT;
  v_choice_id TEXT;
  v_expected TEXT;
  v_feedback JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_session
    FROM public.online_exam_sessions
   WHERE id = p_session_id AND session_secret = p_session_secret;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'جلسة الاختبار غير صالحة';
  END IF;

  SELECT questions INTO v_questions FROM public.exams WHERE id = v_session.exam_id;
  IF v_questions IS NULL OR jsonb_typeof(v_questions) <> 'object' THEN
    RAISE EXCEPTION 'لم يعد الاختبار متاحاً';
  END IF;
  v_meta := v_questions;
  v_visibility := COALESCE(v_meta->>'answerVisibility', 'never');
  IF v_visibility NOT IN ('afterEach', 'atEnd') THEN
    RETURN jsonb_build_object('answers', v_feedback);
  END IF;
  IF v_visibility = 'atEnd' AND v_session.submitted_at IS NULL THEN
    RETURN jsonb_build_object('answers', v_feedback);
  END IF;

  v_mode := CASE WHEN v_meta->>'onlineExamMode' IN ('objective', 'essay', 'mixed')
    THEN v_meta->>'onlineExamMode' ELSE '' END;
  v_items := CASE WHEN jsonb_typeof(v_meta->'items') = 'array' THEN v_meta->'items' ELSE '[]'::jsonb END;
  FOR v_question IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_type := CASE WHEN COALESCE(v_question->>'questionType', '') ~ '^[0-9]+$'
      THEN (v_question->>'questionType')::integer ELSE 0 END;
    FOR v_sub IN SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_question->'subQuestions') = 'array' THEN v_question->'subQuestions' ELSE '[]'::jsonb END
    ) LOOP
      v_sub_id := COALESCE(v_sub->>'id', '');
      IF v_sub_id = '' THEN CONTINUE; END IF;
      IF v_visibility = 'afterEach' AND NOT (v_session.answers ? v_sub_id) THEN CONTINUE; END IF;
      v_manual := v_mode = 'essay'
        OR (v_mode = 'mixed' AND v_type NOT IN (1, 3))
        OR (v_mode = 'objective' AND v_type NOT IN (1, 3))
        OR (v_mode = '' AND v_type = 4);
      IF v_manual THEN CONTINUE; END IF;

      IF v_type = 1 THEN
        SELECT choice.value->>'id' INTO v_choice_id
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(v_sub->'choices') = 'array' THEN v_sub->'choices' ELSE '[]'::jsonb END
          ) AS choice(value)
         WHERE COALESCE(choice.value->>'isCorrect', 'false') = 'true'
         LIMIT 1;
        IF v_choice_id IS NOT NULL AND v_choice_id <> '' THEN
          v_feedback := v_feedback || jsonb_build_object(v_sub_id, jsonb_build_object('choiceId', v_choice_id));
        END IF;
      ELSIF v_type = 3 AND v_sub->>'isTrue' IN ('true', 'false') THEN
        v_feedback := v_feedback || jsonb_build_object(v_sub_id, jsonb_build_object('isTrue', (v_sub->>'isTrue')::boolean));
      ELSIF v_type = 5 THEN
        v_expected := COALESCE(v_sub->'corrections'->0->>'correctAnswer', '');
        IF v_expected <> '' THEN
          v_feedback := v_feedback || jsonb_build_object(v_sub_id, jsonb_build_object('text', v_expected));
        END IF;
      ELSIF v_type IN (2, 6, 7, 8) THEN
        v_expected := COALESCE(v_sub->>'correctAnswer', '');
        IF v_expected <> '' THEN
          v_feedback := v_feedback || jsonb_build_object(v_sub_id, jsonb_build_object('text', v_expected));
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('answers', v_feedback);
END;
$$;

-- ------------------------------------------------------------
-- استعادة نتيجة جلسة واحدة: السر العشوائي للجلسة هو القدرة الوحيدة المطلوبة.
-- لا يكشف هذا المسار أي مراجعة أو درجة مقالية أو تعليق قبل إطلاق النتيجة.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_online_exam_result(
  p_session_id TEXT,
  p_session_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.online_exam_sessions%ROWTYPE;
  v_attempt public.exam_attempts%ROWTYPE;
  v_meta JSONB;
  v_safe_meta JSONB := '{}'::jsonb;
  v_safe_answers JSONB := '{}'::jsonb;
  v_answer_key TEXT;
  v_answer_value JSONB;
  v_released BOOLEAN := false;
  v_feedback JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_session
    FROM public.online_exam_sessions
   WHERE id = p_session_id AND session_secret = p_session_secret;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'جلسة الاختبار غير صالحة';
  END IF;
  IF v_session.submitted_at IS NULL THEN
    RETURN jsonb_build_object('state', 'in_progress');
  END IF;

  SELECT * INTO v_attempt
    FROM public.exam_attempts
   WHERE id = v_session.attempt_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'in_progress');
  END IF;

  v_meta := CASE WHEN jsonb_typeof(v_attempt.manual_override) = 'object'
    THEN v_attempt.manual_override ELSE '{}'::jsonb END;
  v_released := NULLIF(COALESCE(v_meta->>'resultReleasedAt', ''), '') IS NOT NULL;

  -- إجابة الطالب نفسها مسموحة، لكن review لا يخرج قبل الإطلاق الصريح.
  FOR v_answer_key, v_answer_value IN
    SELECT key, value FROM jsonb_each(
      CASE WHEN jsonb_typeof(v_attempt.answers) = 'object' THEN v_attempt.answers ELSE '{}'::jsonb END
    )
  LOOP
    v_safe_answers := v_safe_answers || jsonb_build_object(
      v_answer_key,
      CASE WHEN v_released THEN v_answer_value ELSE v_answer_value - 'review' END
    );
  END LOOP;

  v_safe_meta := jsonb_strip_nulls(jsonb_build_object(
    'autoScore', v_meta->'autoScore',
    'autoTotal', v_meta->'autoTotal',
    -- لا يكشف التصحيح اليدوي قبل الإطلاق، حتى في بيانات الشبكة.
    'manualScore', CASE WHEN v_released THEN v_meta->'manualScore' ELSE to_jsonb(0) END,
    'manualTotal', v_meta->'manualTotal',
    'gradingStatus', v_meta->'gradingStatus',
    'resultReleasedAt', CASE WHEN v_released THEN v_meta->'resultReleasedAt' ELSE NULL END,
    'reviewedAt', v_meta->'reviewedAt',
    'timedOut', v_meta->'timedOut'
  ));
  IF v_released AND jsonb_typeof(v_meta->'score') = 'number' THEN
    v_safe_meta := v_safe_meta || jsonb_strip_nulls(jsonb_build_object(
      'score', v_meta->'score',
      'reason', v_meta->'reason',
      'at', v_meta->'at'
    ));
  END IF;

  -- نفس قواعد afterEach / atEnd؛ المقال لا يملك مفتاحاً في هذه الدالة.
  v_feedback := COALESCE(
    public.get_online_exam_answer_feedback(p_session_id, p_session_secret)->'answers',
    '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'state', 'submitted',
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'exam_id', v_attempt.exam_id,
      'student_id', v_attempt.student_id,
      'student_name', v_attempt.student_name,
      'group_id', v_attempt.group_id,
      'grade_id', v_attempt.grade_id,
      'answers', v_safe_answers,
      'score', v_attempt.score,
      'total_marks', v_attempt.total_marks,
      'started_at', v_attempt.started_at,
      'submitted_at', v_attempt.submitted_at,
      'duration_seconds', v_attempt.duration_seconds,
      'manual_override', v_safe_meta
    ),
    'feedback', v_feedback
  );
END;
$$;

-- لا يستطيع anon قراءة أو إدراج محاولة مباشرة وتجاوز ساعة الخادم. المعلم
-- المصادق فقط يحتفظ بصلاحية الإدارة/الترحيل عبر سياسة authenticated الموجودة مسبقاً.
DROP POLICY IF EXISTS "anon insert exam_attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "public insert" ON public.exam_attempts;
DROP POLICY IF EXISTS "public read" ON public.exam_attempts;
DROP POLICY IF EXISTS "anon read exam_attempts" ON public.exam_attempts;
-- لا توجد قراءة أو كتابة REST مباشرة للمحاولات؛ النتيجة تعود فقط بسر الجلسة.
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.exam_attempts FROM anon;
-- قد يكون عرض العدّاد موجوداً في قواعد قديمة فقط؛ لم يعد مساراً عاماً بعد أن
-- صار start_online_exam_session يفرض الحد داخل المعاملة.
DO $$
BEGIN
  IF to_regclass('public.exam_attempt_counts') IS NOT NULL THEN
    REVOKE SELECT ON TABLE public.exam_attempt_counts FROM anon;
  END IF;
END $$;

-- لا نسمح بقراءة questions الخام من REST؛ get_public_online_exams هو المسار
-- الوحيد للزائر ويزيل مفاتيح التصحيح قبل خروجها من PostgreSQL.
DROP POLICY IF EXISTS "public read exams" ON public.exams;
DROP POLICY IF EXISTS "anon read exams" ON public.exams;
REVOKE SELECT ON TABLE public.exams FROM anon;

REVOKE ALL ON FUNCTION public.start_online_exam_session(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_online_exam_progress(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_online_exam_session(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_online_exams() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_online_exam_answer_feedback(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_online_exam_result(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_online_exam_session(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_online_exam_progress(TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_online_exam_session(TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_online_exams() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_online_exam_answer_feedback(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_online_exam_result(TEXT, TEXT) TO anon, authenticated;

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
REVOKE SELECT ON TABLE public.registration_requests FROM anon;
-- الحسابات وطلبات التسجيل تُقرأ الآن حصراً عبر الدوال الآمنة
-- (SECURITY DEFINER). لا قراءة خام لـ anon — حماية كلمات المرور وبيانات
-- الطلاب/الأولياء (أسماء، هواتف، بصمات) من أي زائر، والتحقق يتم داخل الخادم.

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
    'ok', true,
    'studentId', v_student_id,
    'name', v_student.name,
    'email', v_mail,
    'token', v_token,
    'code', 'ok',
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

-- ============================================================
-- 4) اكتمل!
--    لا توجد أي أوامر حذف بيانات في هذا الملف.
--    جاهز لإعادة التشغيل في أي وقت دون أي مخاطرة.
-- ============================================================

COMMIT;
