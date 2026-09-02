-- ============================================================
-- Migration 009: بوابة الطالب — المرحلة الثانية
-- يُنفَّذ يدوياً في Supabase SQL Editor (آمن للتكرار — idempotent)
--
-- يضيف:
--   1) announcements.target_grade_ids   — استهداف الإعلان/السؤال المهم بصفوف محددة (null = عام)
--   2) registration_requests.guardian_phone — هاتف ولي الأمر (إجباري في التطبيق)
--   3) exam_attempts.manual_override    — تعديل يدوي من المعلم لدرجة الاختبار الآلي
--   4) جدول inquiries                   — استفسار طالب واحد ورد المعلم (غير محادثة مفتوحة)
--
-- ملاحظة: إتاحة الاختبار الزمنية + المجموعات المستهدفة + إظهار الإجابات
-- تُحفظ داخل عمود questions (JSONB) الموجود في جدول exams — لا تحتاج أعمدة جديدة.
-- ============================================================

-- 1) استهداف الإعلانات بالصفوف
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS target_grade_ids JSONB;

-- 2) هاتف ولي الأمر في طلبات التسجيل
ALTER TABLE registration_requests
  ADD COLUMN IF NOT EXISTS guardian_phone TEXT;

-- كلمة المرور بصمة SHA-256 (إعادة التعيين من المعلم)
ALTER TABLE student_accounts
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- إغلاق قناة الاستفسار لطالب معيّن (قرار المعلم)
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS inquiry_blocked BOOLEAN DEFAULT FALSE;

-- عدّاد محاولات الاختبار للعموم: معرفات فقط بدون إجابات أو درجات
-- (يُستخدم لفرض حد عدد مرات الاجتياز عبر الأجهزة)
CREATE OR REPLACE VIEW public.exam_attempt_counts AS
  SELECT exam_id, student_id, count(*)::int AS attempts
  FROM exam_attempts
  WHERE student_id IS NOT NULL
  GROUP BY exam_id, student_id;
GRANT SELECT ON public.exam_attempt_counts TO anon, authenticated;

-- 3) التعديل اليدوي لدرجة الاختبار
ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS manual_override JSONB;

-- 4) جدول الاستفسارات
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

ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full inquiries" ON inquiries;
CREATE POLICY "authenticated full inquiries" ON inquiries
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon read inquiries" ON inquiries;
CREATE POLICY "anon read inquiries" ON inquiries
  FOR SELECT TO anon
  USING (true);

-- الطالب (زائر بدون حساب) يستطيع إرسال استفساره فقط — لا تحديث ولا حذف
DROP POLICY IF EXISTS "anon insert inquiries" ON inquiries;
CREATE POLICY "anon insert inquiries" ON inquiries
  FOR INSERT TO anon
  WITH CHECK (true);

GRANT SELECT, INSERT ON TABLE inquiries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inquiries TO authenticated;
GRANT ALL ON TABLE inquiries TO service_role;
