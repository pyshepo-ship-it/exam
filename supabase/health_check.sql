-- ============================================================
-- 🔍 الفحص الشامل لحالة المشروع — أ/ ضحى العربي
-- ============================================================
-- طريقة الاستخدام:
--   1) افتح Supabase → SQL Editor → New query
--   2) الصق هذا الملف كاملاً ثم Run
--   3) سترى جداول نتائج أعلى الشاشة + التفاصيل في تبويب Messages
--   • أي بند ❌ = مشكلة فعلية. أغلبها تُحل بتنفيذ supabase/migrations/010_repair_align.sql
--   • آمن 100%: لا يعدل أي بيانات — قراءة فقط، ويعمل حتى لو ناقص الجداول
-- ============================================================

-- ============================================================
-- 1) الجداول المطلوبة — هل كلها موجودة؟
-- ============================================================
WITH required(ord, tid, lbl) AS (
  VALUES
    (1,  'grades',                'الصفوف'),
    (2,  'groups',                'المجموعات'),
    (3,  'students',              'الطلاب'),
    (4,  'dues',                  'الاستحقاقات'),
    (5,  'payments',              'الدفعات'),
    (6,  'exams',                 'الاختبارات'),
    (7,  'exam_attempts',         'محاولات الاختبارات'),
    (8,  'sessions',              'الحصص'),
    (9,  'attendance',            'الحضور'),
    (10, 'announcements',         'الإعلانات والأسئلة المهمة'),
    (11, 'honorees',              'لوحة الشرف'),
    (12, 'shared_files',          'الملفات المشتركة'),
    (13, 'important_links',       'الروابط المهمة'),
    (14, 'app_settings',          'الإعدادات'),
    (15, 'year_archives',         'أرشيف السنوات'),
    (16, 'manual_grades',         'الدرجات اليدوية'),
    (17, 'registration_requests', 'طلبات تسجيل الطلاب'),
    (18, 'group_transfer_requests','طلبات نقل المجموعة'),
    (19, 'student_history',       'سجل نشاط الطلاب'),
    (20, 'student_accounts',      'حسابات دخول البوابة'),
    (21, 'inquiries',             'استفسارات الطلاب')
)
SELECT
  r.lbl AS "الجدول",
  CASE WHEN to_regclass('public.' || r.tid) IS NOT NULL
       THEN 'موجود ✅' ELSE 'غير موجود ❌ — نفّذ 010' END AS "الحالة",
  CASE WHEN to_regclass('public.' || r.tid) IS NOT NULL
       THEN COALESCE(GREATEST(c.reltuples, 0)::bigint::text, '0') || ' (تقديري)'
       ELSE '—' END AS "عدد الصفوف تقريبياً"
FROM required r
LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || r.tid)
ORDER BY r.ord;

-- ============================================================
-- 2) الأعمدة الحرجة — مصدر مشكلة «البريد لا يتسجل» غالباً هنا
-- ============================================================
WITH required(ord, tbl, col, why) AS (
  VALUES
    (1,  'students',              'email',            'بريد الطالب (المسار المطلوب إصلاحه)'),
    (2,  'students',              'inquiry_blocked',  'إغلاق قناة الاستفسار لطالب'),
    (3,  'registration_requests', 'email',            'بريد طلب التسجيل'),
    (4,  'registration_requests', 'password_hash',    'بصمة كلمة المرور (SHA-256 فقط)'),
    (5,  'registration_requests', 'guardian_phone',   'هاتف ولي الأمر — بدونه يفشل إرسال الطلب كلياً ⚠️'),
    (6,  'registration_requests', 'linked_student_id','ربط الطلب بالطالب عند الموافقة'),
    (7,  'registration_requests', 'status',           'حالة الطلب (pending/approved/rejected)'),
    (8,  'student_accounts',      'email',            'بريد حساب الدخول'),
    (9,  'student_accounts',      'password_hash',    'بصمة كلمة المرور لإعادة التعيين'),
    (10, 'student_accounts',      'active',           'إيقاف/تفعيل الحساب'),
    (11, 'exam_attempts',         'manual_override',  'تعديل المعلم اليدوي للدرجة'),
    (12, 'announcements',         'target_grade_ids', 'استهداف الإعلان بصفوف'),
    (13, 'inquiries',             'messages',         'رسائل الاستفسار')
)
SELECT
  r.tbl AS "الجدول", r.col AS "العمود", r.why AS "الغرض",
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name = r.col
  ) THEN 'موجود ✅' ELSE 'ناقص ❌ — يفشل عليه الكود — نفّذ 010' END AS "الحالة"
FROM required r ORDER BY r.ord;

-- ============================================================
-- 3) حماية RLS مفعّلة على كل الجداول؟
-- ============================================================
SELECT
  c.relname AS "الجدول",
  CASE WHEN c.relrowsecurity THEN 'مفعّل ✅' ELSE 'معطّل ❌' END AS "RLS"
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 1;

-- ============================================================
-- 4) سياسات RLS القائمة — هل هناك تعارض أو نقص؟
-- ============================================================
SELECT
  tablename AS "الجدول",
  policyname AS "السياسة",
  cmd AS "الأمر",
  array_to_string(roles, ', ') AS "الأدوار",
  permissive AS "النوع"
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- سياسات متعارضة: أكثر من سياسة permissive لنفس (الجدول + الأمر + الدور)
-- لا تكسر النتيجة عادة (OR بينها) لكنها فوضى تستحق التنظيف — 010 يوحّدها
SELECT
  tablename AS "الجدول", cmd AS "الأمر", role AS "الدور",
  count(*) AS "عدد السياسات المتوازية",
  CASE WHEN count(*) > 1 THEN 'تعارض تنظيمي ⚠️' ELSE 'سليم ✅' END AS "الحالة"
FROM (
  SELECT tablename, cmd, unnest(roles) AS role
  FROM pg_policies WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
) x
GROUP BY 1, 2, 3
HAVING count(*) > 1
ORDER BY 1, 2;

-- ============================================================
-- 5) مصفوفة الصلاحيات GRANT (المدرس = authenticated / الطالب والزائر = anon)
-- ============================================================
WITH roles(rid, ord) AS (VALUES ('anon', 1), ('authenticated', 2)),
tables AS (
  SELECT c.relname AS tn
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname
)
SELECT
  t.tn AS "الجدول", r.rid AS "الدور",
  has_table_privilege(r.rid, 'public.' || t.tn, 'SELECT')  AS "قراءة",
  has_table_privilege(r.rid, 'public.' || t.tn, 'INSERT')  AS "إضافة",
  has_table_privilege(r.rid, 'public.' || t.tn, 'UPDATE')  AS "تحديث",
  has_table_privilege(r.rid, 'public.' || t.tn, 'DELETE')  AS "حذف",
  CASE
    WHEN r.rid = 'authenticated'
      THEN CASE WHEN has_table_privilege(r.rid, 'public.' || t.tn, 'INSERT')
                THEN 'سليم ✅' ELSE 'ناقص ❌ (المدرس لا يستطيع الكتابة) — نفّذ 010' END
    ELSE 'زيارة فقط ✅'
  END AS "ملاحظة"
FROM tables t CROSS JOIN roles r
ORDER BY 1, r.ord;

-- ============================================================
-- 5-ب) جداول التقديم: هل يستطيع الطالب (زائر) الإرسال فعلاً؟
--      (هذا مسار «تعذر إرسال الطلب» بالتحديد)
-- ============================================================
WITH submit_tables AS (
  VALUES
    ('registration_requests',   'طلبات التسجيل'),
    ('group_transfer_requests', 'طلبات النقل'),
    ('inquiries',               'الاستفسارات'),
    ('exam_attempts',           'محاولات الاختبارات'),
    ('honorees',                'ترشيح لوحة الشرف')
)
SELECT
  s.t2 AS "جدول التقديم",
  CASE WHEN has_table_privilege('anon', 'public.' || s.t1, 'INSERT')
       THEN 'مفتوح ✅' ELSE 'مقفول ❌' END AS "صلاحية GRANT للزائر",
  CASE WHEN EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename = s.t1
           AND p.cmd='INSERT' AND 'anon' = ANY(p.roles))
       THEN 'موجودة ✅' ELSE 'ناقصة ❌' END AS "سياسة RLS للإدراج",
  CASE WHEN has_table_privilege('anon', 'public.' || s.t1, 'INSERT')
        AND EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename = s.t1
           AND p.cmd='INSERT' AND 'anon' = ANY(p.roles))
       THEN 'الإرسال يعمل ✅'
       ELSE 'ممنوع ❌ — نفّذ 012_anon_submit_fix.sql' END AS "النتيجة"
FROM submit_tables s
ORDER BY 1;

-- ============================================================
-- 6) حد المحاولات المعتمد من الخادم (Migration 015)
-- ============================================================
-- لا يعتمد الإصدار الحالي على VIEW عام: الدالة تبدأ الجلسة وتفحص الحد داخل
-- نفس المعاملة، فلا يمكن تجاوز الحد بطلبين متزامنين أو بقراءة من جهاز آخر.
SELECT
  CASE WHEN to_regprocedure('public.start_online_exam_session(text,text,text,text,text,text,text,text)') IS NOT NULL
       THEN 'RPC بدء الجلسة موجود ✅' ELSE 'ناقص ❌ — نفّذ 015' END AS "جلسة الاختبار",
  CASE WHEN to_regprocedure('public.get_online_exam_result(text,text)') IS NOT NULL
       THEN 'RPC النتيجة المقيدة موجود ✅' ELSE 'ناقص ❌ — نفّذ 015' END AS "استعادة النتيجة",
  CASE WHEN has_table_privilege('anon', 'public.exam_attempts', 'SELECT')
       THEN 'قراءة المحاولات مكشوفة ❌ — نفّذ 015'
       ELSE 'محاولات الزائر مغلقة ✅' END AS "حماية المحاولات"
FROM (SELECT 1) x;

-- ============================================================
-- 6-ب) الـ Views: هل تعمل بصلاحيات المستخدم (بدون تنبيه Linter)؟
-- ============================================================
SELECT
  c.relname AS "الـ View",
  CASE WHEN (c.reloptions::text LIKE '%security_invoker=on%' OR c.reloptions::text LIKE '%security_invoker=true%')
       THEN 'بصلاحيات المستخدم ✅'
       ELSE 'بصلاحيات المالك ⚠️ — نفّذ 011_fix_views_security_invoker.sql' END AS "الوضع"
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
ORDER BY 1;

-- ============================================================
-- 7) الارتباطات اليتيمة (سجلات تفقد جدولها الأصل) — تبويب Messages
-- ============================================================
DO $$
DECLARE
  cnt BIGINT;
  total BIGINT := 0;
BEGIN
  IF to_regclass('public.students') IS NOT NULL THEN
    IF to_regclass('public.grades') IS NOT NULL THEN
      SELECT count(*) INTO cnt FROM students s LEFT JOIN grades g ON g.id = s.grade_id
      WHERE s.grade_id IS NOT NULL AND g.id IS NULL;
      total := total + cnt;
      RAISE NOTICE '% طلاب بصف مفقود %', cnt, CASE WHEN cnt = 0 THEN '✅' ELSE '❌' END;
    END IF;
    IF to_regclass('public.groups') IS NOT NULL THEN
      SELECT count(*) INTO cnt FROM students s LEFT JOIN groups g ON g.id = s.group_id
      WHERE s.group_id IS NOT NULL AND g.id IS NULL;
      total := total + cnt;
      RAISE NOTICE '% طلاب بمجموعة مفقودة %', cnt, CASE WHEN cnt = 0 THEN '✅' ELSE '❌' END;
    END IF;
  END IF;

  IF to_regclass('public.dues') IS NOT NULL AND to_regclass('public.students') IS NOT NULL THEN
    SELECT count(*) INTO cnt FROM dues d LEFT JOIN students s ON s.id = d.student_id
    WHERE s.id IS NULL;
    total := total + cnt;
    RAISE NOTICE '% استحقاقات بلا طالب %', cnt, CASE WHEN cnt = 0 THEN '✅' ELSE '❌' END;
  END IF;

  IF to_regclass('public.payments') IS NOT NULL AND to_regclass('public.students') IS NOT NULL THEN
    SELECT count(*) INTO cnt FROM payments p LEFT JOIN students s ON s.id = p.student_id
    WHERE s.id IS NULL;
    total := total + cnt;
    RAISE NOTICE '% دفعات بلا طالب %', cnt, CASE WHEN cnt = 0 THEN '✅' ELSE '❌' END;
  END IF;

  IF to_regclass('public.sessions') IS NOT NULL AND to_regclass('public.groups') IS NOT NULL THEN
    SELECT count(*) INTO cnt FROM sessions se LEFT JOIN groups g ON g.id = se.group_id
    WHERE se.group_id IS NOT NULL AND g.id IS NULL;
    total := total + cnt;
    RAISE NOTICE '% حصص بمجموعة مفقودة %', cnt, CASE WHEN cnt = 0 THEN '✅' ELSE '❌' END;
  END IF;

  IF to_regclass('public.attendance') IS NOT NULL THEN
    IF to_regclass('public.sessions') IS NOT NULL THEN
      SELECT count(*) INTO cnt FROM attendance a LEFT JOIN sessions se ON se.id = a.session_id
      WHERE se.id IS NULL;
      total := total + cnt;
      RAISE NOTICE '% سجلات حضور بجلسة مفقودة %', cnt, CASE WHEN cnt = 0 THEN '✅' ELSE '❌' END;
    END IF;
    IF to_regclass('public.students') IS NOT NULL THEN
      SELECT count(*) INTO cnt FROM attendance a LEFT JOIN students s ON s.id = a.student_id
      WHERE s.id IS NULL;
      total := total + cnt;
      RAISE NOTICE '% سجلات حضور بطالب مفقود %', cnt, CASE WHEN cnt = 0 THEN '✅' ELSE '❌' END;
    END IF;
  END IF;

  IF to_regclass('public.exam_attempts') IS NOT NULL AND to_regclass('public.exams') IS NOT NULL THEN
    SELECT count(*) INTO cnt FROM exam_attempts a LEFT JOIN exams e ON e.id = a.exam_id
    WHERE e.id IS NULL;
    total := total + cnt;
    RAISE NOTICE '% محاولات اختبار بلا اختبار أصلي %', cnt, CASE WHEN cnt = 0 THEN '✅' ELSE '❌' END;
  END IF;

  IF to_regclass('public.inquiries') IS NOT NULL AND to_regclass('public.students') IS NOT NULL THEN
    SELECT count(*) INTO cnt FROM inquiries q LEFT JOIN students s ON s.id = q.student_id
    WHERE s.id IS NULL;
    total := total + cnt;
    RAISE NOTICE '% استفسارات بطالب مفقود %', cnt, CASE WHEN cnt = 0 THEN '✅' ELSE '❌' END;
  END IF;

  RAISE NOTICE '——— إجمالي السجلات اليتيمة: % %', total,
    CASE WHEN total = 0 THEN '✅' ELSE '❌ (تُنظّف تلقائياً عند أول مزامنة بعد الإصلاح)' END;
END $$;

-- ============================================================
-- 8) مسار البريد الإلكتروني بالتحديد (مشكلتك الحالية) — تبويب Messages
-- ============================================================
DO $$
DECLARE
  cnt BIGINT;
  problems BIGINT := 0;
  info BIGINT;
BEGIN
  RAISE NOTICE '========== فحص مسار البريد الإلكتروني ==========';

  -- أ) عمود البريد موجود أصلاً؟
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='students' AND column_name='email') THEN
    RAISE NOTICE 'عمود students.email موجود ✅';
  ELSE
    problems := problems + 1;
    RAISE NOTICE 'عمود students.email غير موجود ❌ — الكود يكتبه ولا تجد القاعدة مكاناً له (السبب الأول لمشكلتك) — نفّذ 010';
  END IF;

  IF to_regclass('public.registration_requests') IS NULL THEN
    problems := problems + 1;
    RAISE NOTICE 'جدول طلبات التسجيل غير موجود أصلاً ❌ — طلبات الطلاب لا تصل أبداً — نفّذ 010';
  ELSE
    -- ب) عمود هاتف ولي الأمر (بدونه يفشل الإرسال من جهاز الطالب كلياً)
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='registration_requests' AND column_name='guardian_phone') THEN
      RAISE NOTICE 'عمود guardian_phone موجود ✅';
    ELSE
      problems := problems + 1;
      RAISE NOTICE 'عمود registration_requests.guardian_phone ناقص ❌ — كل طلب تسجيل جديد من الموقع يُرفض بصمت! — نفّذ 010';
    END IF;

    -- ج) طلبات معتمدة بلا ربط بطالب
    IF to_regclass('public.students') IS NOT NULL THEN
      SELECT count(*) INTO cnt FROM registration_requests
      WHERE status = 'approved' AND linked_student_id IS NULL;
      IF cnt > 0 THEN problems := problems + cnt; END IF;
      RAISE NOTICE '% طلب معتمد بدون ربط بطالب %', cnt,
        CASE WHEN cnt = 0 THEN '✅' ELSE '❌ — هؤلاء رُفض دخولهم بـ«بيانات الطالب غير موجودة»' END;

      SELECT count(*) INTO cnt FROM registration_requests rr
      LEFT JOIN students s ON s.id = rr.linked_student_id
      WHERE rr.status = 'approved' AND rr.linked_student_id IS NOT NULL AND s.id IS NULL;
      IF cnt > 0 THEN problems := problems + cnt; END IF;
      RAISE NOTICE '% طلب معتمد مربوط بطالب محذوف %', cnt, CASE WHEN cnt = 0 THEN '✅' ELSE '❌' END;
    END IF;

    -- د) طلبات معتمدة بلا حساب بوابة
    IF to_regclass('public.student_accounts') IS NOT NULL THEN
      SELECT count(*) INTO cnt FROM registration_requests rr
      LEFT JOIN student_accounts a ON lower(a.email) = lower(rr.email)
      WHERE rr.status = 'approved' AND a.id IS NULL;
      IF cnt > 0 THEN problems := problems + cnt; END IF;
      RAISE NOTICE '% طلب معتمد بدون حساب دخول (البريد لم يُسجَّل كحساب) %', cnt,
        CASE WHEN cnt = 0 THEN '✅' ELSE '❌ — الطالب لن يستطيع الدخول من أي جهاز آخر' END;

      -- هـ) حسابات بلا طالب مقابل
      IF to_regclass('public.students') IS NOT NULL THEN
        SELECT count(*) INTO cnt FROM student_accounts a
        LEFT JOIN students s ON s.id = a.student_id WHERE s.id IS NULL;
        IF cnt > 0 THEN problems := problems + cnt; END IF;
        RAISE NOTICE '% حساب دخول يتيم بلا طالب %', cnt, CASE WHEN cnt = 0 THEN '✅' ELSE '❌' END;

        -- و) طلاب لهم حساب لكن بريدهم فارغ في جدول الطلاب
        SELECT count(*) INTO cnt FROM student_accounts a
        JOIN students s ON s.id = a.student_id
        WHERE COALESCE(s.email, '') = '';
        RAISE NOTICE '% طالب له حساب لكن خليته البريد فارغة (تظهر «بدون بريد» في لوحتك) %', cnt,
          CASE WHEN cnt = 0 THEN '✅' ELSE 'ℹ️ معلومة — تُصلح تلقائياً بأول مزامنة بعد تنفيذ 010' END;

        -- ز) بريد الطالب في جدولي الطلاب والحسابات مختلف
        SELECT count(*) INTO cnt FROM student_accounts a
        JOIN students s ON s.id = a.student_id
        WHERE COALESCE(s.email,'') <> '' AND lower(s.email) <> lower(a.email);
        IF cnt > 0 THEN problems := problems + cnt; END IF;
        RAISE NOTICE '% طالب بريده في جدول الطلاب مختلف عن بريد حسابه %', cnt,
          CASE WHEN cnt = 0 THEN '✅' ELSE '❌' END;

        -- ح) بريد مكرر
        SELECT count(*) INTO cnt FROM (
          SELECT lower(email) FROM student_accounts GROUP BY lower(email) HAVING count(*) > 1
        ) d;
        IF cnt > 0 THEN problems := problems + cnt; END IF;
        RAISE NOTICE '% بريد مكرر في حسابات الدخول %', cnt,
          CASE WHEN cnt = 0 THEN '✅' ELSE '❌ — يمنع دخلول أحدهم' END;

        SELECT count(*) INTO info FROM students WHERE COALESCE(email,'') <> '';
        RAISE NOTICE 'عدد الطلاب المسجَّل بريدهم في جدول students: %', info;
      END IF;
    END IF;

    -- ط) معلومات عامة عن الطلبات
    SELECT count(*) INTO info FROM registration_requests WHERE status = 'pending';
    RAISE NOTICE 'طلبات تسجيل قيد المراجعة: %', info;
    SELECT count(*) INTO info FROM registration_requests WHERE status = 'approved';
    RAISE NOTICE 'طلبات معتمدة: %', info;
    SELECT count(*) INTO info FROM registration_requests WHERE status = 'rejected';
    RAISE NOTICE 'طلبات مرفوضة: %', info;
    SELECT count(*) INTO info FROM registration_requests
    WHERE review_note LIKE '%إعادة تعيين كلمة المرور%';
    RAISE NOTICE 'طلبات استرجاع كلمة مرور بانتظارك: %', info;
  END IF;

  RAISE NOTICE '——— خلاصة مسار البريد: % مشكلة حقيقية', problems;
END $$;

-- ============================================================
-- 9) الخلاصة النهائية — تبويب Messages
-- ============================================================
DO $$
DECLARE
  missing_tables INT := 0;
  missing_cols   INT := 0;
BEGIN
  SELECT count(*) INTO missing_tables FROM (
    VALUES ('grades'),('groups'),('students'),('dues'),('payments'),('exams'),
           ('exam_attempts'),('sessions'),('attendance'),('announcements'),('honorees'),
           ('shared_files'),('important_links'),('app_settings'),('year_archives'),
           ('manual_grades'),('registration_requests'),('group_transfer_requests'),
           ('student_history'),('student_accounts'),('inquiries')
  ) AS t(tid)
  WHERE to_regclass('public.' || tid) IS NULL;

  SELECT count(*) INTO missing_cols FROM (
    VALUES
      ('students','email'), ('students','inquiry_blocked'),
      ('registration_requests','guardian_phone'), ('registration_requests','linked_student_id'),
      ('student_accounts','password_hash'), ('exam_attempts','manual_override'),
      ('announcements','target_grade_ids')
  ) AS t(tbl, col)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name = t.tbl AND c.column_name = t.col
  );

  IF missing_tables = 0 AND missing_cols = 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '✅✅✅ الحالة العامة سليمة: كل الجداول والأعمدة موجودة — راجع الجداول أعلاه لأي ❌ في السياسات أو البيانات';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '❌ الحالة العامة تحتاج إصلاحاً: % جدول ناقص + % عمود ناقص', missing_tables, missing_cols;
    RAISE NOTICE '>>> الحل: افتح supabase/migrations/010_repair_align.sql والصقه كاملاً في SQL Editor ثم Run، ثم أعد تشغيل هذا الفحص';
  END IF;
END $$;
