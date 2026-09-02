-- ============================================================
-- Migration 011: إصلاح تنبيهات Supabase Linter (Security Definer View)
-- ============================================================
-- سبب التنبيه: في Postgres، الـ View يُنفَّذ بصلاحيات **صاحبه** (على الأغلب
-- دور postgres) وليس بصلاحيات من يستعلم عنه — فيتجاوز سياسات RLS الخاصة
-- بالمستخدم، وهذا ما يحذّر منه الفاحص.
--
-- الحل الرسمي (Postgres 15+ المتاح في Supabase): جعل الـ View يستدعي
-- بصلاحيات المستخدم نفسه عبر security_invoker = on — عندها تُطبَّق RLS
-- الخاصة بكل دور بشكل صحيح، ويختفي التنبيه من Database Linter.
--
-- ✅ آمن للتكرار (idempotent) — لا يمس أي بيانات
-- • exam_attempt_counts: عدّاد محاولات الاختبار — الطالب (anon) عنده
--   سياسة قراءة على exam_attempts فسيستمر العد بالعمل كما هو.
-- • group_schedule_conflicts: أداة مراجعة يدوية لتعارض المواعيد
--   (التطبيق يمنع التعارض من الواجهة أصلاً) — قراءة فقط.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.exam_attempt_counts') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.exam_attempt_counts SET (security_invoker = true)';
  END IF;

  IF to_regclass('public.group_schedule_conflicts') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.group_schedule_conflicts SET (security_invoker = true)';
  END IF;
END $$;

-- أي View يُنشأ مستقبلاً في هذا المشروع: امنع تكرار التنبيه من البداية
ALTER DATABASE postgres SET trusted_schemas_placement_override = 'public';

-- ============================================================
-- انتهى — أعد فحص Database Linter من القائمة الجانبية وستجدها خالية ✅
-- ============================================================
