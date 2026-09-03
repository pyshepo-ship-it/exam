<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


<!-- BEGIN:project-rules -->

# سياسة التخزين في هذا المشروع (إلزامية)

**كل بيانات الموقع تُسجَّل في Supabase فقط، وتُجلب منه تلقائياً. صفر تخزين محلي للبيانات.**

- ممنوع منعاً باتاً كتابة أي بيان في `localStorage` أو `sessionStorage` أو `IndexedDB` أو الكوكيز
  (الطلاب، الصفوف، المجموعات، الحصص، الحضور، الاستحقاقات، المدفوعات، الاختبارات، المحاولات،
  النتائج، الإعلانات، لوحة الشرف، الملفات، الروابط، الاستفسارات، طلبات التسجيل/النقل، سجل الطالب،
  أرشيف السنوات، الإعدادات، السنة الدراسية، اسم المعلم والتوقيع).
- المخزن المؤقت الوحيد هو **ذاكرة الجلسة** في `src/lib/memory-store.ts` (`readRows`/`writeRows`/
  `readSetting`/`writeSetting`): تُعبَّأ من Supabase (`pullAllData` / `fetchPublicData` /
  `fetchStudentPortalData`)، وتُمسح عند تحديث الصفحة أو الخروج.
- أي حفظ = دفع إلى Supabase (`queuePush`/`push*` في `src/lib/supabase/sync.ts`) ثم تحديث الذاكرة للعرض.
  وأي إرسال من الطالب/الزائر (`submit*`) يُدرج في السحابة **أولاً** ولا يلمس الذاكرة إلا بعد النجاح.
- أي قراءة على جهاز جديد يجب أن تعمل بلا بيانات محلية: اجلب من السحابة (`fetchStudentAccountByEmail`,
  `fetchStudentById`, `fetchPublicData`, ...) ثم اعرض.
- المسموح على الجهاز (وليس بيانات): كوكي جلسة الطالب، مظهر الموقع (next-themes)، وعدّاد حماية الإغراق.
- الحارس: `node scripts/cloud-only-audit.mjs` (جزء من `npm run verify`) — **لا تُضعفه ولا توسّع قائمته
  المصرح بها**. إن فشل، أصلح الكود ليعود سحابياً خالصاً.

<!-- END:project-rules -->
