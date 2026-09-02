-- ============================================================
-- ✅ فحص سريع: هل كل الجداول موجودة في Supabase؟
-- الصقه في SQL Editor → Run — قراءة فقط، آمن 100%
-- ============================================================

-- 1) جدول الجداول الـ 21 وحالتها
WITH required(ord, tid, lbl) AS (
  VALUES
    (1,  'grades',                  'الصفوف'),
    (2,  'groups',                  'المجموعات'),
    (3,  'students',                'الطلاب'),
    (4,  'dues',                    'الاستحقاقات'),
    (5,  'payments',                'الدفعات'),
    (6,  'exams',                   'الاختبارات'),
    (7,  'exam_attempts',           'محاولات الاختبارات'),
    (8,  'sessions',                'الحصص'),
    (9,  'attendance',              'الحضور'),
    (10, 'announcements',           'الإعلانات'),
    (11, 'honorees',                'لوحة الشرف'),
    (12, 'shared_files',            'الملفات المشتركة'),
    (13, 'important_links',         'الروابط المهمة'),
    (14, 'app_settings',            'الإعدادات'),
    (15, 'year_archives',           'أرشيف السنوات'),
    (16, 'manual_grades',           'الدرجات اليدوية'),
    (17, 'registration_requests',   'طلبات التسجيل'),
    (18, 'group_transfer_requests', 'طلبات نقل المجموعة'),
    (19, 'student_history',         'سجل نشاط الطلاب'),
    (20, 'student_accounts',        'حسابات الدخول'),
    (21, 'inquiries',               'الاستفسارات')
)
SELECT
  r.ord AS "#",
  r.lbl AS "الجدول",
  r.tid AS "اسم الجدول",
  CASE WHEN to_regclass('public.' || r.tid) IS NOT NULL THEN '✅ موجود' ELSE '❌ ناقص' END AS "الحالة",
  CASE WHEN c.relrowsecurity THEN '✅ مفعّل' ELSE '❌ معطّل' END AS "RLS",
  COALESCE(c.reltuples, 0)::bigint AS "صفوف (تقديري)"
FROM required r
LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || r.tid)
ORDER BY r.ord;

-- 2) الخلاصة بسطر واحد
WITH required(tid) AS (
  VALUES ('grades'),('groups'),('students'),('dues'),('payments'),('exams'),
         ('exam_attempts'),('sessions'),('attendance'),('announcements'),('honorees'),
         ('shared_files'),('important_links'),('app_settings'),('year_archives'),
         ('manual_grades'),('registration_requests'),('group_transfer_requests'),
         ('student_history'),('student_accounts'),('inquiries')
)
SELECT
  count(*) FILTER (WHERE to_regclass('public.' || tid) IS NOT NULL) AS "موجود",
  count(*) FILTER (WHERE to_regclass('public.' || tid) IS NULL)     AS "ناقص",
  CASE
    WHEN count(*) FILTER (WHERE to_regclass('public.' || tid) IS NULL) = 0
    THEN '✅ كل الجداول الـ 21 موجودة وسليمة'
    ELSE '❌ جداول ناقصة — راجع القائمة أعلاه ونفّذ المايجريشن الناقص'
  END AS "الخلاصة"
FROM required;
