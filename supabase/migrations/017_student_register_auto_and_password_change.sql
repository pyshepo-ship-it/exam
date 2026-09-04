-- 017: تسجيل مباشر (تفعيل فوري بدون موافقة المعلم) + تغيير الطالب لكلمة مروره بنفسه
-- يبني على 016: RLS مغلقة عن anon + دوال SECURITY DEFINER.
-- كل التغيير هنا إضافة دوال جديدة (CREATE OR REPLACE) — تكرار التشغيل آمن.

-- ----------------------------------------------------------------------------
-- (1) تسجيل مباشر: ينشئ الطالب + الطلب (approved) + الحساب دفعة واحدة داخل الخادم.
--     يُستدعى فقط عندما يكون «التفعيل المباشر» مفعّلاً في الإعدادات.
--     يتحقق من فتح التسجيل ومن التفعيل المباشر ومن فريدية البريد.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_register(
  p_name TEXT,
  p_phone TEXT,
  p_guardian_phone TEXT,
  p_email TEXT,
  p_password_hash TEXT,
  p_grade_id TEXT,
  p_group_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mail TEXT := lower(trim(p_email));
  v_reg_open TEXT;
  v_auto TEXT;
  v_id TEXT;
  v_now TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  -- هل التسجيل مفتوح؟ (افتراضياً مفتوح إن لم يكن هناك سطر)
  SELECT value INTO v_reg_open FROM public.app_settings WHERE key = 'registrationOpen';
  IF COALESCE(v_reg_open, '1') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'closed', 'error', 'التسجيل مغلق حالياً — يرجى التواصل مع المعلم');
  END IF;

  -- هل «التفعيل المباشر» مفعّل؟ (افتراضياً مغلق — ينتظر موافقة المعلم)
  SELECT value INTO v_auto FROM public.app_settings WHERE key = 'autoApproveRegistration';
  IF COALESCE(v_auto, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_enabled', 'error', 'التفعيل المباشر غير مفعّل — يرسل الطلب إلى المعلم للموافقة');
  END IF;

  -- فريدية البريد
  IF EXISTS (SELECT 1 FROM public.students WHERE lower(COALESCE(email, '')) = v_mail)
     OR EXISTS (SELECT 1 FROM public.registration_requests WHERE lower(COALESCE(email, '')) = v_mail) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'email_taken', 'error', 'هذا البريد مسجَّل بالفعل — يمكنك تسجيل الدخول مباشرة');
  END IF;

  -- الصف يجب أن يكون موجوداً
  IF NOT EXISTS (SELECT 1 FROM public.grades WHERE id = p_grade_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_input', 'error', 'الصف المختار غير موجود');
  END IF;

  v_id := 'st-' || encode(gen_random_bytes(10), 'hex');

  INSERT INTO public.students (id, name, phone, email, grade_id, group_id, status, inquiry_blocked, created_at, updated_at)
    VALUES (v_id, trim(p_name), trim(p_phone), v_mail, p_grade_id, p_group_id, 'active', false, v_now, v_now);

  INSERT INTO public.registration_requests
    (id, name, phone, guardian_phone, email, password_hash, grade_id, group_id, status, reviewed_at, linked_student_id, created_at)
    VALUES
    ('reg-' || encode(gen_random_bytes(8), 'hex'), trim(p_name), trim(p_phone), trim(COALESCE(p_guardian_phone, '')),
     v_mail, p_password_hash, p_grade_id, p_group_id, 'approved', v_now, v_id, v_now);

  INSERT INTO public.student_accounts (id, email, student_id, active, password_hash, created_at)
    VALUES (v_mail, v_mail, v_id, true, p_password_hash, v_now);

  INSERT INTO public.student_history (id, student_id, type, title, detail, date, created_at)
    VALUES ('hist-' || encode(gen_random_bytes(8), 'hex'), v_id, 'account', 'تسجيل مباشر من بوابة الطالب',
            'أُنشئ الحساب تلقائياً (تفعيل مباشر) وأصبح الدخول متاحاً', v_now, v_now);

  RETURN jsonb_build_object('ok', true, 'code', 'ok', 'studentId', v_id, 'name', trim(p_name));
END;
$$;

-- ----------------------------------------------------------------------------
-- (2) تغيير الطالب لكلمة مروره من داخل بوابته (قسم الطلبات):
--     يتحقق من الجلسة (التوكين) ومن كلمة المرور القديمة ثم يحدّث بصمة
--     الحساب والطلب المعتمد معاً — كل ذلك داخل الخادم، بلا قراءة خام.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_student_password(
  p_token TEXT,
  p_old_password_hash TEXT,
  p_old_legacy_fnv TEXT,
  p_new_password_hash TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT := encode(digest(p_token, 'sha256'), 'hex');
  v_student_id TEXT;
  v_acc public.student_accounts%ROWTYPE;
  v_req public.registration_requests%ROWTYPE;
  v_ok BOOLEAN := false;
BEGIN
  IF p_token IS NULL OR p_token = '' OR p_new_password_hash IS NULL OR p_new_password_hash = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_input', 'error', 'بيانات غير صالحة — أعد المحاولة');
  END IF;

  SELECT student_id INTO v_student_id FROM public.student_sessions
    WHERE token_hash = v_hash
      AND expires_at > to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'جلسة غير صالحة أو منتهية — سجّل الدخول من جديد');
  END IF;

  SELECT * INTO v_acc FROM public.student_accounts WHERE student_id = v_student_id ORDER BY created_at DESC LIMIT 1;
  IF v_acc.id IS NOT NULL AND COALESCE(v_acc.password_hash, '') <> '' THEN
    IF v_acc.password_hash = p_old_password_hash
       OR (p_old_legacy_fnv IS NOT NULL AND v_acc.password_hash = p_old_legacy_fnv) THEN
      v_ok := true;
    END IF;
  END IF;

  IF NOT v_ok THEN
    SELECT * INTO v_req FROM public.registration_requests
      WHERE linked_student_id = v_student_id AND status = 'approved'
      ORDER BY created_at DESC LIMIT 1;
    IF v_req.id IS NOT NULL AND COALESCE(v_req.password_hash, '') <> '' THEN
      IF v_req.password_hash = p_old_password_hash
         OR (p_old_legacy_fnv IS NOT NULL AND v_req.password_hash = p_old_legacy_fnv) THEN
        v_ok := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'code', 'wrong_old', 'error', 'كلمة المرور القديمة غير صحيحة');
  END IF;

  UPDATE public.student_accounts SET password_hash = p_new_password_hash WHERE student_id = v_student_id;
  UPDATE public.registration_requests SET password_hash = p_new_password_hash
    WHERE linked_student_id = v_student_id AND status = 'approved';

  RETURN jsonb_build_object('ok', true, 'code', 'ok');
END;
$$;

-- الصلاحيات: anon/authenticated يستطيعان الاستدعاء فقط — لا قراءة خام
REVOKE ALL ON FUNCTION public.student_register(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_student_password(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_register(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_student_password(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
