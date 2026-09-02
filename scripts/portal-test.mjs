/**
 * اختبار بوابة الطالب والتقارير الفردية — node scripts/portal-test.mjs
 *
 * يُنفِّذ كود المصدر الحقيقي (data-storage + student-accounts + student-report
 * + schedule-print) داخل jsdom ويتحقق من السيناريوهات الكاملة:
 *  1) التسجيل: التحققات، منع التكرار، عدم تخزين كلمة المرور نصاً صريحاً
 *  2) منع الدخول قبل الموافقة، الموافقة تربط/تنشئ الطالب فوراً
 *  3) الرفض وإعادة التقديم، حظر الحساب وإعادة تفعيله
 *  4) طلبات النقل: نفس الصف فقط، منع التكرار، الموافقة تنقل وتسجل التاريخ
 *  5) تقرير الطالب: دمج الدرجات اليدوية والكترونياً + المالية + الحضور + الشرف
 *  6) توليد صفحات التقرير (شامل/درجات/مدفوعات/حضور/سجل) بوضعي المدرس وولي الأمر
 *  7) مفاتيح الإعدادات: فتح/غلق التسجيل وتقارير الطلاب
 */
import { readFileSync, mkdirSync, rmSync } from "node:fs"
import { resolve, join } from "node:path"
import ts from "typescript"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!DOCTYPE html><html dir='rtl'><body></body></html>", { url: "http://localhost/" })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

// ---- تجميع كل ملف إلى وحدة ES مستقلة (لتفادي تعارض الثوابت بين الملفات) ----
const TMP = resolve(process.cwd(), ".tmp-portal-test")
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })

const stripImportsOf = (src, spec) =>
  src.replace(new RegExp(`import\\s*\\{[^}]*\\}\\s*from\\s*"\\./${spec}"`), "")

const stubs = `const queuePush = () => Promise.resolve()
${["pushGrades","pushStudents","pushDues","pushPayments","pushExams","pushSessions","pushAttendance","pushAnnouncements","pushHonorees","pushSharedFiles","pushImportantLinks","pushYearArchives","pushSetting","pushExamAttempts","pushManualGrades","pushRegistrationRequests","pushGroupTransferRequests","pushStudentHistory","pushStudentAccounts"]
  .map((f) => `const ${f} = () => Promise.resolve()`).join("\n")}
// مثل sync.ts الحقيقية: حفظ محلي أولاً ثم مزامنة (نحاكي الحفظ المحلي فقط)
const submitRegistrationRequest = async (request) => {
  const local = JSON.parse(localStorage.getItem("registrationRequests") || "[]")
  localStorage.setItem("registrationRequests", JSON.stringify([...local, request]))
  return { ok: true }
}
const submitGroupTransferRequest = async (request) => {
  const local = JSON.parse(localStorage.getItem("groupTransferRequests") || "[]")
  localStorage.setItem("groupTransferRequests", JSON.stringify([...local, request]))
  return { ok: true }
}
const exportToPDF = async () => true
const printElement = () => {}
const fetchRegistrationRequestByEmail = async () => null`

// 1) storage-keys (كامل — أي مفاتيح جديدة تُلتقط تلقائياً)
const storageKeys = readFileSync("src/lib/storage-keys.ts", "utf8").replace(/export /g, "")

// 2) weekdays
const weekdays = readFileSync("src/lib/weekdays.ts", "utf8").replace(/export /g, "")

// 3) utils (بلا clsx/twMerge — cn غير مستخدم في المسارات المختبرة)
const utils = readFileSync("src/lib/utils.ts", "utf8").replace(/import[\s\S]*?from\s*"[\w/.@-]+"/g, "")

const rewrite = (src) =>
  src
    .replace(/from "\.\.\/storage-keys"/g, 'from "../storage-keys.mjs"')
    .replace(/from "\.\/supabase\/sync"/g, 'from "./supabase/sync.mjs"')
    .replace(/from "\.\/([\w-]+)"/g, 'from "./$1.mjs"')

const files = {}
// نسخة قابلة للاستيراد لوحدات ES (تستخدمها sync.ts في الاختبار)
files["storage-keys.mjs"] = `const STORAGE_KEYS = ${JSON.stringify(
  Object.fromEntries([...storageKeys.matchAll(/([A-Z_]+):\s*"([\w-]+)"/g)].map(m => [m[1], m[2]]))
)};
export { STORAGE_KEYS };
const STORAGE_KEYS_INTERNAL = STORAGE_KEYS;`
files["weekdays.mjs"] = weekdays
files["utils.mjs"] = rewrite(utils)

{
  let ds = readFileSync("src/lib/data-storage.ts", "utf8")
  ds = stripImportsOf(ds, "supabase/sync")
  ds = stripImportsOf(ds, "storage-keys")
  ds = stripImportsOf(ds, "weekdays")
  ds = rewrite(ds)
  files["data-storage.mjs"] = stubs + "\n" + storageKeys + "\n" + weekdays + "\n" + ds
}
{
  let br = stripImportsOf(readFileSync("src/lib/branding.ts", "utf8"), "supabase/sync")
  br = rewrite(br)
  files["branding.mjs"] = stubs + "\n" + br
}
{
  let sp = readFileSync("src/lib/schedule-print.ts", "utf8")
  sp = sp.replace(/import \{ exportToPDF, printElement \} from "\.\/pdf-utils"/,
    `const exportToPDF = async () => true\nconst printElement = () => {}`)
  sp = rewrite(sp)
  files["schedule-print.mjs"] = sp
}
{
  let sa = stripImportsOf(readFileSync("src/lib/student-accounts.ts", "utf8"), "supabase/sync")
  sa = rewrite(sa)
  files["student-accounts.mjs"] = stubs + "\n" + sa
}
{
  let sr = readFileSync("src/lib/student-report.ts", "utf8")
  sr = rewrite(sr)
  files["student-report.mjs"] = sr
}
{
  // sync الحقيقية مع تعطيل Supabase (createClient → null)
  let syn = readFileSync("src/lib/supabase/sync.ts", "utf8")
  syn = syn.replace(/import \{ createClient, isSupabaseConfigured \} from "\.\/client"/,
    `const createClient = () => null
const isSupabaseConfigured = () => false`)
  files["supabase/sync.mjs"] = rewrite(syn)
}
{
  files["inquiries.mjs"] = rewrite(readFileSync("src/lib/inquiries.ts", "utf8"))
}
{
  files["portal-content.mjs"] = rewrite(readFileSync("src/lib/portal-content.ts", "utf8"))
}

{
  const { writeFileSync, mkdirSync: mkd } = await import("node:fs")
  mkd(join(TMP, "supabase"), { recursive: true })
  for (const [name, src] of Object.entries(files)) {
    const js = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText
    writeFileSync(join(TMP, name), js, "utf8")
  }
}

const DS = await import("file://" + join(TMP, "data-storage.mjs"))
const SA = await import("file://" + join(TMP, "student-accounts.mjs"))
const SR = await import("file://" + join(TMP, "student-report.mjs"))
const IQ = await import("file://" + join(TMP, "inquiries.mjs"))
const PC = await import("file://" + join(TMP, "portal-content.mjs"))

// jsdom لا يحسب أبعاداً حقيقية → محاكاة ارتفاع ثابت لكل عنصر (كما في اختبار الجدول)
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { width: 794, height: 420, top: 0, left: 0, right: 794, bottom: 420, x: 0, y: 0, toJSON: () => ({}) }
}

// ============================================================
let pass = 0, fail = 0
const fails = []
const eq = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅ " + name) }
  else { fail++; fails.push(name + (extra ? ` — ${extra}` : "")); console.log("  ❌ " + name + (extra ? " — " + extra : "")) }
}
const section = (t) => console.log(`\n${"=".repeat(56)}\n${t}\n${"=".repeat(56)}`)

const dateSlash = (iso) => {
  const d = new Date(iso)
  if (isNaN(d)) return ""
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

const NOW = new Date()
const Y = NOW.getFullYear()
const M = NOW.getMonth() + 1

// ---- بيانات أساسية: صفان، لكل صف مجموعتان ----
const grade1 = { id: "g-1", name: "الصف الأول الثانوي", academicYear: "2025-2026", createdAt: new Date().toISOString(), groups: [
  { id: "gr-1", name: "مجموعة السبت والثلاثاء", days: ["السبت", "الثلاثاء"], startTime: "16:00", endTime: "18:00", monthlyFee: 300, studentsCount: 0 },
  { id: "gr-2", name: "مجموعة الأحد والأربعاء", days: ["الأحد", "الأربعاء"], startTime: "18:00", endTime: "20:00", monthlyFee: 300, studentsCount: 0 },
] }
const grade2 = { id: "g-2", name: "الصف الثاني الثانوي", academicYear: "2025-2026", createdAt: new Date().toISOString(), groups: [
  { id: "gr-3", name: "مجموعة الجمعة", days: ["الجمعة"], startTime: "14:00", endTime: "16:00", monthlyFee: 350, studentsCount: 0 },
] }
DS.saveGrades([grade1, grade2])

// طالب قديم بياناته اليدوية موجودة (بدون بريد) — مرشح للربط
const existingStudent = {
  id: "st-old", name: "أحمد سيد إبراهيم", phone: "01000000001", gradeId: "g-1", groupId: "gr-1",
  status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}
DS.saveStudents([existingStudent])

// ============================================================
section("سيناريو 1: التسجيل — التحققات ومنع التكرار والخصوصية")

// إغلاق التسجيل يمنع التقديم
SA.setRegistrationOpen(false)
eq("التسجيل مغلق → يُرفض الطلب", !(await SA.registerStudentAccount({ name: "محمد علي حسن", phone: "01000000002", email: "mohamed@test.com", password: "secret1", confirmPassword: "secret1", gradeId: "g-1", groupId: "gr-1" })).ok)
SA.setRegistrationOpen(true)

const base = { name: "محمد علي حسن", phone: "01000000001", guardianPhone: "01111111111", email: "Mohamed@Test.com", password: "secret1", confirmPassword: "secret1", gradeId: "g-1", groupId: "gr-1" }
SA.resetRateLimits()
eq("بريد بحروف عربية → يُرفض", !(await SA.registerStudentAccount({ ...base, email: "طالب@مدرسة.كوم", phone: "01000000099", guardianPhone: "01111111112" })).ok)
eq("حروف في رقم الهاتف → يُرفض", !(await SA.registerStudentAccount({ ...base, phone: "010abc23456" })).ok)
eq("أرقام في الاسم → يُرفض", !(await SA.registerStudentAccount({ ...base, name: "محمد علي 123" })).ok)
SA.resetRateLimits()
const arReq0 = await SA.registerStudentAccount({ ...base, phone: "٠١٠٠٠٠٠٠٠٠١", email: "test-arabic-digits@test.com" })
if (arReq0.ok) {
  const arReqSaved = DS.getRegistrationRequests().find(r => r.email === "test-arabic-digits@test.com")
  eq("الأرقام العربية-الهندية في الهاتف تُوحَّد إلى لاتينية", arReqSaved?.phone === "01000000001")
  DS.saveRegistrationRequests(DS.getRegistrationRequests().filter(r => r.email !== "test-arabic-digits@test.com"))
} else {
  eq("توحيد الأرقام العربية (رُفض لسبب آخر)", false, arReq0.error || "")
}
eq("بدون هاتف ولي الأمر → يُرفض (إجباري)", !(await SA.registerStudentAccount({ ...base, guardianPhone: "", email: "noguardian@test.com" })).ok)
eq("اسم قصير جداً → يُرفض", !(await SA.registerStudentAccount({ ...base, name: "محمد" })).ok)
eq("هاتف غير صحيح → يُرفض", !(await SA.registerStudentAccount({ ...base, phone: "12" })).ok)
eq("بريد غير صحيح → يُرفض", !(await SA.registerStudentAccount({ ...base, email: "not-an-email" })).ok)
eq("بدون صف/مجموعة → يُرفض", !(await SA.registerStudentAccount({ ...base, gradeId: "", groupId: "" })).ok)
eq("مجموعة لا تنتمي للصف → تُرفض", !(await SA.registerStudentAccount({ ...base, groupId: "gr-3" })).ok)
eq("كلمة مرور قصيرة → تُرفض", !(await SA.registerStudentAccount({ ...base, password: "123", confirmPassword: "123" })).ok)
eq("تأكيد غير مطابق → يُرفض", !(await SA.registerStudentAccount({ ...base, confirmPassword: "different" })).ok)

SA.resetRateLimits()
const regOk = await SA.registerStudentAccount(base)
eq("طلب صحيح → يُقبل", regOk.ok === true, regOk.error || "")
const requests1 = DS.getRegistrationRequests()
eq("الطلب محفوظ pending", requests1.length === 1 && requests1[0].status === "pending")
eq("البريد يُخزَّن بحروف صغيرة", requests1[0].email === "mohamed@test.com")
eq("كلمة المرور ليست نصاً صريحاً (بصمة فقط)", requests1[0].passwordHash && requests1[0].passwordHash !== "secret1" && requests1[0].passwordHash.length >= 32)
eq("لا جلسة دخول قبل الموافقة", SA.getPortalSession() === null)

eq("نفس البريد مرة أخرى → يُرفض (تكرار)", !(await SA.registerStudentAccount({ ...base, phone: "01111111111" })).ok)
eq("نفس الهاتف معلق آخر → يُرفض", !(await SA.registerStudentAccount({ ...base, email: "other@test.com", phone: "01000000001" })).ok)

// الدخول قبل الموافقة ممنوع
const earlyLogin = await SA.portalLogin("mohamed@test.com", "secret1")
eq("الدخول قبل الموافقة → ممنوع (pending)", earlyLogin.ok === false && earlyLogin.status === "pending")
const badPw = await SA.portalLogin("mohamed@test.com", "wrong-password")
eq("كلمة مرور خاطئة → يُرفض", badPw.ok === false && !badPw.status)

// ============================================================
section("سيناريو 2: الموافقة — تحديث الطالب الموجود وربطه (مطابقة الهاتف)")

const outcome1 = SA.approveRegistrationRequest(requests1[0].id)
eq("الموافقة تنجح", outcome1.ok === true, outcome1.message || "")
const studentsAfter1 = DS.getStudents()
const oldAfter = studentsAfter1.find(s => s.id === "st-old")
eq("لم يُنشأ طالب جديد — تم تحديث الموجود", studentsAfter1.length === 1)
eq("بريد الطالب القديم حُدّث من الطلب", oldAfter?.email === "mohamed@test.com")
eq("اسم الطالب حُدّث من الطلب", oldAfter?.name === "محمد علي حسن")
eq("المجموعة كما طلبها (نفسها هنا)", oldAfter?.groupId === "gr-1")
const req1After = DS.getRegistrationRequests()[0]
eq("الطلب أصبح approved ومربوط بالطالب", req1After.status === "approved" && req1After.linkedStudentId === "st-old")
const acc1 = DS.getStudentAccounts().find(a => a.email === "mohamed@test.com")
eq("حساب بوابة نشط مربوط بالطالب", !!acc1 && acc1.active === true && acc1.studentId === "st-old")
eq("سجل نشاط يوثّق الربط", DS.getStudentHistory().some(h => h.studentId === "st-old"))

const login1 = await SA.portalLogin("mohamed@test.com", "secret1")
eq("الدخول بعد الموافقة → ناجح", login1.ok === true && login1.session.studentId === "st-old" && login1.session.name === "محمد علي حسن")
SA.portalLogout()
eq("تسجيل الخروج يمسح الجلسة", SA.getPortalSession() === null)

// ============================================================
section("سيناريو 3: الموافقة بدون بيانات سابقة → إنشاء طالب فوري")

SA.resetRateLimits()
const reg2 = await SA.registerStudentAccount({ name: "سارة محمود خالد", phone: "01000000003", guardianPhone: "01111111113", email: "sara@test.com", password: "sara123", confirmPassword: "sara123", gradeId: "g-2", groupId: "gr-3" })
eq("طلب سارة يُقبل", reg2.ok === true, reg2.error || "")
const beforeCount = DS.getStudents().length
const outcome2 = SA.approveRegistrationRequest(DS.getRegistrationRequests().find(r => r.email === "sara@test.com").id)
eq("موافقة سارة تنجح", outcome2.ok === true, outcome2.message || "")
const studentsAfter2 = DS.getStudents()
eq("أُنشئ طالب جديد فوراً", studentsAfter2.length === beforeCount + 1)
const sara = studentsAfter2.find(s => s.name === "سارة محمود خالد")
eq("الطالب الجديد على صفه ومجموعته المطلوبتين", !!sara && sara.gradeId === "g-2" && sara.groupId === "gr-3")
eq("الطالب الجديد له بريد الهاتف من الطلب", !!sara && sara.email === "sara@test.com" && sara.phone === "01000000003")
const saraLogin = await SA.portalLogin("sara@test.com", "sara123")
eq("سارة تسجل الدخول مباشرة بعد الموافقة", saraLogin.ok === true && saraLogin.session.studentId === sara?.id)
SA.portalLogout()

// ============================================================
section("سيناريو 4: الرفض وإعادة التقديم وحظر الحساب")

SA.resetRateLimits()
const reg3 = await SA.registerStudentAccount({ name: "كريم فؤاد سيد", phone: "01000000004", guardianPhone: "01111111114", email: "karim@test.com", password: "karim123", confirmPassword: "karim123", gradeId: "g-1", groupId: "gr-2" })
eq("طلب كريم يُقبل", reg3.ok === true)
const karimReqId = DS.getRegistrationRequests().find(r => r.email === "karim@test.com").id
const rej = SA.rejectRegistrationRequest(karimReqId, "البيانات غير مكتملة")
eq("الرفض مع سبب ينجح", rej.ok === true)
const karimReqAfter = DS.getRegistrationRequests().find(r => r.id === karimReqId)
eq("حالة الطلب rejected مع السبب", karimReqAfter.status === "rejected" && karimReqAfter.reviewNote === "البيانات غير مكتملة")
const karimLogin1 = await SA.portalLogin("karim@test.com", "karim123")
eq("الدخول بعد الرفض → ممنوع (rejected)", karimLogin1.ok === false && karimLogin1.status === "rejected")

// إعادة التقديم بنفس البريد بعد الرفض مسموحة
SA.resetRateLimits()
const sameEmail = await SA.registerStudentAccount({ name: "كريم فؤاد سيد", phone: "01000000004", guardianPhone: "01111111114", email: "karim@test.com", password: "karim123", confirmPassword: "karim123", gradeId: "g-1", groupId: "gr-2" })
eq("البريد المستخدم في طلب مرفوض لا يُعاد (فريد نهائياً)", sameEmail.ok === false, "المفروض يُرفض")

// نفس الهاتف بعد رفض حديث → ممنوع (مهلة يومين) — ثم نؤرخ الطلب القديم 3 أيام للخلف فيُسمح
SA.resetRateLimits()
const phoneCool = await SA.registerStudentAccount({ name: "كريم فؤاد سيد", phone: "01000000004", guardianPhone: "01111111114", email: "karim2@test.com", password: "karim123", confirmPassword: "karim123", gradeId: "g-1", groupId: "gr-2" })
eq("نفس الهاتف خلال مهلة يومين → ممنوع", phoneCool.ok === false, phoneCool.error || "قبول خاطئ")

const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
DS.saveRegistrationRequests(
  DS.getRegistrationRequests().map(r => (r.email === "karim@test.com" ? { ...r, createdAt: threeDaysAgo } : r))
)
SA.resetRateLimits()
const reg3b = await SA.registerStudentAccount({ name: "كريم فؤاد سيد", phone: "01000000004", guardianPhone: "01111111114", email: "karim2@test.com", password: "karim123", confirmPassword: "karim123", gradeId: "g-1", groupId: "gr-2" })
eq("بعد مرور مهلة اليومين: نفس الهاتف يُقبل (البريد جديد)", reg3b.ok === true, reg3b.error || "")
const karimReq2 = DS.getRegistrationRequests().find(r => r.email === "karim2@test.com")
eq("الطلب الجديد pending وبه هاتف ولي الأمر", karimReq2?.status === "pending" && karimReq2?.guardianPhone === "01111111114")

// موافقة ثم حظر ثم إعادة تفعيل ثم حذف الحساب
SA.approveRegistrationRequest(karimReq2.id)
const karimId = DS.getRegistrationRequests().find(r => r.email === "karim2@test.com")?.linkedStudentId
const blockRes = SA.setStudentPortalActive(karimId, false)
eq("حظر الطالب ينجح", blockRes.ok === true)
const karimLogin2 = await SA.portalLogin("karim2@test.com", "karim123")
eq("الدخول بعد الحظر → ممنوع (blocked)", karimLogin2.ok === false && karimLogin2.status === "blocked")
SA.setStudentPortalActive(karimId, true)
const karimLogin3 = await SA.portalLogin("karim2@test.com", "karim123")
eq("إعادة التفعيل تسمح بالدخول", karimLogin3.ok === true)
SA.portalLogout()

// ============================================================
section("سيناريو 5: طلبات النقل — نفس الصف فقط والموافقة تنقل وتوثق")

const saraId = sara.id
const toOtherGrade = await SA.requestGroupTransfer(saraId, "gr-1")
eq("نقل لمجموعة في صف آخر → ممنوع", toOtherGrade.ok === false)
const sameGroup = await SA.requestGroupTransfer(saraId, "gr-3")
eq("نقل لنفس مجموعته → مرفوض", sameGroup.ok === false)
const tr1 = await SA.requestGroupTransfer(saraId, "gr-3" === "" ? "" : (await 0) || (grade2.groups[0].id))
const trSame = await SA.requestGroupTransfer(saraId, "gr-4-nope")
eq("مجموعة غير موجودة → مرفوض", trSame.ok === false)

// سارة في gr-3 (صف 2) — أنشئ مجموعة ثانية في نفس الصف لطلب النقل
grade2.groups.push({ id: "gr-4", name: "مجموعة السبت", days: ["السبت"], startTime: "10:00", endTime: "12:00", monthlyFee: 350, studentsCount: 0 })
DS.saveGrades([grade1, grade2])
const trOk = await SA.requestGroupTransfer(saraId, "gr-4")
eq("طلب نقل لمجموعة بنفس الصف → يُقبل", trOk.ok === true, trOk.error || "")
const trDup = await SA.requestGroupTransfer(saraId, "gr-4")
eq("تكرار نفس الطلب المعلق → مرفوض", trDup.ok === false)

const historyBefore = DS.getStudentHistory().filter(h => h.studentId === saraId).length
const trApprove = SA.approveGroupTransferRequest(DS.getGroupTransferRequests().find(t => t.studentId === saraId && t.status === "pending").id)
eq("موافقة النقل تنجح", trApprove.ok === true, trApprove.message || "")
eq("الطالب انتقل فعلاً للمجموعة الجديدة", DS.getStudents().find(s => s.id === saraId)?.groupId === "gr-4")
const historyAfter = DS.getStudentHistory().filter(h => h.studentId === saraId)
eq("حدث نقل وُثّق في السجل", historyAfter.length === historyBefore + 1 && historyAfter.some(h => h.type === "transfer"))
SA.rejectGroupTransferRequest("nonexistent", "") // لا يجب أن يكسر شيئاً
eq("رفض طلب غير موجود لا يكسر التنفيذ", true)

// ============================================================
section("سيناريو 6: تقرير الطالب — دمج كل المصادر")

// بيانات أحمد (st-old): درجة يدوية + محاولة اختبار + استحقاق/دفعة + حضور + تكريم
const manualGrades = [{
  id: "mg-1", studentId: "st-old", gradeId: "g-1", groupId: "gr-1",
  title: "واجب الوحدة الأولى", score: 8, maxScore: 10, month: M, year: Y,
  notes: "أداء ممتاز", createdAt: new Date().toISOString(),
}]
DS.saveManualGrades(manualGrades)
eq("حفظ الدرجات اليدوية يعمل", DS.getManualGrades().length === 1)

const attempts = [{
  id: "att-ex-1", examId: "ex-1", studentId: "st-old", studentName: "محمد علي حسن",
  groupId: "gr-1", gradeId: "g-1", answers: {}, score: 15, totalMarks: 20,
  startedAt: new Date().toISOString(), submittedAt: new Date().toISOString(), durationSeconds: 600,
}]
DS.saveExamAttempts(attempts)

DS.saveDues([{ id: "due-1", studentId: "st-old", groupId: "gr-1", month: M, year: Y, amount: 100, status: "partial", createdAt: new Date().toISOString() }])
DS.savePayments([{ id: "pay-1", studentId: "st-old", amount: 60, paymentDate: new Date().toISOString(), month: M, year: Y, createdAt: new Date().toISOString() }])

DS.saveAttendance([
  { id: "a1", sessionId: `att-gr-1-${Y}-0${M}-01`, studentId: "st-old", groupId: "gr-1", date: `${Y}-0${M}-01`, status: "present", createdAt: new Date().toISOString() },
  { id: "a2", sessionId: `att-gr-1-${Y}-0${M}-02`, studentId: "st-old", groupId: "gr-1", date: `${Y}-0${M}-02`, status: "present", createdAt: new Date().toISOString() },
  { id: "a3", sessionId: `att-gr-1-${Y}-0${M}-03`, studentId: "st-old", groupId: "gr-1", date: `${Y}-0${M}-03`, status: "late", createdAt: new Date().toISOString() },
  { id: "a4", sessionId: `att-gr-1-${Y}-0${M}-04`, studentId: "st-old", groupId: "gr-1", date: `${Y}-0${M}-04`, status: "absent", createdAt: new Date().toISOString() },
])

const honoree = { id: "h-1", studentId: "st-old", studentName: "محمد علي حسن", groupId: "gr-1", reason: "النجاح والتفوق", month: M, year: Y, days: 30, createdAt: new Date().toISOString() }
DS.saveHonorees([honoree])

const report = SR.collectStudentReport("st-old")
eq("التقرير يجمع الطالب الصحيح", report.student.id === "st-old")
eq("الدرجات اليدوية ظهرت في التقرير", report.manualGrades.length === 1 && report.manualGrades[0].title === "واجب الوحدة الأولى")
eq("محاولة الاختبار الإلكتروني ظهرت بعنوانها", report.examAttempts.length === 1 && report.examAttempts[0].totalMarks === 20)
eq("الاستحقاقات والدفعات صحيحة", report.totalDue === 100 && report.totalPaid === 60)
eq("الرصيد = 100 - 60 = 40", report.balance === 40)
eq("الحضور: 4 أيام، 3 حضور (متأخر يحسب حضوراً)، نسبة 75%", report.attendance.total === 4 && report.attendance.present === 3 && report.attendance.absent === 1 && report.attendance.rate === 75)
eq("التكريم ظاهر في التقرير", report.honors.length === 1)
eq("عناوين التقارير عربية", SR.STUDENT_REPORT_LABELS.comprehensive.startsWith("التقرير الشامل") && SR.STUDENT_REPORT_LABELS.payments.includes("المدفوعات"))

// سجل النقل ظهر في تقرير أحمد؟ لا — لكنه ظهر في تقرير سارة
const saraReport = SR.collectStudentReport(saraId)
eq("سجل سارة يتضمن حدث النقل", saraReport.history.some(h => h.type === "transfer"))

// ============================================================
section("سيناريو 7: توليد صفحات التقرير (5 أنواع × وضعا الطباعة)")

const mockRects = () => {
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 794, height: 420, top: 0, left: 0, right: 794, bottom: 420, x: 0, y: 0, toJSON: () => ({}) }
  }
}
mockRects()

const types = ["comprehensive", "grades", "payments", "attendance", "history"]
let allPagesOk = true
for (const t of types) {
  const built = SR.buildStudentReportPagesHtml({ report, type: t, mode: "teacher" })
  if (!built || !built.html || built.pageCount < 1) allPagesOk = false
}
eq("الأنواع الخمسة تولّد صفحات A4 (صفحة على الأقل لكل نوع)", allPagesOk)

const comp = SR.buildStudentReportPagesHtml({ report, type: "comprehensive", mode: "teacher" })
const balTxt = (40).toLocaleString("ar-EG")
eq("نسخة المدرس تتضمن الاسم والرصيد", comp.html.includes("محمد علي حسن") && comp.html.includes(balTxt))
eq("نسخة المدرس تتضمن الدرجات والمدفوعات والحضور", comp.html.includes("واجب الوحدة الأولى") && comp.html.includes((60).toLocaleString("ar-EG")) && comp.html.includes("75%"))
eq("تذييل الصفحة يوضح رقم الصفحة", /صفحة\s*1\s*من/.test(comp.html))
eq("نسخة المدرس تحمل اسم المعلم والتوقيع", comp.html.includes("أ/ ضحى العربي"))

const studentVer = SR.buildStudentReportPagesHtml({ report, type: "comprehensive", mode: "student" })
eq("نسخة ولي الأمر تحمل علامة «نسخة ولي الأمر»", studentVer.html.includes("نسخة ولي الأمر"))

const emptyReport = SR.collectStudentReport(saraId)
const emptyBuilt = SR.buildStudentReportPagesHtml({ report: emptyReport, type: "grades", mode: "teacher" })
eq("طالب بلا بيانات → صفحةplaceholder ولا انهيار", emptyBuilt.pageCount >= 1 && emptyBuilt.html.length > 100)

// ============================================================
section("سيناريو 8: إعدادات البوابة")

SA.setRegistrationOpen(false)
eq("إغلاق التسجيل يمنع طلباً جديداً", !(await SA.registerStudentAccount({ ...base, email: "new@test.com", phone: "01200000000" })).ok)
eq("isRegistrationOpen تقرأ المفتاح", SA.isRegistrationOpen() === false)
SA.setRegistrationOpen(true)
eq("فتح التسجيل يعمل", SA.isRegistrationOpen() === true)

SA.setStudentReportsEnabled(false)
eq("إيقاف تقارير الطلاب", SA.areStudentReportsEnabled() === false)
SA.setStudentReportsEnabled(true)
eq("تفعيل تقارير الطلاب", SA.areStudentReportsEnabled() === true)

// حذف الطالب ينظف حسابه
SA.removeStudentPortalAccount(saraId)
eq("حذف الحساب يزيل ربط البريد", !DS.getStudentAccounts().some(a => a.studentId === saraId))

// ============================================================
section("سيناريو 8-ب: حدود الطلبات (الحماية من الإغراق)")

SA.resetRateLimits()
await SA.registerStudentAccount({ name: "طالب الحد الأول", phone: "01200000021", guardianPhone: "01200000091", email: "limit1@test.com", password: "limit123", confirmPassword: "limit123", gradeId: "g-1", groupId: "gr-1" })
const limit2 = await SA.registerStudentAccount({ name: "طالب الحد الثاني", phone: "01200000022", guardianPhone: "01200000092", email: "limit2@test.com", password: "limit123", confirmPassword: "limit123", gradeId: "g-1", groupId: "gr-1" })
eq("طلب ثانٍ بعد 10 دقائق أقل → محجوب (حد الجهاز)", limit2.ok === false && /انتظر/.test(limit2.error || ""), limit2.error || "")
SA.resetRateLimits()

// حد محاولات الدخول الفاشلة: 5/15 دقيقة
const mohamedMail = "mohamed@test.com"
SA.resetRateLimits()
let failCount = 0
for (let i = 0; i < 7; i++) {
  const r = await SA.portalLogin(mohamedMail, "wrong-pass")
  if (!r.ok && /محاولات كثيرة/.test(r.error || "")) break
  failCount++
}
eq("بعد 5 محاولات فاشلة → تُقفل المحاولات مؤقتاً", failCount === 5, `فشل قبل القفل: ${failCount}`)
SA.resetRateLimits()
const okAfterReset = await SA.portalLogin(mohamedMail, "secret1")
eq("بعد تصفير الحد → الدخول ينجح طبيعياً", okAfterReset.ok === true)
SA.portalLogout()

// ============================================================
section("سيناريو 9: الجلسة — صلاحية 30 يوماً + كوكيز")

const sessLogin = await SA.portalLogin("mohamed@test.com", "secret1")
eq("الدخول ينشئ جلسة منضبطة بالوقت", sessLogin.ok === true && typeof sessLogin.session.exp === "number" && sessLogin.session.exp > Date.now() + 29 * 24 * 3600 * 1000)
eq("كوكي الجلسة كُتب (مرآة للميدل وير)", document.cookie.includes("studentPortalSession="))
// انتهاء الصلاحية → الجلسة تُلغى
const rawSess = JSON.parse(localStorage.getItem("studentPortalSession"))
localStorage.setItem("studentPortalSession", JSON.stringify({ ...rawSess, exp: Date.now() - 1000 }))
eq("جلسة منتهية الصلاحية → تُلغى تلقائياً", SA.getPortalSession() === null)
eq("الخروج يمسح الكوكي أيضاً", (SA.portalLogout(), !document.cookie.includes("studentPortalSession=")))

// ============================================================
section("سيناريو 10: الاستفسارات — رسالة واحدة ورد وغلق")

const saraLogin2 = await SA.portalLogin("sara@test.com", "sara123")
const saraSess = saraLogin2.session
eq("سارة تدخل للاختبار", !!saraSess)
SA.portalLogout()

const inqState0 = IQ.canStudentSendInquiry(saraId)
eq("لا استفسارات سابقة → مسموح الإرسال", inqState0.allowed === true)
const inq1 = await IQ.sendStudentInquiry(saraId, "هل الامتحان الأسبوع القادم شامل الوحدة الثالثة؟")
eq("إرسال الاستفسار ينجح", inq1.ok === true, inq1.error || "")
const inq2 = await IQ.sendStudentInquiry(saraId, "رسالة ثانية قبل الرد")
eq("رسالة ثانية قبل رد المعلم → ممنوعة", inq2.ok === false)
const thread1 = IQ.getInquiries().find(t => t.studentId === saraId)
eq("الاستفسار محفوظ مفتوحاً برسالة الطالب", thread1?.status === "open" && thread1?.messages.length === 1 && thread1.messages[0].from === "student")

const rep1 = IQ.teacherReplyInquiry(thread1.id, "نعم شامل — ركز على درس الطاقة")
eq("رد المعلم ينجح", rep1.ok === true, rep1.error || "")
const inq3 = await IQ.sendStudentInquiry(saraId, "شكراً — وهل هو بدرجة 20؟")
eq("الطالب يرد مرة أخرى بعد رد المعلم (مفتوح)", inq3.ok === true, inq3.error || "")
const close1 = IQ.teacherCloseInquiry(thread1.id)
eq("المعلم يغلق الاستفسار", close1.ok === true)
const inq4 = await IQ.sendStudentInquiry(saraId, "سؤال بعد الغلق")
eq("الطالب يفتح استفساراً جديداً بعد الغلق", inq4.ok === true, inq4.error || "")
const repClosed = IQ.teacherReplyInquiry(thread1.id, "رد بعد الغلق")
eq("رد المعلم على استفسار مغلق → مرفوض", repClosed.ok === false)
// نظافة: أغلق الاستفسار الجديد كي لا يؤثر على بقية الفحوصات
const lastThread = IQ.getInquiries().filter(t => t.studentId === saraId).pop()
IQ.teacherCloseInquiry(lastThread.id)

// ============================================================
section("سيناريو 11: إتاحة الاختبارات + العزل حسب الصف/المجموعة + التعديل اليدوي")

const mkExam = (over) => ({
  id: "ex-av-1", gradeId: "g-1", title: "اختبار الوحدة", academicYear: "2025-2026",
  questions: [], allowOnline: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  ...over,
})
eq("مفتوح دائماً → متاح", PC.examAvailability(mkExam({})).open === true)
eq("غير منشور → مغلق", PC.examAvailability(mkExam({ allowOnline: false })).open === false)

const nowIso = () => new Date().toISOString()
eq("فترة مستقبلية → مغلق الآن", PC.examAvailability(mkExam({ availabilityMode: "scheduled", availableFrom: new Date(Date.now() + 3600e3).toISOString(), availableUntil: new Date(Date.now() + 7200e3).toISOString() })).open === false)
eq("فترة منتهية → مغلق", PC.examAvailability(mkExam({ availabilityMode: "scheduled", availableFrom: new Date(Date.now() - 7200e3).toISOString(), availableUntil: new Date(Date.now() - 3600e3).toISOString() })).open === false)
eq("داخل الفترة → متاح", PC.examAvailability(mkExam({ availabilityMode: "scheduled", availableFrom: new Date(Date.now() - 3600e3).toISOString(), availableUntil: new Date(Date.now() + 3600e3).toISOString() })).open === true)

eq("اختبار لصف آخر → لا يظهر للطالب", PC.isExamForStudent(mkExam({ gradeId: "g-2" }), "g-1", "gr-1") === false)
eq("اختبار الصف بلا استهداف مجموعات → يظهر لكل المجموعات", PC.isExamForStudent(mkExam({}), "g-1", "gr-2") === true)
eq("اختبار لمجموعة محددة → لا يظهر لمجموعة أخرى", PC.isExamForStudent(mkExam({ targetGroupIds: ["gr-2"] }), "g-1", "gr-1") === false)
eq("اختبار للمجموعة المستهدفة → يظهر", PC.isExamForStudent(mkExam({ targetGroupIds: ["gr-1"] }), "g-1", "gr-1") === true)
eq("اختبار عام (بلا صف) → يظهر لكل الصفوف", PC.isExamForStudent(mkExam({ gradeId: "" }), "g-2", "gr-3") === true)
eq("اختبار عام لمجموعات محددة → يظهر لها فقط", PC.isExamForStudent(mkExam({ gradeId: "", targetGroupIds: ["gr-3"] }), "g-1", "gr-1") === false && PC.isExamForStudent(mkExam({ gradeId: "", targetGroupIds: ["gr-3"] }), "g-2", "gr-3") === true)

// ============================================================
section("سيناريو 11-ب: تقرير شهري مقابل سنوي (فلتر الشهر)")

// أحمد: درجة يدوية + محاولة + استحقاق/دفعة كلها في الشهر الحالي → ثم نضيف بيانات شهر آخر
const otherMonth = M === 1 ? 12 : M - 1
const otherYear = M === 1 ? Y - 1 : Y
DS.saveManualGrades([
  ...DS.getManualGrades(),
  { id: "mg-om", studentId: "st-old", gradeId: "g-1", groupId: "gr-1", title: "واجب شهر آخر", score: 5, maxScore: 10, month: otherMonth, year: otherYear, createdAt: new Date().toISOString() },
])
DS.saveDues([...DS.getDues(), { id: "due-om", studentId: "st-old", groupId: "gr-1", month: otherMonth, year: otherYear, amount: 200, status: "paid", createdAt: new Date().toISOString() }])

const fullYear = SR.collectStudentReport("st-old")
const yearPages = SR.buildStudentReportPagesHtml({ report: fullYear, type: "grades", mode: "teacher" })
eq("التقرير السنوي يشمل درجات كل الشهور", yearPages.html.includes("واجب الوحدة الأولى") && yearPages.html.includes("واجب شهر آخر"))

const monthPages = SR.buildStudentReportPagesHtml({ report: fullYear, type: "grades", mode: "teacher", month: M })
eq("التقرير الشهري يعرض درجات الشهر فقط", monthPages.html.includes("واجب الوحدة الأولى") && !monthPages.html.includes("واجب شهر آخر"))

const payYear = SR.buildStudentReportPagesHtml({ report: fullYear, type: "payments", mode: "teacher" })
const payMonth = SR.buildStudentReportPagesHtml({ report: fullYear, type: "payments", mode: "teacher", month: M })
eq("السنوي: إجمالي الاستحقاقات = 300", payYear.html.includes((300).toLocaleString("ar-EG")))
eq("الشهري: إجمالي الاستحقاقات = 100 فقط", payMonth.html.includes((100).toLocaleString("ar-EG")) && !payMonth.html.includes((300).toLocaleString("ar-EG")))
eq("الشهري: كشف المطابقة يعرض الشهر المطلوب فقط", payMonth.html.includes(`${M}/`) && !payMonth.html.includes(`${otherMonth}/${otherYear}`))

const attemptWithOverride = { score: 10, manualOverride: { score: 17, reason: "تساهل", at: nowIso() } }
eq("الدرجة الفعلية تراعي التعديل اليدوي", PC.effectiveAttemptScore(attemptWithOverride) === 17)
eq("بدون تعديل → الدرجة الآلية", PC.effectiveAttemptScore({ score: 10 }) === 10)

// ============================================================
section("سيناريو 12: عزل الإعلانات والأسئلة المهمة حسب الصف")

const anns = [
  { id: "a1", title: "عام", body: "للجميع", pinned: false, targetGradeIds: [], createdAt: nowIso() },
  { id: "a2", title: "سؤال الصف الأول", body: "خاص", pinned: false, targetGradeIds: ["g-1"], createdAt: nowIso() },
  { id: "a3", title: "سؤال الصف الثاني", body: "لغيره", pinned: false, targetGradeIds: ["g-2"], createdAt: nowIso() },
]
const g1Anns = PC.announcementsForGrade(anns, "g-1")
eq("طالب الصف الأول يرى العام + خاص بصفه فقط", g1Anns.length === 2 && g1Anns.some(a => a.id === "a2") && !g1Anns.some(a => a.id === "a3"))
const g2Anns = PC.announcementsForGrade(anns, "g-2")
eq("طالب الصف الثاني لا يرى سؤال الصف الأول بأي شكل", g2Anns.length === 2 && !g2Anns.some(a => a.id === "a2"))

// ============================================================
section("سيناريو 13: كشف الحساب في تقرير الطالب (استحقاق/مدفوع/متبقي)")

// أحمد: استحقاق 100 دُفع منه 60 → متبقي 40
const rep2 = SR.collectStudentReport("st-old")
eq("التقرير يحمل المستحقات بكامل حالتها", rep2.dues.length === 2 && rep2.dues.some(d => d.amount === 100) && rep2.dues.some(d => d.amount === 200))
const stmtPages = SR.buildStudentReportPagesHtml({ report: rep2, type: "payments", mode: "teacher" })
eq("كشف الحساب يعرض الاستحقاق والمدفوع والمتبقي", stmtPages.html.includes("كشف الحساب الشهري") && stmtPages.html.includes("الرصيد المتبقي"))
eq("كشف الحساب يوضح الحالة الجزئية", stmtPages.html.includes("جزئي") && stmtPages.html.includes((40).toLocaleString("ar-EG")))
const arMonthName = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"][new Date().getMonth()]
eq("سجل الدفعات يعرض تاريخ التحصيل الفعلي", stmtPages.html.includes("سجل الدفعات") && stmtPages.html.includes(`${arMonthName} ${new Date().getDate()}`))

// درجة الاختبار المعدلة يدوياً في التقرير
const attemptsNow = DS.getExamAttempts().map(a =>
  a.id === "att-ex-1" ? { ...a, manualOverride: { score: 19, reason: "الآلي لم ير صياغة صحيحة", at: nowIso() } } : a
)
DS.saveExamAttempts(attemptsNow)
const rep3 = SR.collectStudentReport("st-old")
const gradesPages = SR.buildStudentReportPagesHtml({ report: rep3, type: "grades", mode: "teacher" })
eq("التقرير يعرض الدرجة المعدلة يدوياً مع الأصلية", gradesPages.html.includes("درجة معدلة يدوياً") && gradesPages.html.includes("19") && gradesPages.html.includes("15"))

// ============================================================
section("سيناريو 14: إدارة المدرس للحساب — كلمة مرور جديدة وتعديل البريد")

SA.resetRateLimits()
const recReg = await SA.registerStudentAccount({ name: "طالب الاسترجاع علي", phone: "01200000055", guardianPhone: "01200000095", email: "recover@test.com", password: "oldpass1", confirmPassword: "oldpass1", gradeId: "g-1", groupId: "gr-1" })
eq("تسجيل طالب الاسترجاع ينجح", recReg.ok === true, recReg.error || "")
const recOutcome = SA.approveRegistrationRequest(DS.getRegistrationRequests().find(r => r.email === "recover@test.com").id)
eq("موافقة المدرس تنشئ الطالب", recOutcome.ok === true && !!recOutcome.studentId, recOutcome.message || "")
const recStudentId = recOutcome.studentId

// إعادة تعيين كلمة المرور من المدرس
const noAccStudent = DS.getStudents().find(s => !DS.getStudentAccounts().some(a => a.studentId === s.id))
const noAcc = noAccStudent ? await SA.resetStudentPasswordByTeacher(noAccStudent.id) : { ok: false }
if (noAccStudent) eq("طالب بلا حساب بوابة → رسالة واضحة", noAcc.ok === false && /التسجيل/.test(noAcc.message || ""))

const reset1 = await SA.resetStudentPasswordByTeacher(recStudentId)
eq("إعادة التعيين تنجح وتنتج كلمة مؤقتة", reset1.ok === true && /^[a-z0-9]{7}$/.test(reset1.temporaryPassword || ""), reset1.message || "")
const oldLogin = await SA.portalLogin("recover@test.com", "oldpass1")
eq("الكلمة القديمة تتوقف عن العمل", oldLogin.ok === false)
SA.portalLogout()
const newLogin = await SA.portalLogin("recover@test.com", reset1.ok ? reset1.temporaryPassword : "x")
eq("الدخول بالكلمة المؤقتة ينجح", newLogin.ok === true)
SA.portalLogout()
const accAfterReset = DS.getStudentAccounts().find(a => a.studentId === recStudentId)
eq("البصمة تُخزَّن ولا تُخزَّن الكلمة نصاً", !!accAfterReset?.passwordHash && accAfterReset.passwordHash !== reset1.temporaryPassword)
eq("سجل النشاط يوثق إعادة التعيين", DS.getStudentHistory().some(h => h.studentId === recStudentId && h.title === "إعادة إنشاء كلمة المرور"))

// تعديل البريد من المدرس يحدّث حساب الدخول
const dup = DS.getStudents().find(s => s.id !== recStudentId && DS.getStudentAccounts().some(a => a.studentId === s.id && a.email === "mohamed@test.com"))
if (dup) {
  const dupRes = SA.updateStudentByTeacher(recStudentId, { email: "mohamed@test.com" })
  eq("بريد مستخدم لطالب آخر → يُرفض", dupRes.ok === false && /مستخدم/.test(dupRes.message))
}
const emailUpd = SA.updateStudentByTeacher(recStudentId, { email: "recover2@test.com" })
eq("تعديل البريد ينجح", emailUpd.ok === true, emailUpd.message)
const accAfterEmail = DS.getStudentAccounts().find(a => a.studentId === recStudentId)
eq("حساب الدخول انتقل للبريد الجديد", accAfterEmail?.email === "recover2@test.com" && !DS.getStudentAccounts().some(a => a.email === "recover@test.com"))
const emailLogin = await SA.portalLogin("recover2@test.com", reset1.ok ? reset1.temporaryPassword : "x")
eq("الدخول بالبريد الجديد يعمل", emailLogin.ok === true)
SA.portalLogout()

// طلب استرجاع من الطالب
SA.resetRateLimits()
const forgot = SA.requestPasswordReset("طالب الاسترجاع علي", "", "01200000055")
eq("استرجاع بالاسم والهاتف (بدون بريد) ينجح ويعلّم الطلب", forgot.ok === true && (DS.getRegistrationRequests().find(r => r.email === "recover2@test.com")?.reviewNote || "").includes("إعادة تعيين كلمة المرور"), forgot.message || forgot.error || "")
const wrongWho = SA.requestPasswordReset("اسم غير مسجل نهائياً", "ghost@test.com", "09999999999")
eq("بيانات غير مطابقة → رفض", wrongWho.ok === false)
SA.resetRateLimits()
const forgotByEmail = SA.requestPasswordReset("طالب الاسترجاع علي", "recover2@test.com", "01200000055")
eq("الاسترجاع بالبريد يعمل أيضاً", forgotByEmail.ok === true)

// تلميح البريد المنسي
SA.resetRateLimits()
const hint = SA.remindEmailByName("طالب الاسترجاع علي", "01200000055")
eq("تلميح البريد يخفي الجزء الأول ويظهر الدومين", hint.ok === true && hint.message.includes("•") && hint.message.includes("@test.com"), hint.message || "")
const hintNone = SA.remindEmailByName("اسم لا يوجد", "09999999999")
eq("لا مطابقة → لا تلميح", hintNone.ok === false)

// ============================================================
section("سيناريو 15: إغلاق قناة الاستفسار لطالب بعينه")

const recBefore = IQ.canStudentSendInquiry(recStudentId)
eq("القناة مفتوحة افتراضياً", recBefore.allowed === true && recBefore.channelClosed !== true)
const closeRes = IQ.setStudentInquiryChannel(recStudentId, true)
eq("المدرس يغلق القناة", closeRes.ok === true)
const recClosed = IQ.canStudentSendInquiry(recStudentId)
eq("بعد الإغلاق: لا إرسال مع رسالة القناة", recClosed.allowed === false && recClosed.channelClosed === true && /أغلق المعلم/.test(recClosed.reason || ""))
const closedSend = await IQ.sendStudentInquiry(recStudentId, "استفسار بعد الإغلاق مباشرة")
eq("الإرسال محجوب حتى برسالة صالحة", closedSend.ok === false && /أغلق المعلم/.test(closedSend.error || ""))
eq("علم الإغلاق محفوظ على الطالب", DS.getStudents().find(s => s.id === recStudentId)?.inquiryBlocked === true)
const reopenRes = IQ.setStudentInquiryChannel(recStudentId, false)
const recReopened = IQ.canStudentSendInquiry(recStudentId)
eq("إعادة الفتح تسمح بالإرسال من جديد", reopenRes.ok === true && recReopened.allowed === true && recReopened.channelClosed !== true)

// ============================================================
section("سيناريو 16: حد عدد مرات اجتياز الاختبار")

const limitExam = { id: "ex-limit", allowOnline: true, maxAttempts: 2, questions: [] }
const attemptsAll = [
  { examId: "ex-limit", studentId: "st-old", studentName: "أحمد", groupId: "gr-1", score: 5 },
  { examId: "ex-other", studentId: "st-old", studentName: "أحمد", groupId: "gr-1", score: 9 },
]
const at1 = PC.attemptsStatus(limitExam, attemptsAll, "st-old")
eq("محاولة واحدة من اثنتين → متاح ومتبقي 1", at1.allowed === true && at1.used === 1 && at1.remaining === 1, JSON.stringify(at1))
const at2 = PC.attemptsStatus(limitExam, [...attemptsAll, { examId: "ex-limit", studentId: "st-old", studentName: "أحمد", groupId: "gr-1", score: 7 }], "st-old")
eq("استنفاد المحاولتين → ممنوع مع رسالة", at2.allowed === false && at2.used === 2 && /استُنفدت/.test(at2.reason || ""))
const at3 = PC.attemptsStatus({ ...limitExam, maxAttempts: 0 }, [...attemptsAll, { examId: "ex-limit", studentId: "st-old" }], "st-old")
eq("بلا حد (0) → متاح دائماً", at3.allowed === true && at3.max === 0 && at3.remaining === -1)
const at4 = PC.attemptsStatus(limitExam, attemptsAll, undefined, "طالب زائر", "gr-1")
eq("الزائر يُحسب بالاسم والمجموعة", at4.allowed === true && at4.used === 0)
const at5 = PC.attemptsStatus(limitExam, [...attemptsAll, { examId: "ex-limit", studentName: "طالب زائر", groupId: "gr-1" }, { examId: "ex-limit", studentName: "طالب زائر", groupId: "gr-1" }], undefined, "طالب زائر", "gr-1")
eq("الزائر بعد محاولتين → ممنوع", at5.allowed === false && at5.used === 2)
const at6 = PC.attemptsStatus(limitExam, attemptsAll, "طالب-آخر")
eq("محاولات طالب آخر لا تُحسب عليّ", at6.allowed === true && at6.used === 0)

// ============================================================
console.log(`\n${"=".repeat(56)}`)
console.log(`\x1b[1mالنتيجة: ${pass} ناجح / ${fail} فاشل\x1b[0m`)
if (fail) {
  fails.forEach((f) => console.log("  • " + f))
  rmSync(TMP, { recursive: true, force: true })
  process.exit(1)
}
rmSync(TMP, { recursive: true, force: true })
console.log("\x1b[32mكل اختبارات بوابة الطالب والتقارير نجحت ✅\x1b[0m")
