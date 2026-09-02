-- ============================================================
-- تحديث 003: قراءة عامة لإعدادات الموقع (رقم الواتساب)
-- شغّله في Supabase → SQL Editor → Run
-- (آمن: لا يمسح أي بيانات)
-- ============================================================

DROP POLICY IF EXISTS "public read app_settings" ON app_settings;
CREATE POLICY "public read app_settings" ON app_settings FOR SELECT TO anon, authenticated USING (true);
