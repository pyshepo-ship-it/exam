-- ============================================================
-- 025_lock_private_tables_and_harden_functions.sql
--
-- نتيجة تدقيق شامل لقاعدة البيانات المنشورة (لا يخص تعديلاً بعينه):
--
-- (1) ثغرة قراءة عامة: الجداول students / attendance / dues / payments كانت
--     تحمل سياسة "public read" بقيمة true للدور anon **مع منح SELECT فعلي**،
--     أي أن أي شخص يملك مفتاح anon العلني (وهو ظاهر في صفحات الموقع) يستطيع
--     سحب أسماء الطلاب وأرقام هواتفهم وحضورهم واستحقاقاتهم ومدفوعاتهم من دون
--     تسجيل دخول. لا يحتاجها أي مسار زائر في التطبيق: لوحة المعلم تعمل بدور
--     authenticated (Supabase Auth)، وبوابة الطالب تقرأ بياناته وحده عبر
--     get_student_portal_data بسرّ جلسته.
--
-- (2) سياسة "public read" على exams بقيت حيّة بعد 015 (أمر الحذف هناك استهدف
--     اسمًا آخر) — المنح ملغى فبقيت بلا أثر، لكنها تعود للعمل لحظة منح SELECT
--     يومًا ما. تُسقط هنا نهائيًا.
--
-- (3) تصليب الدوال: search_path مثبّت لكل دالة (مع pg_temp في آخر المسار حتى
--     لا يُبحث في الجداول المؤقتة أولاً)، وسحب EXECUTE عن anon من دوال
--     المُشغِّلات والدوال الداخلية التي لا يناديها عميل إطلاقًا.
--
-- ما لا يتغير: قراءة grades / groups / announcements / honorees /
-- shared_files / important_links / app_settings تبقى عامة (محتوى معلن يحتاجه
-- الزائر وجهاز الطالب قبل الدخول)، وكل دوال RPC تبقى كما هي.
--
-- آمن للتشغيل أكثر من مرة.
-- ============================================================

-- ------------------------------------------------------------
-- 1) إغلاق القراءة العامة عن الجداول الخاصة
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "public read" ON public.students;
DROP POLICY IF EXISTS "public read" ON public.attendance;
DROP POLICY IF EXISTS "public read" ON public.dues;
DROP POLICY IF EXISTS "public read" ON public.payments;
DROP POLICY IF EXISTS "public read students" ON public.students;
DROP POLICY IF EXISTS "public read attendance" ON public.attendance;
DROP POLICY IF EXISTS "public read dues" ON public.dues;
DROP POLICY IF EXISTS "public read payments" ON public.payments;

REVOKE SELECT ON TABLE public.students   FROM anon;
REVOKE SELECT ON TABLE public.attendance FROM anon;
REVOKE SELECT ON TABLE public.dues       FROM anon;
REVOKE SELECT ON TABLE public.payments   FROM anon;

-- ومن PUBLIC أيضًا: منح قديم لـ PUBLIC يرث إليه anon تلقائيًا فيبطل السحب أعلاه
REVOKE SELECT ON TABLE public.students   FROM PUBLIC;
REVOKE SELECT ON TABLE public.attendance FROM PUBLIC;
REVOKE SELECT ON TABLE public.dues       FROM PUBLIC;
REVOKE SELECT ON TABLE public.payments   FROM PUBLIC;

-- سياسة ميتة من قبل 015: تُسقط كي لا تحيا بمنح مستقبلي
DROP POLICY IF EXISTS "public read" ON public.exams;
REVOKE SELECT ON TABLE public.exams FROM anon;
REVOKE SELECT ON TABLE public.exams FROM PUBLIC;

-- ------------------------------------------------------------
-- 2) تثبيت search_path على كل دالة (pg_temp في النهاية دائمًا)
-- ------------------------------------------------------------
ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.change_student_password(TEXT, TEXT, TEXT, TEXT)
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_student_inquiries(TEXT)
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_student_portal_data(TEXT)
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.student_login(TEXT, TEXT, TEXT)
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.student_logout(TEXT)
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.student_register(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.surveys_for_student(TEXT)
  SET search_path = public, extensions, pg_temp;

-- ------------------------------------------------------------
-- 3) سحب EXECUTE عن anon من الدوال الداخلية ودوال المُشغِّلات
--    (المُشغِّل يُنفَّذ بصلاحية مالك الجدول، وفحص EXECUTE يقع عند إنشاء
--     المُشغِّل لا عند كل صف — فالسحب لا يعطّل شيئًا)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.update_updated_at_column()  FROM anon;
REVOKE ALL ON FUNCTION public.survey_response_protect()   FROM anon;
REVOKE ALL ON FUNCTION public.survey_touch_version()      FROM anon;
REVOKE ALL ON FUNCTION public.survey_norm_phone(TEXT)     FROM anon;
REVOKE ALL ON FUNCTION public.rls_auto_enable()           FROM anon, authenticated;

-- ------------------------------------------------------------
-- 4) فحص تثبيت: يرفض الترحيل إن بقي أي منفذ قراءة عامة
-- ------------------------------------------------------------
DO $$
DECLARE
  v_tbl TEXT;
  v_bad TEXT := '';
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['students', 'attendance', 'dues', 'payments', 'exams'] LOOP
    IF has_table_privilege('anon', 'public.' || v_tbl, 'SELECT') THEN
      v_bad := v_bad || v_tbl || ' (منح SELECT) ';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = v_tbl
         AND cmd IN ('SELECT', 'ALL')
         AND ('anon' = ANY (roles) OR 'public' = ANY (roles))
    ) THEN
      v_bad := v_bad || v_tbl || ' (سياسة قراءة anon) ';
    END IF;
  END LOOP;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'ما زالت هناك قراءة عامة على جداول خاصة: %', v_bad;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proconfig IS NULL
  ) THEN
    RAISE EXCEPTION 'توجد دالة في public بلا search_path مثبّت';
  END IF;
END;
$$;
