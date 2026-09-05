-- ============================================================
-- 019) إصلاح «القبول التلقائي لطلبات التسجيل»
-- ============================================================
-- المشكلة التي يُصلحها هذا الملف:
--   المعلم يفعّل «القبول التلقائي» من الإعدادات، ومع ذلك يسجّل الطالب
--   فيبقى طلبه معلّقاً ولا يستطيع تسجيل الدخول («بانتظار موافقة المعلم»).
--
-- السببان:
--   1) الواجهة كانت تقرأ إعداد القبول التلقائي من ذاكرة جلسة جهاز الطالب
--      (الفارغة دائماً — لا تخزين محلي للبيانات)، فترسل طلباً يدوياً بدل
--      منادات student_register. أُصلح في الكود بجلب الإعداد من السحابة.
--   2) الطلبات التي عَلِقت فعلاً قبل الإصلاح تبقى معلّقة إلى الأبد.
--      هذا الملف يُصلحها: student_login صار يفعّل الطلب المعلّق تلقائياً
--      (ينشئ الطالب والحساب ويحوّل الطلب إلى approved) عندما يكون
--      «القبول التلقائي» مفعّلاً وكلمة المرور صحيحة، ثم يُصدر الجلسة.
--
-- التشغيل: Supabase ← SQL Editor ← الصق الملف كاملاً ← Run
-- آمن للتكرار (CREATE OR REPLACE + NOTIFY فقط، ولا يمس أي بيانات).
-- ============================================================

CREATE OR REPLACE FUNCTION public.student_login(p_email TEXT, p_password TEXT, p_legacy_fnv TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_mail TEXT := lower(trim(p_email));
  v_account public.student_accounts%ROWTYPE;
  v_req public.registration_requests%ROWTYPE;
  v_student public.students%ROWTYPE;
  v_sha TEXT;
  v_ok BOOLEAN := false;
  v_student_id TEXT;
  v_token TEXT;
  v_exp_ms TEXT;
  v_auto TEXT;
  v_now TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  SELECT * INTO v_account FROM public.student_accounts
    WHERE lower(email) = v_mail ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_req FROM public.registration_requests
    WHERE lower(email) = v_mail ORDER BY created_at DESC LIMIT 1;
  -- إن لم يوجد طلب بالبريد لكن الحساب مربوط بطلب معتمد (بريد تغيّر من المدرس)
  IF v_req.id IS NULL AND v_account.student_id IS NOT NULL THEN
    SELECT * INTO v_req FROM public.registration_requests
      WHERE linked_student_id = v_account.student_id AND status = 'approved'
      ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_account.id IS NULL AND v_req.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_account', 'error', 'لا يوجد حساب بهذا البريد — سجِّل أولاً من صفحة التسجيل');
  END IF;

  v_sha := encode(digest(p_password, 'sha256'), 'hex');
  IF v_req.password_hash IS NOT NULL AND v_req.password_hash <> '' THEN
    IF v_req.password_hash = v_sha OR (p_legacy_fnv IS NOT NULL AND v_req.password_hash = p_legacy_fnv) THEN v_ok := true; END IF;
  END IF;
  IF NOT v_ok AND v_account.password_hash IS NOT NULL AND v_account.password_hash <> '' THEN
    IF v_account.password_hash = v_sha OR (p_legacy_fnv IS NOT NULL AND v_account.password_hash = p_legacy_fnv) THEN v_ok := true; END IF;
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'code', 'wrong_password', 'error', 'كلمة المرور غير صحيحة');
  END IF;

  -- ------------------------------------------------------------
  -- القبول التلقائي: طلب معلّق + الإعداد مفعّل + كلمة المرور صحيحة
  -- ⇒ يُفعَّل الحساب الآن (ذاتي الشفاء) بدل رفض الدخول.
  -- ------------------------------------------------------------
  IF v_req.id IS NOT NULL AND v_req.status = 'pending' THEN
    SELECT value INTO v_auto FROM public.app_settings WHERE key = 'autoApproveRegistration';
    IF COALESCE(v_auto, '') <> '' THEN
      -- 1) الطالب: الموجود (بالربط أو بالبريد) أو إنشاء جديد
      v_student_id := v_req.linked_student_id;
      IF v_student_id IS NULL THEN
        SELECT id INTO v_student_id FROM public.students
          WHERE lower(COALESCE(email, '')) = v_mail ORDER BY created_at DESC LIMIT 1;
      END IF;

      IF v_student_id IS NULL THEN
        v_student_id := 'st-' || encode(gen_random_bytes(10), 'hex');
        INSERT INTO public.students
          (id, name, phone, email, grade_id, group_id, status, inquiry_blocked, created_at, updated_at)
          VALUES
          (v_student_id, trim(COALESCE(v_req.name, '')), trim(COALESCE(v_req.phone, '')), v_mail,
           v_req.grade_id, v_req.group_id, 'active', false, v_now, v_now);
      ELSE
        UPDATE public.students
          SET email = v_mail,
              name = CASE WHEN trim(COALESCE(v_req.name, '')) <> '' THEN trim(v_req.name) ELSE name END,
              phone = CASE WHEN trim(COALESCE(v_req.phone, '')) <> '' THEN trim(v_req.phone) ELSE phone END,
              grade_id = COALESCE(grade_id, v_req.grade_id),
              group_id = COALESCE(group_id, v_req.group_id),
              status = 'active',
              updated_at = v_now
          WHERE id = v_student_id;
      END IF;

      -- 2) حساب البوابة (لا نطمس بصمة قائمة إن وُجدت)
      INSERT INTO public.student_accounts (id, email, student_id, active, password_hash, created_at)
        VALUES (v_mail, v_mail, v_student_id, true, v_req.password_hash, v_now)
        ON CONFLICT (id) DO UPDATE
          SET student_id = EXCLUDED.student_id,
              active = true,
              password_hash = COALESCE(NULLIF(EXCLUDED.password_hash, ''), public.student_accounts.password_hash);

      -- 3) الطلب يصبح مقبولاً مع سبب واضح للمعلم
      UPDATE public.registration_requests
        SET status = 'approved',
            reviewed_at = v_now,
            linked_student_id = v_student_id,
            review_note = trim(COALESCE(review_note || ' | ', '') || 'تفعيل تلقائي (القبول التلقائي مفعّل)')
        WHERE id = v_req.id;

      -- 4) سجل نشاط الطالب
      INSERT INTO public.student_history (id, student_id, type, title, detail, date, created_at)
        VALUES ('hist-' || encode(gen_random_bytes(8), 'hex'), v_student_id, 'account',
                'تفعيل تلقائي عند تسجيل الدخول',
                'القبول التلقائي مفعّل عند المعلم — فُعّل الحساب وأصبح الدخول متاحاً', v_now, v_now);

      -- تحديث المتغيرات المحلية ليكمل إصدار الجلسة
      v_req.status := 'approved';
      v_req.linked_student_id := v_student_id;
      v_account.id := v_mail;
      v_account.email := v_mail;
      v_account.student_id := v_student_id;
      v_account.active := true;
    ELSE
      RETURN jsonb_build_object('ok', false, 'code', 'pending', 'status', 'pending', 'error', 'طلبك لا يزال قيد المراجعة — انتظر موافقة المعلم ثم حاول مجدداً');
    END IF;
  END IF;

  IF v_req.id IS NOT NULL AND v_req.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rejected', 'status', 'rejected', 'error',
      'تم رفض طلب التسجيل' || CASE WHEN COALESCE(v_req.review_note, '') <> '' THEN ': ' || v_req.review_note ELSE '' END);
  END IF;
  IF v_account.id IS NOT NULL AND v_account.active = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'blocked', 'status', 'blocked', 'error', 'تم إيقاف حسابك من تسجيل الدخول — يرجى التواصل مع المعلم');
  END IF;

  v_student_id := COALESCE(v_account.student_id, v_req.linked_student_id);
  SELECT * INTO v_student FROM public.students WHERE id = v_student_id;
  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_linked', 'error', 'حسابك غير مربوط ببيانات طالب — يرجى التواصل مع المعلم');
  END IF;
  IF v_student.status = 'inactive' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'blocked', 'status', 'blocked', 'error', 'حسابك موقوف حالياً — يرجى التواصل مع المعلم');
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_exp_ms := to_char(now() + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  INSERT INTO public.student_sessions (student_id, token_hash, created_at, expires_at)
    VALUES (v_student_id, encode(digest(v_token, 'sha256'), 'hex'),
            to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), v_exp_ms)
  ON CONFLICT (student_id) DO UPDATE
    SET token_hash = EXCLUDED.token_hash,
        created_at = EXCLUDED.created_at,
        expires_at = EXCLUDED.expires_at;

  RETURN jsonb_build_object(
    'ok', true, 'code', 'ok', 'studentId', v_student_id,
    'name', v_student.name, 'email', v_mail, 'token', v_token,
    'exp', floor(extract(epoch from now()) * 1000)::bigint + 2592000000::bigint
  );
END;
$$;

-- الصلاحيات كما هي (إعادة تثبيت بعد CREATE OR REPLACE)
REVOKE ALL ON FUNCTION public.student_login(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_login(TEXT, TEXT, TEXT) TO anon, authenticated;

-- تحديث كاش المخطط لدى PostgREST
NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- فحص سريع بعد التشغيل:
--   SELECT key, value FROM public.app_settings
--     WHERE key IN ('registrationOpen', 'autoApproveRegistration');
--   SELECT status, count(*) FROM public.registration_requests GROUP BY status;
-- الطلبات المعلّقة تُفعَّل تلقائياً عند أول محاولة دخول صحيحة من الطالب،
-- ويمكن للمعلم تفعيلها كلها فوراً من «طلبات الطلاب ← تفعيل كل الطلبات المعلّقة».
-- ------------------------------------------------------------
