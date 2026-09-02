-- ============================================================
-- Migration 012: إصلاح نهائي لمسار الإرسال من أجهزة الطلاب والزوار
-- ============================================================
-- لماذا هذا الملف؟
--   ملف 004 القديم كان يمنح الزوار (anon) «قراءة فقط» على كل الجداول،
--   وقد صدر **قبل** إنشاء جداول البوابة (طلبات التسجيل/النقل/الاستفسارات/
--   محاولات الاختبارات) — لذلك لا يكفي وحده أبداً، ورسالة الخطأ القديمة
--   في التطبيق كانت توجه إليه خطأً.
--
-- ماذا يفعل هذا الملف؟
--   1) يمنح الزوار قراءة + إدراج على جداول «التقديم» الخمسة فقط
--      (لا تحديث ولا حذف — الطالب لا يستطيع تعديل أو مسح ما أرسله)
--   2) يعيد إنشاء سياسات RLS لهذه الصلاحيات بشكل صريح ونظيف
--   3) يتأكد أن المدرس (authenticated) يملك كل الصلاحيات على كل الجداول
--   4) يطبع في الأسفل تقريراً واضحاً بالحالة النهائية — تبويب Messages
--
-- ✅ آمن للتكرار (idempotent) — لا يمس أي بيانات
-- ============================================================

-- ------------------------------------------------------------
-- 1) صلاحيات الزوار على جداول التقديم
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  submit_tables TEXT[] := ARRAY[
    'registration_requests',   -- طلبات التسجيل (مشكلتك الحالية)
    'group_transfer_requests', -- طلبات نقل المجموعة
    'inquiries',               -- الاستفسارات
    'exam_attempts',           -- أداء الاختبارات الإلكترونية
    'honorees'                 -- ترشيح لوحة الشرف التلقائي
  ];
BEGIN
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  FOREACH t IN ARRAY submit_tables LOOP
    -- الزوار: يقرأون ويضيفون فقط
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', t);
    EXECUTE format('GRANT INSERT ON TABLE public.%I TO anon', t);
    -- لا UPDATE ولا DELETE للزوار — عمداً

    -- المدرس: كل الصلاحيات (تأكيد إضافي)
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;

  -- صلاحيات المدرس الكاملة على بقية الجداول (تأكيد شامل)
  FOREACH t IN ARRAY ARRAY[
    'grades','groups','students','dues','payments','exams','sessions','attendance',
    'announcements','shared_files','important_links','year_archives','app_settings',
    'manual_grades','student_history','student_accounts'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;

  IF to_regclass('public.exam_attempt_counts') IS NOT NULL THEN
    GRANT SELECT ON public.exam_attempt_counts TO anon, authenticated;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2) سياسات RLS الصريحة لجداول التقديم
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  submit_tables TEXT[] := ARRAY[
    'registration_requests','group_transfer_requests','inquiries',
    'exam_attempts','honorees'
  ];
BEGIN
  FOREACH t IN ARRAY submit_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      -- المدرس: كل شيء
      EXECUTE format('DROP POLICY IF EXISTS "teacher full access" ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY "teacher full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);

      -- الزوار: قراءة
      EXECUTE format('DROP POLICY IF EXISTS "public read" ON public.%I', t);
      EXECUTE format('CREATE POLICY "public read" ON public.%I FOR SELECT TO anon USING (true)', t);

      -- الزوار: إدراج فقط
      EXECUTE format('DROP POLICY IF EXISTS "public insert" ON public.%I', t);
      EXECUTE format('CREATE POLICY "public insert" ON public.%I FOR INSERT TO anon WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3) تقرير الحالة النهائية — تبويب Messages
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  ok BOOLEAN := TRUE;
  n INT;
BEGIN
  RAISE NOTICE '========== تقرير 012: مسار الإرسال من أجهزة الطلاب ==========';
  FOREACH t IN ARRAY ARRAY[
    'registration_requests','group_transfer_requests','inquiries',
    'exam_attempts','honorees'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '❌ الجدول % غير موجود — نفّذ 010_repair_align.sql أولاً', t;
      ok := FALSE;
      CONTINUE;
    END IF;
    SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename=t AND cmd='INSERT' AND 'anon' = ANY(roles);
    IF has_table_privilege('anon', 'public.' || t, 'INSERT') AND n > 0 THEN
      RAISE NOTICE '✅ % : الزوار يستطيعون الإرسال (GRANT + سياسة RLS)', t;
    ELSE
      RAISE NOTICE '❌ % : ما زال الإدراج مقفولاً (GRANT: % / سياسة: %)', t,
        has_table_privilege('anon', 'public.' || t, 'INSERT'), n;
      ok := FALSE;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  IF ok THEN
    RAISE NOTICE '✅✅✅ كل جداول التقديم مفتوحة للإرسال — ارجع للتطبيق وأعد المحاولة';
    RAISE NOTICE 'ملاحظة لو استمر الخطأ من نفس الجهاز: سجّل خروج ثم دخول (تحديث الجلسة)';
  ELSE
    RAISE NOTICE '❌ يوجد نواقص أعلاه — شغّل 010_repair_align.sql ثم 012 مرة أخرى';
  END IF;
END $$;

-- ============================================================
-- انتهى
-- ============================================================
