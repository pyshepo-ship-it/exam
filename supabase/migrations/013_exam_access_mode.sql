-- ============================================================
-- Migration 013: وضع فتح الاختبار الإلكتروني
--   (للأعضاء المسجلين فقط  /  مفتوح لأي أحد بدون تسجيل)
-- ============================================================
-- لماذا هذا الملف؟
--   أصبح للمعلم اختيار من يستطيع فتح كل اختبار إلكتروني:
--     • members (الافتراضي): الطالب المسجَّل الدخول فقط — يظهر له الاختبار
--       في بوابته حسب صفه، وبياناته (الاسم/الصف/المجموعة) تُعبأ تلقائياً
--       من حسابه فلا يملأ شيئاً ويجيب عن الأسئلة فقط.
--     • public: مفتوح للجميع بدون تسجيل — يظهر في لوحة الإعلانات (الصفحة
--       الرئيسية) أو برابط مباشر، ويُدخل الزائر اسمه ورقم هاتفه (إجباريان)،
--       والصف ثابت من إعداد الاختبار، ويختار مجموعته من مجموعات صفه المتاحة.
--
-- ماذا يفعل هذا الملف؟
--   1) إعداد accessMode نفسه يُحفظ داخل JSONB الأسئلة في جدول exams
--      (نفس أسلوب allowOnline / maxAttempts / reviewOpen) → **لا يحتاج عموداً**
--   2) يضيف عمود phone إلى exam_attempts لحفظ رقم هاتف الزائر
--   3) فهرس يسرّع عدّ محاولات الزائر (حد المحاولات عبر الأجهزة)
--   4) يؤكد صلاحيات الزوار (قراءة + إدراج) على exam_attempts كما في 012
--   5) يطبع تقريراً بالحالة النهائية في تبويب Messages
--
-- ✅ آمن للتكرار (idempotent) — لا يمس أي بيانات ولا يحذف شيئاً
-- ملاحظة: التطبيق يعمل أيضاً بدون هذا الملف (يتجاهل عمود phone تلقائياً
--         إن لم يكن موجوداً) — لكن شغّله حتى يصلك رقم هاتف كل زائر.
-- ============================================================

-- ------------------------------------------------------------
-- 1) عمود رقم هاتف الزائر في محاولات الاختبار
-- ------------------------------------------------------------
ALTER TABLE public.exam_attempts ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN public.exam_attempts.phone IS
  'رقم هاتف الزائر في الاختبارات المفتوحة للجميع (accessMode = public) — فارغ لمحاولات الأعضاء المسجلين';

-- ------------------------------------------------------------
-- 2) فهرس لعدّ محاولات الزائر (بلا حساب) في اختبار واحد
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_exam_attempts_guest
  ON public.exam_attempts (exam_id, student_name, group_id)
  WHERE student_id IS NULL;

-- ------------------------------------------------------------
-- 3) تأكيد صلاحيات الزوار على جدول المحاولات (كما في 012)
--    قراءة + إدراج فقط — بلا تحديث ولا حذف
-- ------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.exam_attempts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exam_attempts TO authenticated;
GRANT ALL ON TABLE public.exam_attempts TO service_role;

DROP POLICY IF EXISTS "teacher full access" ON public.exam_attempts;
CREATE POLICY "teacher full access" ON public.exam_attempts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read" ON public.exam_attempts;
CREATE POLICY "public read" ON public.exam_attempts
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "public insert" ON public.exam_attempts;
CREATE POLICY "public insert" ON public.exam_attempts
  FOR INSERT TO anon WITH CHECK (true);

-- ------------------------------------------------------------
-- 4) تقرير الحالة النهائية — تبويب Messages
-- ------------------------------------------------------------
DO $$
DECLARE
  has_phone BOOLEAN;
  has_idx   BOOLEAN;
  can_ins   BOOLEAN;
  n_pol     INT;
BEGIN
  RAISE NOTICE '===== تقرير 013: وضع فتح الاختبار (أعضاء / مفتوح للجميع) =====';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_attempts' AND column_name = 'phone'
  ) INTO has_phone;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_exam_attempts_guest'
  ) INTO has_idx;

  SELECT has_table_privilege('anon', 'public.exam_attempts', 'INSERT') INTO can_ins;
  SELECT count(*) INTO n_pol FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exam_attempts' AND cmd = 'INSERT' AND 'anon' = ANY(roles);

  IF has_phone THEN
    RAISE NOTICE '✅ عمود phone موجود في exam_attempts — رقم هاتف الزائر سيصلك';
  ELSE
    RAISE NOTICE '❌ عمود phone غير موجود — أعد تشغيل هذا الملف';
  END IF;

  IF has_idx THEN
    RAISE NOTICE '✅ فهرس محاولات الزوار موجود (حد المحاولات يعمل عبر الأجهزة)';
  ELSE
    RAISE NOTICE '❌ فهرس idx_exam_attempts_guest غير موجود';
  END IF;

  IF can_ins AND n_pol > 0 THEN
    RAISE NOTICE '✅ الزوار يستطيعون إرسال محاولاتهم (GRANT + سياسة RLS)';
  ELSE
    RAISE NOTICE '❌ إرسال الزوار ما زال مقفولاً (GRANT: % / سياسة: %) — شغّل 012 ثم 013', can_ins, n_pol;
  END IF;

  RAISE NOTICE 'ملاحظة: إعداد «من يفتح الاختبار» نفسه داخل JSONB جدول exams — لا أعمدة جديدة له';
END $$;

-- ============================================================
-- انتهى
-- ============================================================
