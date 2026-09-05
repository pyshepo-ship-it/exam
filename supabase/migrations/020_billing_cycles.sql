-- ============================================================
-- 020) التسعير بالحصّة + دورات الاستحقاق (شهري / أسبوعي / بالحصّة / مخصص)
-- ============================================================
-- ماذا يضيف:
--   • groups: طريقة تسعير المجموعة (سعر شهري أو سعر الحصة)، سعر الحصة،
--     عدد الحصص شهرياً (حسب مواعيد المجموعة)، وسعر الأسبوع الاختياري.
--   • dues: دورة الاستحقاق ومفتاح الفترة ووصفها وتاريخ الاستحقاق وعدد
--     الحصص وسعر الوحدة وملاحظات — حتى لا يتكرر استحقاق نفس الفترة،
--     وحتى يظهر لولي الأمر «أسبوع 3 (7–13 سبتمبر)» بدل «9/2026» فقط.
--
-- التوافق: كل الأعمدة الجديدة اختيارية ولها قيم افتراضية، فالسجلات القديمة
-- تبقى «شهرية» تلقائياً ولا يتغير أي حساب سابق.
--
-- التشغيل: Supabase ← SQL Editor ← الصق الملف كاملاً ← Run (آمن للتكرار)
-- ============================================================

-- ------------------------------------------------------------
-- 1) تسعير المجموعات
-- ------------------------------------------------------------
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS session_fee NUMERIC(10,2);
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS sessions_per_month INTEGER;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS weekly_fee NUMERIC(10,2);

-- ------------------------------------------------------------
-- 2) دورات الاستحقاق
-- ------------------------------------------------------------
ALTER TABLE public.dues ADD COLUMN IF NOT EXISTS cycle TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE public.dues ADD COLUMN IF NOT EXISTS period_key TEXT;
ALTER TABLE public.dues ADD COLUMN IF NOT EXISTS period_label TEXT;
ALTER TABLE public.dues ADD COLUMN IF NOT EXISTS due_date TEXT;
ALTER TABLE public.dues ADD COLUMN IF NOT EXISTS sessions_count INTEGER;
ALTER TABLE public.dues ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2);
ALTER TABLE public.dues ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_dues_period_key ON public.dues(period_key);
CREATE INDEX IF NOT EXISTS idx_dues_cycle ON public.dues(cycle);

-- ------------------------------------------------------------
-- 3) تهيئة السجلات القديمة: مفتاح فترة شهري واضح (يمنع التكرار عليها)
-- ------------------------------------------------------------
UPDATE public.dues
  SET cycle = 'monthly',
      period_key = COALESCE(period_key, year || '-' || lpad(month::text, 2, '0'))
  WHERE period_key IS NULL;

-- قيود اختيارية تساعد على نظافة البيانات (لا تكسر السجلات القائمة)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dues_cycle_check'
  ) THEN
    ALTER TABLE public.dues
      ADD CONSTRAINT dues_cycle_check
      CHECK (cycle IN ('monthly', 'weekly', 'session', 'custom'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'groups_pricing_mode_check'
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_pricing_mode_check
      CHECK (pricing_mode IN ('monthly', 'session'));
  END IF;
END $$;

-- تحديث كاش المخطط لدى PostgREST حتى ترى الواجهة الأعمدة الجديدة فوراً
NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- فحص سريع بعد التشغيل:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'groups' AND column_name IN
--       ('pricing_mode','session_fee','sessions_per_month','weekly_fee');
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'dues' AND column_name IN
--       ('cycle','period_key','period_label','due_date','sessions_count','unit_price','notes');
--
-- ملاحظة: إن لم يُشغَّل هذا الملف، الموقع يستمر في العمل — يحفظ المجموعات
-- والاستحقاقات بدون الأعمدة الجديدة (تُحذف تلقائياً عند الرفع) ويظهر تنبيه
-- في Console. لكن الأسعار بالحصّة وفترات الأسبوع/الحصص لن تُحفظ في السحابة.
-- ------------------------------------------------------------
