-- ============================================================
-- 007: دعم نشر جدول المواعيد للطلاب (schedulePublished)
-- ============================================================
-- كيفية التشغيل (اختياري — التطبيق يعمل بدونها في معظم الحالات):
--   Supabase Dashboard → SQL Editor → New query
--   → الصق هذا الكود كاملاً → Run
--
-- ✅ آمن 100% عند إعادة التشغيل: كل الأوامر IF NOT EXISTS / DROP+CREATE POLICY
--    ولا يحذف ولا يعدّل أي بيانات.
--
-- ما يفعله:
--   1) التأكد من أعمدة مواعيد المجموعات (days / start_time / end_time)
--      اللازمة لعرض الجدول المنشور للطلاب في الصفحة الرئيسية.
--   2) التأكد من وجود جدول الإعدادات app_settings مع سياسة القراءة العامة،
--      لأن مفتاح (schedulePublished) الذي يتحكم في نشر الجدول يُحفظ فيه،
--      وكذلك (teacherName / teacherSignatureLine) لتوقيع الجدول المطبوع.
--   3) منح صلاحيات القراءة للزوار (anon) على جدول المجموعات.
--   4) إنشاء View اختياري لكشف أي تعارضات مواعيد قديمة موجودة بالفعل
--      في قاعدة البيانات (مجموعتان في نفس اليوم والوقت).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) أعمدة مواعيد المجموعات (موجودة افتراضياً — إضافة احترازية للمخططات القديمة)
-- ------------------------------------------------------------
ALTER TABLE groups ADD COLUMN IF NOT EXISTS days JSONB NOT NULL DEFAULT '[]';
ALTER TABLE groups ADD COLUMN IF NOT EXISTS start_time TEXT NOT NULL DEFAULT '';
ALTER TABLE groups ADD COLUMN IF NOT EXISTS end_time TEXT NOT NULL DEFAULT '';
ALTER TABLE groups ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS students_count INTEGER NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- 2) جدول الإعدادات (مفتاح schedulePublished + اسم المعلم) وسياساته
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access" ON app_settings;
CREATE POLICY "authenticated full access" ON app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read app_settings" ON app_settings;
CREATE POLICY "public read app_settings" ON app_settings
  FOR SELECT TO anon, authenticated USING (true);

-- ------------------------------------------------------------
-- 3) الصلاحيات: الزوار يقرأون المجموعات والإعدادات، والمصادقون يكتبون
-- ------------------------------------------------------------
GRANT SELECT ON TABLE groups TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE groups TO authenticated, service_role;
GRANT SELECT ON TABLE app_settings TO anon;
GRANT ALL PRIVILEGES ON TABLE app_settings TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4) فحص التعارضات القديمة (اختياري للمراجعة فقط)
--    يعرض أي مجموعتين تشتركان في يوم واحد بتقاطع في الوقت —
--    التطبيق يمنع هذا الازدواج تلقائياً من الآن فصاعداً، وهذا
--    الاستعلام فقط لكشف ما قد يكون موجوداً من قبل.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW group_schedule_conflicts AS
SELECT
  g1.name AS group_1,
  gr1.name AS grade_1,
  g2.name AS group_2,
  gr2.name AS grade_2,
  d1.value AS shared_day,
  g1.start_time AS start_1,
  g1.end_time   AS end_1,
  g2.start_time AS start_2,
  g2.end_time   AS end_2
FROM groups g1
JOIN grades gr1 ON gr1.id = g1.grade_id
JOIN groups g2 ON g2.id > g1.id
JOIN grades gr2 ON gr2.id = g2.grade_id
CROSS JOIN LATERAL jsonb_array_elements_text(g1.days) d1
JOIN LATERAL jsonb_array_elements_text(g2.days) d2 ON d2.value = d1.value
WHERE g1.start_time <> '' AND g1.end_time <> ''
  AND g2.start_time <> '' AND g2.end_time <> ''
  AND g1.start_time < g2.end_time
  AND g2.start_time < g1.end_time;

-- للاستخدام اليدوي لاحقاً:
--   SELECT * FROM group_schedule_conflicts;
-- (نتيجة فارغة = لا توجد أي تعارضات محفوظة في قاعدة البيانات)

COMMIT;
