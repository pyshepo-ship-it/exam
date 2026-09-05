-- ============================================================
-- 026_unique_student_email.sql
-- بريد فريد لكل طالب: لا يتكرر بريد بين طالبين ولا بين حسابَي دخول.
--
-- لماذا: البريد هو مفتاح دخول الطالب (student_login يبحث به). تكرار بريد
-- واحد يجعل الدخول غير حتمي — يفتح حساب طالب آخر أحيانًا — ولا شيء في
-- المخطط كان يمنعه (فهرس البريد كان عاديًا لا فريدًا).
--
-- الفريدية بلا حساسية لحالة الأحرف والمسافات: lower(trim(email))، ولا تشمل
-- الصفوف بلا بريد (فهرس جزئي)، فيظل الطالب بلا بريد مسموحًا ومتعددًا.
--
-- إن وُجد تكرار فعلي يتوقف الترحيل ويطبع البريد المكرر بالاسم، من دون أن
-- يغيّر شيئًا (التشغيل في SQL Editor معاملة واحدة) — تُصلح الحالة من لوحة
-- المعلم ثم يُعاد التشغيل. آمن للتكرار.
-- ============================================================

-- ------------------------------------------------------------
-- 1) كشف التكرار قبل فرض القيد، برسالة تسمّي البريد وأصحابه
-- ------------------------------------------------------------
DO $$
DECLARE
  v_dupe TEXT;
BEGIN
  SELECT string_agg(info, ' — ') INTO v_dupe
  FROM (
    SELECT lower(trim(s.email)) || ' (' || string_agg(s.name, ' + ') || ')' AS info
      FROM public.students s
     WHERE NULLIF(trim(COALESCE(s.email, '')), '') IS NOT NULL
     GROUP BY lower(trim(s.email))
    HAVING count(*) > 1
  ) d;
  IF v_dupe IS NOT NULL THEN
    RAISE EXCEPTION 'بريد مكرر بين طلاب — صحّحه من لوحة المعلم ثم أعد التشغيل: %', v_dupe;
  END IF;

  SELECT string_agg(info, ' — ') INTO v_dupe
  FROM (
    SELECT lower(trim(a.email)) || ' (' || count(*)::text || ' حسابات)' AS info
      FROM public.student_accounts a
     WHERE NULLIF(trim(COALESCE(a.email, '')), '') IS NOT NULL
     GROUP BY lower(trim(a.email))
    HAVING count(*) > 1
  ) d;
  IF v_dupe IS NOT NULL THEN
    RAISE EXCEPTION 'بريد مكرر بين حسابات الدخول — صحّحه ثم أعد التشغيل: %', v_dupe;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 2) الفهارس الفريدة (جزئية: الطالب بلا بريد لا يتأثر)
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_email
  ON public.students (lower(trim(email)))
  WHERE NULLIF(trim(COALESCE(email, '')), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_accounts_email
  ON public.student_accounts (lower(trim(email)))
  WHERE NULLIF(trim(COALESCE(email, '')), '') IS NOT NULL;

-- ------------------------------------------------------------
-- 3) فحص تثبيت: القيد موجود فعلاً ويعمل
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_students_email'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_student_accounts_email'
  ) THEN
    RAISE EXCEPTION 'لم يُنشأ فهرس البريد الفريد';
  END IF;
END;
$$;
