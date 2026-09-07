-- ============================================================
-- 028_honoree_soft_remove.sql
--
-- الإخفاء الناعم من لوحة الشرف.
--
-- سابقاً كانت إزالة الطالب من لوحة الشرف تحذف صفه نهائياً، فتختفي
-- معه واقعة التكريم من تقرير الطالب («مرات التكريم»)، مع أن التكريم
-- حدث تاريخي يجب أن يبقى موثقاً حتى لو أوقف المعلم عرضه العام.
--
-- الآن: الإزالة من اللوحة تسجّل توقيتها في removed_at فقط:
--   • اللوحة (العامة وبوابة الطالب) تعرض من removed_at فارغاً فقط.
--   • تقرير الطالب يشمل كل تكريماته مُزالاً كان العرض أم لا.
--   • الحذف النهائي خيار صريح منفصل في لوحة المعلم لمن أراد محو
--     التكريم من التقرير أيضاً.
--
-- اعتماد المحاولات (adoptedAt) يُحفظ داخل حقيبة manual_override (JSONB)
-- في exam_attempts مثل بقية بيانات المراجعة، لذلك لا يحتاج عموداً؛ لكن
-- دالة get_online_exam_result تبني حقيبة آمنة بقائمة بيضاء، فيجب تمرير
-- المفتاح الجديد كي يصل علم الاعتماد إلى بوابة الطالب (توقيت فقط — لا
-- يسرّب درجة ولا تعليقاً، فيُكشف قبل الإطلاق وبعده بلا حرج).
--
-- آمن للتشغيل أكثر من مرة.
-- ============================================================

BEGIN;

ALTER TABLE public.honorees ADD COLUMN IF NOT EXISTS removed_at TEXT;

COMMENT ON COLUMN public.honorees.removed_at IS
  'توقيت إخفائه من عرض لوحة الشرف؛ وجوده يخفيه من اللوحة ويبقيه ظاهراً في تقرير الطالب';

-- نفس دالة 015 كلمةً كلمة، وفيها سطر واحد زائد: تمرير adoptedAt.
CREATE OR REPLACE FUNCTION public.get_online_exam_result(
  p_session_id TEXT,
  p_session_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.online_exam_sessions%ROWTYPE;
  v_attempt public.exam_attempts%ROWTYPE;
  v_meta JSONB;
  v_safe_meta JSONB := '{}'::jsonb;
  v_safe_answers JSONB := '{}'::jsonb;
  v_answer_key TEXT;
  v_answer_value JSONB;
  v_released BOOLEAN := false;
  v_feedback JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_session
    FROM public.online_exam_sessions
   WHERE id = p_session_id AND session_secret = p_session_secret;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'جلسة الاختبار غير صالحة';
  END IF;
  IF v_session.submitted_at IS NULL THEN
    RETURN jsonb_build_object('state', 'in_progress');
  END IF;

  SELECT * INTO v_attempt
    FROM public.exam_attempts
   WHERE id = v_session.attempt_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'in_progress');
  END IF;

  v_meta := CASE WHEN jsonb_typeof(v_attempt.manual_override) = 'object'
    THEN v_attempt.manual_override ELSE '{}'::jsonb END;
  v_released := NULLIF(COALESCE(v_meta->>'resultReleasedAt', ''), '') IS NOT NULL;

  -- إجابة الطالب نفسها مسموحة، لكن review لا يخرج قبل الإطلاق الصريح.
  FOR v_answer_key, v_answer_value IN
    SELECT key, value FROM jsonb_each(
      CASE WHEN jsonb_typeof(v_attempt.answers) = 'object' THEN v_attempt.answers ELSE '{}'::jsonb END
    )
  LOOP
    v_safe_answers := v_safe_answers || jsonb_build_object(
      v_answer_key,
      CASE WHEN v_released THEN v_answer_value ELSE v_answer_value - 'review' END
    );
  END LOOP;

  v_safe_meta := jsonb_strip_nulls(jsonb_build_object(
    'autoScore', v_meta->'autoScore',
    'autoTotal', v_meta->'autoTotal',
    -- لا يكشف التصحيح اليدوي قبل الإطلاق، حتى في بيانات الشبكة.
    'manualScore', CASE WHEN v_released THEN v_meta->'manualScore' ELSE to_jsonb(0) END,
    'manualTotal', v_meta->'manualTotal',
    'gradingStatus', v_meta->'gradingStatus',
    'resultReleasedAt', CASE WHEN v_released THEN v_meta->'resultReleasedAt' ELSE NULL END,
    'reviewedAt', v_meta->'reviewedAt',
    'timedOut', v_meta->'timedOut',
    -- اعتماد المعلم لمحاولة بعينها: توقيت فقط، يصل الطالب قبل الإطلاق وبعده
    'adoptedAt', v_meta->'adoptedAt'
  ));
  IF v_released AND jsonb_typeof(v_meta->'score') = 'number' THEN
    v_safe_meta := v_safe_meta || jsonb_strip_nulls(jsonb_build_object(
      'score', v_meta->'score',
      'reason', v_meta->'reason',
      'at', v_meta->'at'
    ));
  END IF;

  -- نفس قواعد afterEach / atEnd؛ المقال لا يملك مفتاحاً في هذه الدالة.
  v_feedback := COALESCE(
    public.get_online_exam_answer_feedback(p_session_id, p_session_secret)->'answers',
    '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'state', 'submitted',
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'exam_id', v_attempt.exam_id,
      'student_id', v_attempt.student_id,
      'student_name', v_attempt.student_name,
      'group_id', v_attempt.group_id,
      'grade_id', v_attempt.grade_id,
      'answers', v_safe_answers,
      'score', v_attempt.score,
      'total_marks', v_attempt.total_marks,
      'started_at', v_attempt.started_at,
      'submitted_at', v_attempt.submitted_at,
      'duration_seconds', v_attempt.duration_seconds,
      'manual_override', v_safe_meta
    ),
    'feedback', v_feedback
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_online_exam_result(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_online_exam_result(TEXT, TEXT) TO anon, authenticated;

COMMIT;
