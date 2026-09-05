-- ============================================================
-- 018) جعل سياسات إدراج الزوار آمنة لإعادة التشغيل (DROP + CREATE)
-- ============================================================
-- السبب: ملفا 016 و portal_fix_and_verify.sql كانا يستخدمان
--   CREATE POLICY "anon insert ..." مباشرة دون DROP قبله،
--   وPostgres لا يدعم IF NOT EXISTS للسياسات، فكانت إعادة
--   التشغيل تفشل بالخطأ 42710 (policy already exists) وتتوقف
--   بقية السكربت — ومنها دوال student_login/get_student_portal_data —
--   فتظهر «تعذر تحميل بياناتك» بعد قبول الدخول.
-- هذا الملف: DROP ثم CREATE للسياسات الثلاث فقط — لا يمس أي بيانات،
-- وآمن للتكرار 100%.
-- ============================================================

DROP POLICY IF EXISTS "anon insert registration_requests" ON public.registration_requests;
CREATE POLICY "anon insert registration_requests" ON public.registration_requests FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon insert group_transfer_requests" ON public.group_transfer_requests;
CREATE POLICY "anon insert group_transfer_requests" ON public.group_transfer_requests FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon insert inquiries" ON public.inquiries;
CREATE POLICY "anon insert inquiries" ON public.inquiries FOR INSERT TO anon WITH CHECK (true);
