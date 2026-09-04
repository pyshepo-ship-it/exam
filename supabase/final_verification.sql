-- ============================================================
-- 🔐 التحقق النهائي: Supabase يحمل كل شيء — إصدار الجوال والسحابية الخالصة
-- ============================================================
-- الغرض: تأكيد أن قاعدة البيانات سليمة ومكتملة وتحمل كل بيانات المشروع
--   1) الجداول الـ 21 موجودة و RLS مفعّل
--   2) الأعمدة الحرجة كلها موجودة
--   3) مسارات الإرسال من الجوال (anon) مفتوحة: تسجيل/نقل/استفسار/اختبار/شرف
--   4) مسار دخول الطالب يعمل: قراءة الطلبات والطلاب والحسابات
--   5) الـ Views سليمة (security_invoker)
--   6) جرد البيانات الفعلي: أين سُجلت بياناتك حتى الآن
--   7) الارتباطات اليتيمة (سلامة البيانات)
--   8) الخلاصة النهائية
-- آمن 100%: قراءة فقط
-- ============================================================

-- ============================================================
-- 1) الجداول + RLS في جدول واحد
-- ============================================================
WITH required(ord, tid, lbl, grp) AS (
  VALUES
    (1,  'grades',                 'الصفوف',                 'أساسي'),
    (2,  'groups',                 'المجموعات',              'أساسي'),
    (3,  'students',               'الطلاب',                 'أساسي'),
    (4,  'dues',                   'الاستحقاقات',            'أساسي'),
    (5,  'payments',               'الدفعات',                'أساسي'),
    (6,  'exams',                  'الاختبارات',             'أساسي'),
    (7,  'exam_attempts',          'محاولات الاختبارات',     'أساسي'),
    (8,  'sessions',               'الحصص',                  'أساسي'),
    (9,  'attendance',             'الحضور',                 'أساسي'),
    (10, 'announcements',          'الإعلانات',              'أساسي'),
    (11, 'honorees',               'لوحة الشرف',             'أساسي'),
    (12, 'shared_files',           'الملفات المشتركة',       'أساسي'),
    (13, 'important_links',        'الروابط المهمة',         'أساسي'),
    (14, 'app_settings',           'الإعدادات',              'أساسي'),
    (15, 'year_archives',          'أرشيف السنوات',          'أساسي'),
    (16, 'manual_grades',          'الدرجات اليدوية',        'بوابة الطالب'),
    (17, 'registration_requests',  'طلبات التسجيل',          'بوابة الطالب'),
    (18, 'group_transfer_requests','طلبات نقل المجموعة',     'بوابة الطالب'),
    (19, 'student_history',        'سجل نشاط الطلاب',        'بوابة الطالب'),
    (20, 'student_accounts',       'حسابات الدخول',          'بوابة الطالب'),
    (21, 'inquiries',              'الاستفسارات',            'بوابة الطالب')
)
SELECT
  r.grp AS "المجموعة",
  r.lbl AS "الجدول",
  CASE WHEN to_regclass('public.' || r.tid) IS NOT NULL THEN '✅' ELSE '❌ ناقص' END AS "الجدول موجود",
  CASE WHEN c.relrowsecurity THEN '✅' ELSE '❌ معطّل' END AS "RLS",
  COALESCE(c.reltuples, 0)::bigint AS "صفوف (تقديري)"
FROM required r
LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || r.tid)
ORDER BY r.ord;

-- ============================================================
-- 2) الأعمدة الحرجة (بها تعطلت رسائل الجوال سابقاً)
-- ============================================================
WITH critical(tbl, col, why) AS (
  VALUES
    ('students',              'email',             'بريد الطالب'),
    ('students',              'inquiry_blocked',   'قفل قناة الاستفسار'),
    ('registration_requests', 'guardian_phone',    'هاتف ولي الأمر — بدونه يفشل كل تسجيل'),
    ('registration_requests', 'password_hash',     'بصمة كلمة المرور'),
    ('registration_requests', 'linked_student_id', 'ربط الطلب بالطالب'),
    ('student_accounts',      'password_hash',     'إعادة تعيين كلمة المرور'),
    ('exam_attempts',         'manual_override',   'تعديل الدرجات يدوياً'),
    ('announcements',         'target_grade_ids',  'استهداف الإعلانات بالصفوف')
)
SELECT
  c.tbl AS "الجدول", c.col AS "العمود", c.why AS "الغرض",
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns x
    WHERE x.table_schema='public' AND x.table_name = c.tbl AND x.column_name = c.col
  ) THEN '✅' ELSE '❌ ناقص — نفّذ 010' END AS "الحالة"
FROM critical c ORDER BY 1;

-- ============================================================
-- 3) مسارات الإرسال من جوال الطالب (GRANT + سياسة INSERT للزائر)
-- ============================================================
WITH paths(tid, lbl) AS (
  VALUES
    ('registration_requests',   'التسجيل من الجوال'),
    ('group_transfer_requests', 'طلب نقل المجموعة'),
    ('inquiries',               'الاستفسار والرد'),
    ('exam_attempts',           'أداء الاختبار الإلكتروني'),
    ('honorees',                'ترشيح لوحة الشرف التلقائي')
)
SELECT
  p.lbl AS "المسار",
  CASE WHEN has_table_privilege('anon', 'public.' || p.tid, 'INSERT')
       THEN '✅' ELSE '❌ مقفول' END AS "صلاحية الإدراج",
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies pol
    WHERE pol.schemaname='public' AND pol.tablename = p.tid
      AND pol.cmd='INSERT' AND 'anon' = ANY(pol.roles)
  ) THEN '✅' ELSE '❌ ناقصة' END AS "سياسة RLS",
  CASE WHEN has_table_privilege('anon', 'public.' || p.tid, 'INSERT')
        AND EXISTS (
    SELECT 1 FROM pg_policies pol
    WHERE pol.schemaname='public' AND pol.tablename = p.tid
      AND pol.cmd='INSERT' AND 'anon' = ANY(pol.roles)
  ) THEN 'يعمل من الجوال ✅' ELSE 'معطّل ❌ — نفّذ 012' END AS "النتيجة"
FROM paths p ORDER BY 1;

-- ============================================================
-- 4) مسار دخول الطالب من الجوال: قراءة ما يحتاجه (وليس أكثر)
-- ============================================================
WITH reads(tid, lbl) AS (
  VALUES
    ('registration_requests', 'يقرأ طلبه لتسجيل الدخول'),
    ('students',              'يقرأ بياناته وتقاريره'),
    ('student_accounts',      'يقرأ حالة حسابه'),
    ('inquiries',             'يقرأ استفساره ورد المعلم')
)
-- حد المحاولات ونتائج الاختبارات لا يقرآن من جدول/عرض عام بعد 015:
-- start_online_exam_session يفرض الحد، وget_online_exam_result يحتاج سر الجلسة.

SELECT
  r.lbl AS "المسار",
  r.tid AS "الجدول/العرض",
  CASE WHEN to_regclass('public.' || r.tid) IS NOT NULL
        AND has_table_privilege('anon', 'public.' || r.tid, 'SELECT')
       THEN '✅ يعمل' ELSE '❌ مقفول — نفّذ 010/012' END AS "الحالة للزائر"
FROM reads r ORDER BY 1;

-- ============================================================
-- 5) الـ Views (تنبيه Linter) + سياسات الزوار على القراءة الواسعة
-- ============================================================
SELECT
  c.relname AS "العرض",
  CASE WHEN (c.reloptions::text LIKE '%security_invoker=on%' OR c.reloptions::text LIKE '%security_invoker=true%')
       THEN '✅ آمن' ELSE '⚠️ نفّذ 011' END AS "security_invoker"
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
ORDER BY 1;

-- ============================================================
-- 6) جرد بياناتك الفعلي — أين سُجل كل شيء حتى الآن
-- ============================================================
SELECT 'grades' AS "الجدول", count(*) AS "عدد" FROM grades
UNION ALL SELECT 'groups', count(*) FROM groups
UNION ALL SELECT 'students', count(*) FROM students
UNION ALL SELECT 'student_accounts', count(*) FROM student_accounts
UNION ALL SELECT 'registration_requests', count(*) FROM registration_requests
UNION ALL SELECT '  ↳ قيد المراجعة', count(*) FROM registration_requests WHERE status='pending'
UNION ALL SELECT '  ↳ معتمدة', count(*) FROM registration_requests WHERE status='approved'
UNION ALL SELECT 'group_transfer_requests', count(*) FROM group_transfer_requests
UNION ALL SELECT 'inquiries', count(*) FROM inquiries
UNION ALL SELECT 'manual_grades', count(*) FROM manual_grades
UNION ALL SELECT 'exam_attempts', count(*) FROM exam_attempts
UNION ALL SELECT 'dues', count(*) FROM dues
UNION ALL SELECT 'payments', count(*) FROM payments
UNION ALL SELECT 'attendance', count(*) FROM attendance
UNION ALL SELECT 'announcements', count(*) FROM announcements
UNION ALL SELECT 'honorees', count(*) FROM honorees
UNION ALL SELECT 'sessions', count(*) FROM sessions
UNION ALL SELECT 'student_history', count(*) FROM student_history
ORDER BY 1;

-- بريد الطلاب المعتمدين — الإثبات المباشر أن البريد في Supabase
SELECT
  rr.name AS "الطالب",
  rr.email AS "البريد المسجل في القاعدة",
  rr.status AS "حالة الطلب",
  CASE WHEN s.id IS NOT NULL THEN '✅' ELSE '❌' END AS "مربوط بطالب",
  CASE WHEN a.id IS NOT NULL THEN '✅' ELSE '❌ لا حساب' END AS "له حساب دخول",
  CASE WHEN COALESCE(s.email,'') <> '' THEN '✅ ' || s.email ELSE '❌ فارغ' END AS "بريد جدول الطلاب"
FROM registration_requests rr
LEFT JOIN students s ON s.id = rr.linked_student_id
LEFT JOIN student_accounts a ON lower(a.email) = lower(rr.email)
ORDER BY rr.created_at DESC
LIMIT 20;

-- ============================================================
-- 7) الارتباطات اليتيمة (سلامة) — تبويب Messages
-- ============================================================
DO $$
DECLARE cnt BIGINT; total BIGINT := 0;
BEGIN
  IF to_regclass('public.students') IS NOT NULL AND to_regclass('public.grades') IS NOT NULL THEN
    SELECT count(*) INTO cnt FROM students s LEFT JOIN grades g ON g.id = s.grade_id WHERE s.grade_id IS NOT NULL AND g.id IS NULL;
    total := total + cnt; RAISE NOTICE 'طلاب بصف مفقود: % %', cnt, CASE WHEN cnt=0 THEN '✅' ELSE '❌' END;
  END IF;
  IF to_regclass('public.students') IS NOT NULL AND to_regclass('public.groups') IS NOT NULL THEN
    SELECT count(*) INTO cnt FROM students s LEFT JOIN groups g ON g.id = s.group_id WHERE s.group_id IS NOT NULL AND g.id IS NULL;
    total := total + cnt; RAISE NOTICE 'طلاب بمجموعة مفقودة: % %', cnt, CASE WHEN cnt=0 THEN '✅' ELSE '❌' END;
  END IF;
  IF to_regclass('public.dues') IS NOT NULL AND to_regclass('public.students') IS NOT NULL THEN
    SELECT count(*) INTO cnt FROM dues d LEFT JOIN students s ON s.id = d.student_id WHERE s.id IS NULL;
    total := total + cnt; RAISE NOTICE 'استحقاقات بلا طالب: % %', cnt, CASE WHEN cnt=0 THEN '✅' ELSE '❌' END;
  END IF;
  IF to_regclass('public.payments') IS NOT NULL AND to_regclass('public.students') IS NOT NULL THEN
    SELECT count(*) INTO cnt FROM payments p LEFT JOIN students s ON s.id = p.student_id WHERE s.id IS NULL;
    total := total + cnt; RAISE NOTICE 'دفعات بلا طالب: % %', cnt, CASE WHEN cnt=0 THEN '✅' ELSE '❌' END;
  END IF;
  IF to_regclass('public.exam_attempts') IS NOT NULL AND to_regclass('public.exams') IS NOT NULL THEN
    SELECT count(*) INTO cnt FROM exam_attempts a LEFT JOIN exams e ON e.id = a.exam_id WHERE e.id IS NULL;
    total := total + cnt; RAISE NOTICE 'محاولات بلا اختبار: % %', cnt, CASE WHEN cnt=0 THEN '✅' ELSE '❌' END;
  END IF;
  IF to_regclass('public.inquiries') IS NOT NULL AND to_regclass('public.students') IS NOT NULL THEN
    SELECT count(*) INTO cnt FROM inquiries q LEFT JOIN students s ON s.id = q.student_id WHERE s.id IS NULL;
    total := total + cnt; RAISE NOTICE 'استفسارات بطالب مفقود: % %', cnt, CASE WHEN cnt=0 THEN '✅' ELSE '❌' END;
  END IF;
  RAISE NOTICE 'إجمالي اليتيمة: % %', total, CASE WHEN total=0 THEN '✅' ELSE '❌' END;
END $$;

-- ============================================================
-- 8) الخلاصة النهائية — تبويب Messages
-- ============================================================
DO $$
DECLARE
  mt INT := 0; mc INT := 0; bad_paths INT := 0; rls_off INT := 0;
BEGIN
  SELECT count(*) INTO mt FROM (
    VALUES ('grades'),('groups'),('students'),('dues'),('payments'),('exams'),
           ('exam_attempts'),('sessions'),('attendance'),('announcements'),('honorees'),
           ('shared_files'),('important_links'),('app_settings'),('year_archives'),
           ('manual_grades'),('registration_requests'),('group_transfer_requests'),
           ('student_history'),('student_accounts'),('inquiries')
  ) t(tid) WHERE to_regclass('public.' || tid) IS NULL;

  SELECT count(*) INTO mc FROM (
    VALUES ('students','email'),('students','inquiry_blocked'),
           ('registration_requests','guardian_phone'),('registration_requests','linked_student_id'),
           ('student_accounts','password_hash'),('exam_attempts','manual_override'),
           ('announcements','target_grade_ids')
  ) t(tbl,col) WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name = t.tbl AND c.column_name = t.col);

  SELECT count(*) INTO bad_paths FROM (
    VALUES ('registration_requests'),('group_transfer_requests'),('inquiries'),('exam_attempts'),('honorees')
  ) p(tid)
  WHERE NOT has_table_privilege('anon', 'public.' || p.tid, 'INSERT');

  SELECT count(*) INTO rls_off FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;

  RAISE NOTICE '==================================================';
  IF mt = 0 AND mc = 0 AND bad_paths = 0 AND rls_off = 0 THEN
    RAISE NOTICE '✅✅✅ Supabase سليم بالكامل ويحمل كل بيانات المشروع ✅✅✅';
    RAISE NOTICE 'كل الجداول (21) + الأعمدة الحرجة + مسارات الجوال الخمسة + RLS على كل الجداول';
    RAISE NOTICE 'المشروع يعمل سحابياً: تسجيل من الجوال → قاعدة البيانات مباشرة';
  ELSE
    RAISE NOTICE '❌ نواقص: % جدول / % عمود / % مسار جوال / % جدول بلا RLS', mt, mc, bad_paths, rls_off;
    RAISE NOTICE 'الحل بالترتيب: نفّذ 010_repair_align.sql ثم 011 ثم 012 ثم أعد هذا الفحص';
  END IF;
  RAISE NOTICE '==================================================';
END $$;
