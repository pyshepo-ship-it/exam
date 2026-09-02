-- ============================================================
-- تحديث 004: إصلاح خطأ "permission denied for table app_settings"
--
-- سبب الخطأ:
--   خطأ "permission denied" ليس خطأ في سياسات RLS، بل في صلاحيات
--   الجدول نفسه (GRANT). يحدث عندما تُنشأ الجداول بواسطة دور لا
--   تنطبق عليه الصلاحيات الافتراضية لأدوار Supabase (anon / authenticated).
--   في هذه الحالة يُرفض الوصول قبل أن تُفحص سياسات RLS أصلاً.
--
-- الحل: منح الصلاحيات صراحةً لأدوار Supabase على كل الجداول.
--   الأمان محفوظ: RLS ما زالت مفعّلة، والسياسات هي التي تحدد
--   من يقرأ ومن يكتب فعلياً.
--
-- طريقة التشغيل:
--   Supabase → SQL Editor → الصق هذا الملف كاملاً → Run
--   (آمن تماماً: لا يمسح ولا يعدّل أي بيانات)
-- ============================================================

BEGIN;

-- 1) السماح باستخدام المخطط public
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2) صلاحيات كاملة للمستخدم المسجّل دخوله (المدير)
--    RLS هي التي تحكم الوصول الفعلي بعد ذلك
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- 3) صلاحية قراءة فقط للزوار (الصفحة الرئيسية العامة)
--    سياسات "public read ..." تحدد أي الجداول تُقرأ فعلياً
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 4) صلاحيات كاملة لدور الخدمة (للنسخ الاحتياطي والأدوات الإدارية)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 5) صلاحيات افتراضية لأي جدول يُنشأ مستقبلاً (حتى لا يتكرر الخطأ)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon;

-- ============================================================
-- 6) التأكد من أن جدول app_settings موجود وسياساته صحيحة
--    (تكرار آمن — لا يؤثر على البيانات الموجودة)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access" ON app_settings;
CREATE POLICY "authenticated full access" ON app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read app_settings" ON app_settings;
CREATE POLICY "public read app_settings" ON app_settings
  FOR SELECT TO anon, authenticated USING (true);

GRANT ALL PRIVILEGES ON TABLE app_settings TO authenticated, service_role;
GRANT SELECT ON TABLE app_settings TO anon;

COMMIT;

-- ============================================================
-- 7) للتحقق بعد التشغيل — شغّل هذا الاستعلام وتأكد من ظهور
--    الصلاحيات لكل من anon و authenticated:
--
--   SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_name = 'app_settings'
--   ORDER BY grantee, privilege_type;
--
-- ثم ارجع إلى الإعدادات في التطبيق واضغط "إعادة الفحص"
-- ============================================================
