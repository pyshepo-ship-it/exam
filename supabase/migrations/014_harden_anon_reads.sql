-- ============================================================
-- Migration 014: تحصين قراءة الزوار (anon) — إزالة القراءة الشاملة
--   من الجداول التي لا يقرؤها أي كود مجهول في التطبيق
-- ============================================================
-- لماذا هذا الملف؟
--   migration 010 (و012/013 اللاحقان) منحا الزائر (anon) قراءة شاملة
--   USING(true) على كل جداول التطبيق عبر سياسة "public read" + GRANT SELECT.
--   قراءة كل السجلات كانت مطلوبة لتشغيل بوابة الطالب بنمطها القديم
--   («جلب الكل ثم فلترة جهة العميل»)، لكنها تشمل جداول لا يستدعيها
--   أي مسار مجهول إطلاقاً — فوجودها يوسّع سطح الهجوم بلا أي فائدة وظيفية.
--
-- ماذا يفعل هذا الملف (آمن للتكرار، لا يمس بيانات):
--   1) يسحب قراءة anon من جداول بلا مستهلك مجهول: sessions + year_archives
--      (الحصص لا تُعرض إلا في لوحة المعلم المصادق؛ والأرشيف سنوي كامل
--       ببيانات JSON حساسة للمعلم فقط)
--   2) سحب احتياطي صريح (REVOKE) لأي UPDATE/DELETE على هذه الجداول من anon
--   3) توثيق «الحل المعتمد» الكامل للمخاطر البنيوية المتبقية (انظر نهاية الملف)
--
-- ملاحظة أمنية مركزية (مهمة):
--   النمط «كل جهة العميل anon تقرأ كل الجداول ثم تفلتر محلياً» يبقى قائماً
--   لبيانات البوابة الحساسة (students/dues/payments/attendance/manual_grades/
--   student_history/student_accounts/registration_requests/group_transfer_requests/
--   inquiries/exam_attempts/exams). لا يمكن إغلاقه من SQL وحده — الحل المعتمد
--   موثّق في القسم [الحل المعتمد] بالأسفل ويتطلب نقل الطلاب إلى Supabase Auth.
-- ============================================================

-- ------------------------------------------------------------
-- 1) إزالة سياسة القراءة العامة من الجداول غير المستهلكة مجهولاً
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "public read" ON public.sessions;
DROP POLICY IF EXISTS "public read" ON public.year_archives;

-- لو وُجدت سياسات قديمة بأسماء أخرى
DROP POLICY IF EXISTS "anon read sessions" ON public.sessions;
DROP POLICY IF EXISTS "anon read year_archives" ON public.year_archives;

-- ------------------------------------------------------------
-- 2) سحب صلاحية SELECT من anon (المصدر الحقيقي للسماح)
-- ------------------------------------------------------------
REVOKE SELECT ON TABLE public.sessions FROM anon;
REVOKE SELECT ON TABLE public.year_archives FROM anon;

-- سحب وقائي: لا يجوز للزائر أبداً تعديل أو حذف في أي جدول
REVOKE UPDATE, DELETE ON TABLE public.grades FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.groups FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.students FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.dues FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.payments FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.exams FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.sessions FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.attendance FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.announcements FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.honorees FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.shared_files FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.important_links FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.year_archives FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.app_settings FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.manual_grades FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.registration_requests FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.group_transfer_requests FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.student_history FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.student_accounts FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.inquiries FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.exam_attempts FROM anon;

-- ------------------------------------------------------------
-- 3) الحل المعتمد (Approved Solution) للمخاطر البنيوية المتبقية
-- ------------------------------------------------------------
-- الجذر المشترك للثغرات الثلاث (قراءة anon الشاملة، كوكي الطالب غير الموقّع،
-- تعرّض أسئلة/إجابات الاختبارات) هو: بوابة الطالب تعمل بدون مصادقة Supabase،
-- فتُقرأ كل البيانات بمفتاح anon وتُفلتر جهة العميل.
--
-- الحل المعتمد (على مراحل — خارج نطاق ملف SQL واحد):
--
--   المرحلة أ) نقل دخول الطلاب إلى Supabase Auth الحقيقي:
--       • عند موافقة المعلم على طلب التسجيل (registerStudentAccount) يُنشأ
--         مستخدم Supabase Auth بالبريد + كلمة مؤقتة، مع metadata:
--         { student_id } عبر supabase.auth.admin.createUser (مفتاح service_role
--         في بيئة الخادم فقط — server action / route handler — لا في العميل).
--       • student_accounts تبقى جدول الربط الرسمي student_id ↔ auth.uid().
--
--   المرحلة ب) RLS قائمة على الهوية بدل القراءة الشاملة:
--       • policy على كل جدول بوابة: USING (
--           student_id = COALESCE(
--             (auth.jwt() ->> 'student_id')::text,
--             (SELECT student_id FROM student_accounts WHERE email = auth.jwt() ->> 'email')
--           )
--         ) مع GRANT SELECT للمصادق فقط (authenticated) — ورفع SELECT
--         بالكامل من anon عن students/dues/payments/attendance/manual_grades/
--         student_history/registration_requests/group_transfer_requests/inquiries/
--         exam_attempts/student_accounts/exams.
--       • examiner يحصل على جلسة موقّعة (JWT) — لا كوكي قابل للتزوير.
--
--   المرحلة ج) إخفاء الإجابات الصحيحة عن العميل:
--       • نقل التصحيح إلى الخادم: دالة RPC submit_exam_attempt(exam_id, answers)
--         تُصحّح داخلياً من questions JSONB دون إرسال isCorrect/correctAnswer
--         إلى المتصفح؛ يبقى في العميل سؤال بلا إجابات صحيحة (وضع «مصحح
--         لاحقاً» أو «مصحح الخادم»)، مع seal بالخادم لمنع التلاعب.
--       • تقييد قراءة anon لجدول exams على الحقول العامة فقط (via view آمن
--         security_invoker) أو عبر RPC تتحقق من accessMode/allowOnline/النافذة.
--
--   المرحلة د) (أثناء التحول) تخفيف فوري ممكن الآن دون كسر الوظيفة:
--       • تسييل جداول بلا مستهلك مجهول كما فعل هذا الملف (sessions، year_archives)
--       • مراجعة أن التطبيق لا يقرأ أعمدة زائدة في استعلامات anon
--         (fetchPublicData يجلب "*" من exams مع أن العميل لا يحتاج سوى
--          الاختبارات allowOnline — الانتقال إلى حقل questions ضيق أو view).
--
-- ✅ آمن للتكرار (idempotent) — لا يمس أي بيانات، ويُستكمل بتشغيل فحوص
-- scripts/fresh-audit-suite.mjs (البند 7: سياسات RLS) للتأكد من عدم التراجع.
-- ============================================================
