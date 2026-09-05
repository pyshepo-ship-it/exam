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
// نفس التخزين الصوري داخل window (ليقرأه/يمسحه memory-store كما في المتصفح)
Object.defineProperty(dom.window, "localStorage", { value: globalThis.localStorage, configurable: true })
const localKeyList = () => [...store.keys()]

// ---- تجميع كل ملف إلى وحدة ES مستقلة (لتفادي تعارض الثوابت بين الملفات) ----
const TMP = resolve(process.cwd(), ".tmp-portal-test")
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })

const stripImportsOf = (src, spec) =>
  src.replace(new RegExp(`import\\s*\\{[^}]*\\}\\s*from\\s*"\\./${spec}"`), "")

const stubs = `import { readRows as __memRows, writeRows as __memWrite } from "./memory-store.mjs"
import { createHash } from "node:crypto"
const queuePush = () => Promise.resolve()
${["pushGrades","pushStudents","pushDues","pushPayments","pushExams","pushSessions","pushAttendance","pushAnnouncements","pushHonorees","pushSharedFiles","pushImportantLinks","pushYearArchives","pushSetting","pushExamAttempts","pushManualGrades","pushRegistrationRequests","pushGroupTransferRequests","pushStudentHistory","pushStudentAccounts","pushSurveys","pushSurveyResponses"]
  .map((f) => `const ${f} = () => Promise.resolve()`).join("\n")}
// محاكاة Supabase (سحابة صورية في الذاكرة) — لا تخزين محلي في الاختبار أيضاً
const __cloud = (globalThis.__cloud = globalThis.__cloud || { registrationRequests: [], groupTransferRequests: [], studentAccounts: [] })
const submitRegistrationRequest = async (request) => {
  __cloud.registrationRequests.push(request)
  __memWrite("registrationRequests", [...__memRows("registrationRequests"), request])
  return { ok: true }
}
const submitGroupTransferRequest = async (request) => {
  __cloud.groupTransferRequests.push(request)
  __memWrite("groupTransferRequests", [...__memRows("groupTransferRequests"), request])
  return { ok: true }
}
const exportToPDF = async () => true
const printElement = () => {}
const fetchRegistrationRequestByEmail = async () => null
const fetchStudentAccountByEmail = async () => null
const fetchStudentById = async (id) => ((globalThis.__remoteStudents) || {})[id] || null
// دالة student_login الآمنة (SECURITY DEFINER): تتحقق من كلمة المرور والمصير
// داخل قاعدة البيانات. في الاختبار نُحاكيها بقراءة المخزن السحابي الصوري نفسه
// الذي اشتُقّت منه البيانات، فتعكس المنطق الفعلي (حسابات + طلبات).
const studentLogin = async (email, pw, _fnv) => {
  if (globalThis.__studentLoginUnavailable) {
    return { ok: false, code: "unavailable", error: "خدمة بوابة الطالب تحتاج تحديثاً في قاعدة البيانات — يرجى إبلاغ المعلم" }
  }
  const __sha256 = (s) => createHash("sha256").update(String(s)).digest("hex")
  const __fnv = (input) => {
    let h1 = 0x811c9dc5, h2 = 0x01000193
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i)
      h1 = ((h1 ^ c) * 0x01000193) >>> 0
      h2 = ((h2 + c) * 0x85ebca6b) >>> 0
    }
    return "fnv$" + h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")
  }
  const matchStored = (stored) =>
    !!stored && (stored === __sha256(pw) || (stored.startsWith("fnv$") && stored === __fnv(pw)))
  const mail = String(email || "").trim().toLowerCase()
  const reqs = __memRows("registrationRequests").filter(r => String(r.email || "").trim().toLowerCase() === mail)
  const accounts = __memRows("studentAccounts").filter(a => String(a.email || "").trim().toLowerCase() === mail)
  const req = reqs.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))).pop()
  const acc = accounts.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))).pop()
  if (!req && !acc) return { ok: false, code: "no_account", error: "لا يوجد حساب بهذا البريد — سجِّل أولاً من صفحة التسجيل" }
  let ok = false
  if (req && matchStored(req.passwordHash)) ok = true
  if (acc && acc.active !== false && matchStored(acc.passwordHash)) ok = true
  if (!ok) return { ok: false, code: "wrong_password", error: "كلمة المرور غير صحيحة" }
  if (req && req.status === "pending") return { ok: false, code: "pending", status: "pending", error: "طلبك لا يزال قيد المراجعة — انتظر موافقة المعلم ثم حاول مجدداً" }
  if (req && req.status === "rejected") return { ok: false, code: "rejected", status: "rejected", error: "تم رفض طلب التسجيل" }
  if (acc && acc.active === false) return { ok: false, code: "blocked", status: "blocked", error: "تم إيقاف حسابك من تسجيل الدخول — يرجى التواصل مع المعلم" }
  const studentId = acc && acc.studentId ? acc.studentId : (req ? req.linkedStudentId : null)
  if (!studentId) return { ok: false, code: "not_linked", error: "حسابك غير مربوط ببيانات طالب — يرجى التواصل مع المعلم" }
  return { ok: true, code: "ok", studentId, name: "", token: "test-token" }
}
const studentLogout = async () => {}
// --- التفعيل المباشر: محاكاة دالة student_register (SECURITY DEFINER) ---
const studentRegisterAuto = async (input) => {
  const sid = "stu-" + Math.random().toString(36).slice(2, 10)
  const now = new Date().toISOString()
  const student = { id: sid, name: input.name, phone: input.phone, email: input.email, gradeId: input.gradeId, groupId: input.groupId, status: "active", inquiryBlocked: false, createdAt: now, updatedAt: now }
  globalThis.__remoteStudents = globalThis.__remoteStudents || {}
  globalThis.__remoteStudents[sid] = student
  __memWrite("students", [...__memRows("students"), student])
  const req = { id: "reg-" + sid, name: input.name, phone: input.phone, guardianPhone: input.guardianPhone, email: input.email, passwordHash: input.passwordHash, gradeId: input.gradeId, groupId: input.groupId, status: "approved", linkedStudentId: sid, createdAt: now, reviewedAt: now }
  __cloud.registrationRequests.push(req)
  __memWrite("registrationRequests", [...__memRows("registrationRequests"), req])
  const acc = { id: input.email, email: input.email, studentId: sid, active: true, passwordHash: input.passwordHash, createdAt: now }
  __cloud.studentAccounts = __cloud.studentAccounts || []
  __cloud.studentAccounts.push(acc)
  __memWrite("studentAccounts", [...__memRows("studentAccounts"), acc])
  return { ok: true, code: "ok", studentId: sid, name: input.name }
}
// --- تغيير كلمة المرور: محاكاة دالة change_student_password ---
const changeStudentPassword = async (_token, oldHash, oldFnv, newHash) => {
  const accs = __memRows("studentAccounts")
  const acc = accs.find(a => a.passwordHash === oldHash || (oldFnv && a.passwordHash === oldFnv))
  if (!acc) return { ok: false, code: "wrong_old", error: "كلمة المرور القديمة غير صحيحة" }
  __memWrite("studentAccounts", accs.map(a => a.id === acc.id ? { ...a, passwordHash: newHash } : a))
  __memWrite("registrationRequests", __memRows("registrationRequests").map(r => r.linkedStudentId === acc.studentId && r.status === "approved" ? { ...r, passwordHash: newHash } : r))
  return { ok: true, code: "ok" }
}`

// 1) storage-keys (كامل — أي مفاتيح جديدة تُلتقط تلقائياً)
const storageKeys = readFileSync("src/lib/storage-keys.ts", "utf8").replace(/export /g, "")

// 2) weekdays
const weekdays = readFileSync("src/lib/weekdays.ts", "utf8").replace(/export /g, "")

// 3) utils (بلا clsx/twMerge — cn غير مستخدم في المسارات المختبرة)
const utils = readFileSync("src/lib/utils.ts", "utf8").replace(/import[\s\S]*?from\s*"[\w/.@-]+"/g, "")

const rewrite = (src) =>
  src
    .replace(/from "\.\.\/storage-keys"/g, 'from "../storage-keys.mjs"')
    .replace(/from "\.\.\/memory-store"/g, 'from "../memory-store.mjs"')
    .replace(/from "\.\.\/surveys"/g, 'from "../surveys.mjs"')
    .replace(/from "\.\.\/survey-device"/g, 'from "../survey-device.mjs"')
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
  // التسعير ودورات الاستحقاق — تعتمد عليها تقارير الطالب وصفحة التحصيل
  files["billing.mjs"] = rewrite(readFileSync("src/lib/billing.ts", "utf8"))
}
{
  // أدوات الاستبيانات — تستخدمها sync.ts في مسار الحفظ المحلي (بلا Supabase)
  let sv = stripImportsOf(readFileSync("src/lib/surveys.ts", "utf8"), "data-storage")
  sv = rewrite(sv)
  files["surveys.mjs"] = sv
}
{
  // بطاقة المتصفح — تستدعيها sync.ts عند كل رد استبيان (بلا window تعيد "")
  files["survey-device.mjs"] = rewrite(readFileSync("src/lib/survey-device.ts", "utf8"))
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
  // مخزن ذاكرة الجلسة — الوحدة الحقيقية (صفر تخزين محلي للبيانات)
  files["memory-store.mjs"] = rewrite(readFileSync("src/lib/memory-store.ts", "utf8"))
}
{
  files["portal-content.mjs"] = rewrite(readFileSync("src/lib/portal-content.ts", "utf8"))
}
{
  // قدرات نتائج الاختبار — تُمحى عند الخروج؛ في الاختبار لا حاجة لسلوك حقيقي.
  files["online-exam-result-session.mjs"] =
    `export const clearRememberedOnlineExamResultSessions = () => {}\n` +
    `export const getRememberedOnlineExamResultSessions = () => []\n` +
    `export const rememberOnlineExamResultSession = () => {}\n`
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
const MEM = await import("file://" + join(TMP, "memory-store.mjs"))

// ---- ذاكرة الجلسة: لقطة/استعادة (تحاكي إعادة الجلب من Supabase بعد الخروج) ----
const ROW_KEYS = ["grades","students","dues","payments","exams","sessions","attendance",
  "examAttempts","announcements","honorees","sharedFiles","importantLinks","yearArchives",
  "manualGrades","registrationRequests","groupTransferRequests","studentHistory",
  "studentAccounts","inquiries","surveys","surveyResponses"]
const SETTING_KEYS = ["currentAcademicYear","teacherName","teacherSignatureLine",
  "whatsappNumber","schedulePublished","registrationOpen","studentReportsEnabled"]
const snapshotMemory = () => ({
  rows: ROW_KEYS.map((k) => [k, MEM.readRows(k)]),
  settings: SETTING_KEYS.map((k) => [k, MEM.readSetting(k, "")]),
})
const restoreMemory = (snap) => {
  MEM.clearStore()
  for (const [k, v] of snap.rows) MEM.writeRows(k, v)
  for (const [k, v] of snap.settings) if (v !== "") MEM.writeSetting(k, v)
}
/**
 * الخروج الحقيقي يفرّغ ذاكرة الجلسة (خصوصية الطالب). في الموقع، أي صفحة
 * تالية تعيد الجلب من Supabase — وهذا بالضبط ما تحاكیه الاستعادة هنا.
 */
const logoutAndRepull = () => {
  const snap = snapshotMemory()
  SA.portalLogout()
  restoreMemory(snap)
}

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
logoutAndRepull()
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
logoutAndRepull()

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
logoutAndRepull()

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
// في السحابية الخالصة لا توجد قائمة محلية على جهاز الطالب — منع التكرار يتم لدى المدرس
eq("تكرار نفس الطلب (سحابي) يُقبل وينتظر قرار المدرس", trDup.ok === true)

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
section("سيناريو 8-ب: حدود الطلبات (حماية من الإغراق دون عرقلة إعادة المحاولة)")

SA.resetRateLimits()
// الفشل (خطأ تحقق) لا يحسب ضمن الحد — ولا يمنع إعادة المحاولة
for (let i = 0; i < 3; i++) {
  await SA.registerStudentAccount({ name: "طالب فاشل بالتحقق", phone: "01200000071", guardianPhone: "", email: `fail-attempt-${i}@test.com`, password: "limit123", confirmPassword: "limit123", gradeId: "g-1", groupId: "gr-1" })
}
const ordNames = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس"]
let okCount = 0
let lastMsg = ""
for (let i = 0; i < 5; i++) {
  const r = await SA.registerStudentAccount({ name: `طالب الحد ${ordNames[i]}`, phone: `0120000008${i}`, guardianPhone: `0120000009${i}`, email: `limit-ok-${i}@test.com`, password: "limit123", confirmPassword: "limit123", gradeId: "g-1", groupId: "gr-1" })
  if (r.ok) { okCount++; lastMsg = r.message || "" }
}
eq("الفشل لا يحسب: 5 تسجيلات ناجحة متتالية مسموحة (لا قيد 10 دقائق)", okCount === 5, `نجح ${okCount}`)
eq("رسالة النجاح توضح انتظار موافقة المعلم", /موافقة المعلم/.test(lastMsg))
const sixth = await SA.registerStudentAccount({ name: "طالب الحد السادس", phone: "01200000086", guardianPhone: "01200000096", email: "limit-ok-6@test.com", password: "limit123", confirmPassword: "limit123", gradeId: "g-1", groupId: "gr-1" })
eq("المحاولة السادسة في نفس الدقيقة → محجوبة (حماية الإغراق فقط)", sixth.ok === false && /محاولات كثيرة/.test(sixth.error || ""), sixth.error || "")
SA.resetRateLimits()
const afterReset = await SA.registerStudentAccount({ name: "طالب بعد التصفير", phone: "01200000087", guardianPhone: "01200000097", email: "limit-after-reset@test.com", password: "limit123", confirmPassword: "limit123", gradeId: "g-1", groupId: "gr-1" })
eq("بعد تصفير الحد → التسجيل يعمل فوراً برسالة انتظار الموافقة", afterReset.ok === true && /موافقة المعلم/.test(afterReset.message || ""), afterReset.error || "")

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
logoutAndRepull()

// ============================================================
section("سيناريو 9: الجلسة — صلاحية 30 يوماً + كوكيز")

// لقطة قبل اختبارات الجلسة: انتهاء الصلاحية يُخرج الطالب تلقائياً (ويُفرّغ الذاكرة)
const __snapBeforeLogout = snapshotMemory()
const sessLogin = await SA.portalLogin("mohamed@test.com", "secret1")
eq("الدخول ينشئ جلسة منضبطة بالوقت", sessLogin.ok === true && typeof sessLogin.session.exp === "number" && sessLogin.session.exp > Date.now() + 29 * 24 * 3600 * 1000)
eq("كوكي الجلسة كُتب (المصدر الوحيد للجلسة — لا نسخة محلية)", document.cookie.includes("studentPortalSession="))
eq("لا نسخة من الجلسة في التخزين المحلي", localStorage.getItem("studentPortalSession") === null)
// انتهاء الصلاحية → الجلسة تُلغى (نعدّل الكوكي نفسه)
const rawCookie = document.cookie.split("; ").find((c) => c.startsWith("studentPortalSession="))
const sessPayload = JSON.parse(
  decodeURIComponent(escape(atob(decodeURIComponent(rawCookie.split("=").slice(1).join("=")))))
)
document.cookie = `studentPortalSession=${encodeURIComponent(
  btoa(unescape(encodeURIComponent(JSON.stringify({ ...sessPayload, exp: Date.now() - 1000 }))))
)}; path=/; max-age=2592000`
eq("جلسة منتهية الصلاحية → تُلغى تلقائياً", SA.getPortalSession() === null)
eq("الخروج يمسح الكوكي أيضاً", (SA.portalLogout(), !document.cookie.includes("studentPortalSession=")))
eq("الخروج يفرّغ ذاكرة الجلسة — لا يبقى أي بيان بعد الخروج",
  MEM.readRows("students").length === 0 && MEM.readRows("studentAccounts").length === 0 && MEM.readRows("grades").length === 0)
eq("الخروج لا يترك أي بيانات في التخزين المحلي",
  !Object.keys(localStorage).some((k) => ["students","grades","studentAccounts","exams","dues","payments"].includes(k)))
restoreMemory(__snapBeforeLogout) // الصفحة التالية تعيد الجلب من Supabase

// غياب RPC الآمن لا يجوز أن ينشئ جلسة قديمة بلا token ثم يفشل بعد التحويل.
globalThis.__studentLoginUnavailable = true
const unavailableLogin = await SA.portalLogin("mohamed@test.com", "secret1")
globalThis.__studentLoginUnavailable = false
eq("غياب خدمة الدخول الآمنة يوقف الدخول برسالة واضحة", unavailableLogin.ok === false && /تحديث.*قاعدة البيانات/.test(unavailableLogin.error || ""))
eq("غياب RPC لا يكتب كوكي جلسة ناقصة", !document.cookie.includes("studentPortalSession="))

// كوكي من إصدار قديم (صالح زمنياً لكن بلا token) يُرفض قبل فتح صفحة الطالب.
const tokenlessPayload = { ...sessLogin.session }
delete tokenlessPayload.token
document.cookie = `studentPortalSession=${encodeURIComponent(
  btoa(unescape(encodeURIComponent(JSON.stringify(tokenlessPayload))))
)}; path=/; max-age=2592000`
eq("جلسة إصدار قديم بلا token تُلغى قبل تحميل البوابة", SA.getPortalSession() === null)
restoreMemory(__snapBeforeLogout)

// ============================================================
section("سيناريو 10: الاستفسارات — رسالة واحدة ورد وغلق")

const saraLogin2 = await SA.portalLogin("sara@test.com", "sara123")
const saraSess = saraLogin2.session
eq("سارة تدخل للاختبار", !!saraSess)
logoutAndRepull()

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

// «تم الامتحان — فتح المراجعة للجميع» = انتهاء الاختبار: يبقى ظاهراً للمراجعة ولا يقبل محاولة جديدة
const reviewPhaseExam = PC.examAvailability(mkExam({ reviewOpen: true }))
eq("فتح المراجعة → مغلق أمام المحاولات الجديدة", reviewPhaseExam.open === false, JSON.stringify(reviewPhaseExam))
eq("فتح المراجعة → السبب مرحلة مراجعة", reviewPhaseExam.reviewPhase === true && /انتهى هذا الاختبار/.test(reviewPhaseExam.reason || ""))
eq("فتح المراجعة يغلق حتى داخل الفترة المجدولة", PC.examAvailability(mkExam({
  reviewOpen: true,
  availabilityMode: "scheduled",
  availableFrom: new Date(Date.now() - 3600e3).toISOString(),
  availableUntil: new Date(Date.now() + 3600e3).toISOString(),
})).open === false)
eq("فتح المراجعة يُخفي الاختبار من لوحة الإعلانات العامة", PC.publicBoardExams([mkExam({ accessMode: "public", gradeId: "", reviewOpen: true })]).length === 0)
eq("قبل فتح المراجعة يظهر في لوحة الإعلانات العامة", PC.publicBoardExams([mkExam({ accessMode: "public", gradeId: "" })]).length === 1)

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
eq("كشف الحساب يعرض الاستحقاق والمدفوع والمتبقي", stmtPages.html.includes("كشف الحساب") && stmtPages.html.includes("الرصيد المتبقي"))
eq("كشف الحساب مرتّب حسب فترات الاستحقاق (لا الشهر فقط)", stmtPages.html.includes("الفترة"))
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
logoutAndRepull()
const newLogin = await SA.portalLogin("recover@test.com", reset1.ok ? reset1.temporaryPassword : "x")
eq("الدخول بالكلمة المؤقتة ينجح", newLogin.ok === true)
logoutAndRepull()
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
logoutAndRepull()

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

// المتبقي لا يكون سالباً أبداً — كان يظهر للطالب «إعادة (-1 متبقية)»
const at7 = PC.attemptsStatus({ ...limitExam, maxAttempts: undefined }, [
  { examId: "ex-limit", studentId: "st-old" },
  { examId: "ex-limit", studentId: "st-old" },
  { examId: "ex-limit", studentId: "st-old" },
], "st-old")
eq("بلا حد → unlimited صريح ولا رقم متبقٍ يُعرض", at7.unlimited === true && at7.max === 0 && at7.used === 3, JSON.stringify(at7))
const at8 = PC.attemptsStatus(limitExam, attemptsAll, "st-old", undefined, undefined, 5)
eq("محاولات سحابية أكثر من الحد → ممنوع والمتبقي صفر", at8.allowed === false && at8.remaining === 0 && at8.unlimited === false, JSON.stringify(at8))
eq("داخل الحد → المتبقي موجب", PC.attemptsStatus(limitExam, [], "st-old").remaining === 2)
const attemptsNeverNegative = [0, 1, 2, 3, 7].every(used => {
  const status = PC.attemptsStatus(limitExam, [], "st-old", undefined, undefined, used)
  return status.remaining >= 0
})
eq("المتبقي المعروض ≥ 0 مهما بلغ عدد المحاولات", attemptsNeverNegative)

// ============================================================
section("سيناريو 17: دخول الطالب من جهازه بعد موافقة المدرس من جهاز آخر")

SA.resetRateLimits()
const crossReg = await SA.registerStudentAccount({ name: "طالب عبر الأجهزة", phone: "01200000111", guardianPhone: "01200000112", email: "cross-device@test.com", password: "cross123", confirmPassword: "cross123", gradeId: "g-1", groupId: "gr-1" })
eq("التسجيل من جهاز الطالب ينجح", crossReg.ok === true, crossReg.error || "")
const crossReq = DS.getRegistrationRequests().find(r => r.email === "cross-device@test.com")
const crossOutcome = SA.approveRegistrationRequest(crossReq.id)
eq("الموافقة من جهاز المدرس تنشئ الطالب", crossOutcome.ok === true && !!crossOutcome.studentId, crossOutcome.message || "")
const crossStudent = DS.getStudents().find(s => s.id === crossOutcome.studentId)

// محاكاة جهاز الطالب الآخر: بلا جدول طلاب وبلا حسابات — فقط طلبه المسجل
const savedStudents = DS.getStudents()
const savedAccounts = DS.getStudentAccounts()
DS.saveStudents([])
DS.saveStudentAccounts([])
globalThis.__remoteStudents = { [crossStudent.id]: crossStudent }

const crossLogin = await SA.portalLogin("cross-device@test.com", "cross123")
eq("الدخول من الجهاز الخالي ينجح بجلب الطالب من السحابة", crossLogin.ok === true && crossLogin.session.studentId === crossStudent.id, crossLogin.error || "")
logoutAndRepull()
eq("صف الطالب أُحفظ محلياً بعد الدخول (البوابة تعمل كاملة)", DS.getStudents().some(s => s.id === crossStudent.id))

// بلا سحابة (فشل الجلب) → رسالة تشجع إعادة المحاولة لا «راجع المعلم»
globalThis.__remoteStudents = {}
DS.saveStudents([])
DS.saveStudentAccounts([])
const offlineLogin = await SA.portalLogin("cross-device@test.com", "cross123")
eq("تعذر الجلب → رسالة إعادة محاولة واضحة", offlineLogin.ok === false && /أعد المحاولة/.test(offlineLogin.error || ""), offlineLogin.error || "")
logoutAndRepull()

// استعادة
DS.saveStudents(savedStudents)
DS.saveStudentAccounts(savedAccounts)
globalThis.__remoteStudents = undefined

// ============================================================
section("سيناريو 18: من يفتح الاختبار — للأعضاء المسجلين فقط أم مفتوح للجميع")

const mkAccessExam = (over) => mkExam({ id: "ex-access", ...over })
const gradesList = [grade1, grade2]

eq("بلا تحديد → للأعضاء المسجلين فقط (افتراضي آمن)", PC.examAccessMode(mkAccessExam({})) === "members")
eq("accessMode = public → مفتوح للجميع", PC.examAccessMode(mkAccessExam({ accessMode: "public" })) === "public")
eq("قيمة غير معروفة → للأعضاء فقط", PC.examAccessMode(mkAccessExam({ accessMode: "قيمة غريبة" })) === "members")

eq("غير منشور → لا يستقبل زواراً ولو ضُبط مفتوحاً للجميع", PC.isExamOpenToGuests(mkAccessExam({ allowOnline: false, accessMode: "public" })) === false)
eq("منشور + مفتوح للجميع → يستقبل الزوار", PC.isExamOpenToGuests(mkAccessExam({ accessMode: "public" })) === true)
eq("منشور للأعضاء فقط → لا يستقبل الزوار", PC.isExamOpenToGuests(mkAccessExam({})) === false)

// لوحة الإعلانات (الصفحة الرئيسية): المفتوح للجميع والمتاح الآن فقط
const boardIds = PC.publicBoardExams([
  mkAccessExam({ id: "b-1", accessMode: "public" }),
  mkAccessExam({ id: "b-2" }),
  mkAccessExam({ id: "b-3", accessMode: "public", allowOnline: false }),
  mkAccessExam({ id: "b-4", accessMode: "public", availabilityMode: "scheduled", availableUntil: new Date(Date.now() - 3600e3).toISOString() }),
]).map(e => e.id)
eq("لوحة الإعلانات تعرض المفتوح للجميع والمتاح الآن فقط", boardIds.length === 1 && boardIds[0] === "b-1", boardIds.join(","))

// مجموعات الزائر: مجموعات صف الاختبار فقط، والمستهدفة منها إن حُدِّدت
const guestGroups1 = PC.guestGroupsForGrade(mkAccessExam({ accessMode: "public", gradeId: "g-1" }), gradesList, "g-1").map(g => g.id)
eq("قائمة الزائر = مجموعات صف الاختبار فقط", guestGroups1.join(",") === "gr-1,gr-2", guestGroups1.join(","))
const guestGroups2 = PC.guestGroupsForGrade(mkAccessExam({ accessMode: "public", gradeId: "g-1", targetGroupIds: ["gr-2"] }), gradesList, "g-1").map(g => g.id)
eq("المجموعات المستهدفة فقط تظهر للزائر", guestGroups2.join(",") === "gr-2", guestGroups2.join(","))
eq("اختبار عام → الصف قابل للاختيار، وغير العام → ثابت", PC.isExamGradeSelectable(mkAccessExam({ gradeId: "" })) === true && PC.isExamGradeSelectable(mkAccessExam({ gradeId: "g-1" })) === false)
eq("صف الزائر يؤخذ من الاختبار نفسه", PC.examGradeIdForGuest(mkAccessExam({ gradeId: "g-1" }), "g-2") === "g-1")

// التحقق من بيانات الزائر قبل البدء (الاسم + الهاتف إجباريان، الصف ثابت، المجموعة من القائمة)
const guestExam = mkAccessExam({ accessMode: "public", gradeId: "g-1" })
const guestBase = { name: "محمد علي حسن", phone: "01012345678", groupId: "gr-1" }
const gv = (over, exam = guestExam) => PC.validateGuestIdentity(exam, gradesList, { ...guestBase, ...over })

const g1ok = gv({})
eq("بيانات سليمة → يبدأ الاختبار", g1ok.ok === true && g1ok.identity?.gradeId === "g-1" && g1ok.identity?.groupId === "gr-1", g1ok.error || "")
eq("بلا اسم → مرفوض", gv({ name: "" }).ok === false)
eq("اسم قصير → مرفوض", gv({ name: "علي" }).ok === false)
eq("اسم بأرقام → مرفوض", gv({ name: "محمد 12345" }).ok === false)
eq("بلا هاتف → مرفوض", gv({ phone: "" }).ok === false)
eq("هاتف بحروف → مرفوض", gv({ phone: "010abc23456" }).ok === false)
const arabicPhone = gv({ phone: "٠١٠١٢٣٤٥٦٧٨" })
eq("أرقام عربية-هندية في الهاتف → تُوحَّد وتُقبل", arabicPhone.ok === true && arabicPhone.identity?.phone === "01012345678", arabicPhone.error || "")
eq("بلا مجموعة → مرفوض", gv({ groupId: "" }).ok === false)
eq("مجموعة من صف آخر → مرفوضة", gv({ groupId: "gr-3" }).ok === false)
eq("مجموعة غير مستهدفة → مرفوضة", gv({ groupId: "gr-1" }, mkAccessExam({ accessMode: "public", gradeId: "g-1", targetGroupIds: ["gr-2"] })).ok === false)
const forcedGrade = gv({ gradeId: "g-2", groupId: "gr-1" })
eq("الزائر لا يستطيع تغيير صف الاختبار", forcedGrade.ok === true && forcedGrade.identity?.gradeId === "g-1", forcedGrade.error || "")
const generalExam = mkAccessExam({ accessMode: "public", gradeId: "" })
const generalOk = gv({ gradeId: "g-2", groupId: "gr-3" }, generalExam)
eq("اختبار عام → الزائر يختار صفه ومجموعته", generalOk.ok === true && generalOk.identity?.gradeId === "g-2" && generalOk.identity?.groupId === "gr-3", generalOk.error || "")
eq("اختبار عام بلا اختيار صف → مرفوض", gv({ gradeId: "", groupId: "" }, generalExam).ok === false)
eq("صف غير موجود أصلاً → مرفوض", gv({ gradeId: "g-9", groupId: "gr-9" }, mkAccessExam({ accessMode: "public", gradeId: "g-9" })).ok === false)

// الزائر يخضع لحد المحاولات بالاسم والمجموعة (عبر الأجهزة بالعدّاد السحابي)
const guestLimitExam = mkAccessExam({ accessMode: "public", gradeId: "g-1", maxAttempts: 1 })
const guestAttempts = [{ examId: "ex-access", studentName: "محمد علي حسن", groupId: "gr-1", score: 5 }]
eq("زائر بلا محاولات سابقة → مسموح", PC.attemptsStatus(guestLimitExam, [], undefined, "محمد علي حسن", "gr-1", 0).allowed === true)
eq("زائر استهلك محاولته محلياً → ممنوع", PC.attemptsStatus(guestLimitExam, guestAttempts, undefined, "محمد علي حسن", "gr-1", 0).allowed === false)
eq("زائر استهلك محاولته على جهاز آخر (السحابة) → ممنوع", PC.attemptsStatus(guestLimitExam, [], undefined, "محمد علي حسن", "gr-1", 1).allowed === false)

// ============================================================
section("سيناريو 13: صفر تخزين محلي — Supabase هو مكان التسجيل الوحيد")

const DATA_KEYS = ["grades","students","dues","payments","exams","sessions","attendance",
  "examAttempts","announcements","honorees","sharedFiles","importantLinks",
  "currentAcademicYear","yearArchives","manualGrades","registrationRequests",
  "groupTransferRequests","studentHistory","studentAccounts","inquiries",
  "teacherName","teacherSignatureLine","studentPortalSession","sampleGradesBackup","initialized"]
const localDataKeys = () => localKeyList().filter((k) => DATA_KEYS.includes(k))

eq("بعد كل عمليات الحفظ والدخول والخروج: لا أثر لأي بيان في التخزين المحلي",
  localDataKeys().length === 0, localDataKeys().join("، ") || "لا شيء")
eq("المسموح على الجهاز: عدّاد حماية الإغراق فقط (رقم بلا أسماء)",
  localKeyList().every((k) => k === "studentRateLimits"),
  localKeyList().join("، ") || "لا شيء")

// حفظ جديد (طلاب + اختبارات + إعدادات + سنة دراسية) — لا يُكتب على الجهاز
const snap13 = snapshotMemory()
DS.saveStudents([...DS.getStudents(), { id: "st-x13", name: "طالب اختبار الحفظ", phone: "01000000009", gradeId: "g-1", groupId: "gr-1", status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])
DS.saveExams([...DS.getExams(), { id: "ex-x13", title: "اختبار الحفظ", gradeId: "g-1", targetGroupIds: [], questions: [], totalMarks: 10, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])
DS.saveSetting("teacherName", "أ/ اختبار السحابة")
DS.saveAcademicYear("2026-2027")
eq("الحفظ يصل إلى ذاكرة الجلسة (العرض الفوري) والسحابة",
  DS.getStudents().some((x) => x.id === "st-x13") && DS.getExams().some((e) => e.id === "ex-x13") &&
  DS.getSetting("teacherName") === "أ/ اختبار السحابة" && DS.getStoredAcademicYear() === "2026-2027")
eq("الحفظ لا يكتب أي مفتاح بيانات في التخزين المحلي", localDataKeys().length === 0, localDataKeys().join("، ") || "لا شيء")
restoreMemory(snap13)

// كاش قديم من إصدار سابق: يُنقل إلى الذاكرة ثم يُمسح من الجهاز نهائياً
const snapLegacy = snapshotMemory()
MEM.clearStore()
localStorage.setItem("grades", JSON.stringify([{ id: "legacy-g", name: "صف قديم", academicYear: "2020-2021", groups: [], createdAt: "" }]))
localStorage.setItem("students", JSON.stringify([{ id: "legacy-s", name: "طالب قديم", gradeId: "legacy-g", groupId: "", status: "active", createdAt: "" }]))
localStorage.setItem("teacherName", "اسم قديم من المتصفح")
MEM.adoptLegacyIntoMemory()
eq("الكاش القديم يُنقل إلى ذاكرة الجلسة أولاً (لا تضيع بيانات المالك)",
  MEM.readRows("grades").some((g) => g.id === "legacy-g") && MEM.readSetting("teacherName", "") === "اسم قديم من المتصفح")
MEM.purgeLegacyLocalStorage()
eq("المسح النهائي: لا يبقى أي كاش قديم على الجهاز",
  localStorage.getItem("grades") === null && localStorage.getItem("students") === null && localStorage.getItem("teacherName") === null)
eq("sessionStorage نظيف كذلك", !Object.keys(window.sessionStorage).some((k) => DATA_KEYS.includes(k)))
eq("لا نسخة جلسة الطالب على الجهاز (الكوكي فقط)", localStorage.getItem("studentPortalSession") === null)
restoreMemory(snapLegacy)

// ============================================================
section("سيناريو 14: التفعيل المباشر + تغيير كلمة المرور من البوابة")
SA.resetRateLimits()
SA.setAutoApproveRegistration(true)
const autoReg = await SA.registerStudentAccount({
  name: "مباشر فتح", phone: "01200000991", guardianPhone: "01200000992",
  email: "auto@test.com", password: "auto123", confirmPassword: "auto123",
  gradeId: "g-1", groupId: "gr-1",
})
eq("التفعيل المباشر ينشئ الحساب فوراً (لا ينتظر الموافقة)", autoReg.ok === true, ("error" in autoReg ? autoReg.error : "") || "")
const autoLogin = await SA.portalLogin("auto@test.com", "auto123")
eq("الطالب يدخل مباشرة بعد التسجيل المباشر", autoLogin.ok === true && !!autoLogin.session.studentId, autoLogin.error || "")
const autoStudentId = autoLogin.ok ? autoLogin.session.studentId : ""
eq("الحساب مفعّل بربط الطالب الصحيح", autoStudentId !== "" && /^stu-/.test(autoStudentId))

// تغيير كلمة المرور: القديم → الجديد
const chg = await SA.changePortalPassword(autoLogin.session.token || "", "auto123", "newpass9")
eq("تغيير كلمة المرور ينجح", chg.ok === true, ("error" in chg ? chg.error : "") || "")
const pwOldLogin = await SA.portalLogin("auto@test.com", "auto123")
eq("الكلمة القديمة تتوقف عن العمل بعد التغيير", pwOldLogin.ok === false)
const pwNewLogin = await SA.portalLogin("auto@test.com", "newpass9")
eq("الكلمة الجديدة تعمل", pwNewLogin.ok === true && pwNewLogin.session.studentId === autoStudentId, pwNewLogin.error || "")

// كلمة قديمة خاطئة عند التغيير تُرفض
const chgBad = await SA.changePortalPassword(autoLogin.session.token || "", "WRONG", "zzzzzz")
eq("التغيير بكلمة قديمة خاطئة يُرفض", chgBad.ok === false)
SA.setAutoApproveRegistration(false)
logoutAndRepull()

// ============================================================
section("سيناريو 15-ب: التسعير بالحصّة ودورات الاستحقاق (شهري/أسبوعي/حصة/مخصص)")
// ============================================================

const BILL = await import("file://" + join(TMP, "billing.mjs"))

// ---- تسعير المجموعة ----
eq("عدد الحصص شهرياً من أيام الأسبوع (يومان × 4.33 = 9)", BILL.sessionsPerMonthFromDays(["السبت", "الثلاثاء"]) === 9)
eq("مجموعة بلا أيام → صفر حصص", BILL.sessionsPerMonthFromDays([]) === 0)

const sessionPriced = BILL.normalizeGroupPricing({
  pricingMode: "session",
  sessionFee: 50,
  days: ["السبت", "الثلاثاء"],
})
eq("التسعير بالحصّة يشتق السعر الشهري (50 × 9 = 450)", sessionPriced.monthlyFee === 450 && sessionPriced.sessionsPerMonth === 9)
eq("التسعير بالحصّة يشتق سعر الأسبوع (50 × يومان = 100)", sessionPriced.weeklyFee === 100)

const monthlyPriced = BILL.normalizeGroupPricing({
  pricingMode: "monthly",
  monthlyFee: 400,
  days: ["السبت", "الثلاثاء"],
})
eq("التسعير الشهري يشتق سعر الحصة الاسترشادي (400 ÷ 9 = 44.44)", monthlyPriced.sessionFee === 44.44)
eq("التسعير الشهري يحفظ السعر كما هو", monthlyPriced.monthlyFee === 400)

const legacyGroup = { id: "gr-x", name: "قديمة", days: [], monthlyFee: 433 }
eq("مجموعة قديمة بلا طريقة تسعير تُعامل كسعر شهري", BILL.groupPricingMode(legacyGroup) === "monthly")
eq("سعر الأسبوع المستنتج من الشهري (433 ÷ 4.33 = 100)", BILL.groupWeeklyFee(legacyGroup) === 100)
eq("مجموعة قديمة حملت سعر حصة تُعامل كسعير بالحصّة", BILL.groupPricingMode({ sessionFee: 40 }) === "session")

const grp = { id: "gr-1", name: "أولى", days: ["السبت", "الثلاثاء"], monthlyFee: 450, pricingMode: "session", sessionFee: 50, sessionsPerMonth: 9 }
eq("السعر الشهري الفعلي لمجموعة الحصّة = سعر الحصة × الحصص", BILL.groupMonthlyFee(grp) === 450)
eq("وصف التسعير يشرح الحساب للمعلم", BILL.pricingSummary(grp).includes("للحصة") && BILL.pricingSummary(grp).includes("9"))

// ---- مبالغ الدورات ----
eq("دورة شهرية → السعر الشهري", BILL.amountForCycle(grp, "monthly").amount === 450)
eq("دورة أسبوعية → سعر الأسبوع", BILL.amountForCycle(grp, "weekly").amount === 100)
eq("دورة بالحصّة (3 حصص) → 50 × 3 = 150", BILL.amountForCycle(grp, "session", { sessionsCount: 3 }).amount === 150)
eq("دورة بالحصّة تحمل سعر الحصة وعدد الحصص", BILL.amountForCycle(grp, "session", { sessionsCount: 3 }).unitPrice === 50 && BILL.amountForCycle(grp, "session", { sessionsCount: 3 }).sessionsCount === 3)
eq("مبلغ مخصص → كما كتبه المعلم", BILL.amountForCycle(grp, "custom", { customAmount: 250 }).amount === 250)
eq("مبلغ يدوي يتجاوز سعر الدورة", BILL.amountForCycle(grp, "monthly", { customAmount: 300 }).amount === 300)

// ---- مفاتيح الفترات (منع التكرار) ----
eq("استحقاق قديم بلا دورة → مفتاح الشهر/السنة", BILL.duePeriodKey({ month: 9, year: 2025 }) === "2025-09")
eq("استحقاق أسبوعي → مفتاح أسبوعه", BILL.duePeriodKey({ cycle: "weekly", periodKey: "2025-W37", month: 9, year: 2025 }) === "2025-W37")
eq("دورة السجلات القديمة شهرية", BILL.dueCycle({}) === "monthly" && BILL.dueCycle({ cycle: "session" }) === "session")
eq("وصف الفترة: شهري قديم", BILL.duePeriodLabel({ month: 9, year: 2025 }) === "سبتمبر 2025")
eq("وصف الفترة: محفوظ مع الاستحقاق", BILL.duePeriodLabel({ cycle: "weekly", periodLabel: "أسبوع 37", month: 9, year: 2025 }) === "أسبوع 37")

// ---- حدود الأسبوع (السبت → الجمعة) ----
const week = BILL.weeklyPeriod(new Date(2025, 8, 3)) // الأربعاء 3 سبتمبر 2025
eq("بداية الأسبوع سبت", week.start.getDay() === 6)
eq("نهاية الأسبوع جمعة", week.end.getDay() === 5)
eq("مفتاح الأسبوع يحمل السنة ورقم الأسبوع", /^2025-W\d\d$/.test(week.key), week.key)
eq("وصف الأسبوع يبدأ بـ «أسبوع»", week.label.startsWith("أسبوع"), week.label)

const sess = BILL.sessionPeriod(new Date(2025, 8, 10), 2)
eq("مفتاح فترة الحصص يحمل التاريخ والعدد", sess.key === "2025-09-10#2", sess.key)
eq("وصف فترة الحصص (حصتان)", sess.label.includes("حصتان"), sess.label)

const cust = BILL.customPeriod("رحلة المنيا", new Date(2025, 8, 10))
eq("المبلغ المخصص يحمل وصف المعلم", cust.label === "رحلة المنيا")
eq("المبلغ المخصص بلا وصف → وصف افتراضي بالتاريخ", BILL.customPeriod("", new Date(2025, 8, 10)).label.includes("مبلغ مخصص"))

// ---- كشف الحساب: استحقاق أسبوعي لا يذوب في الشهر ----
const duesBeforeCycle = DS.getDues()
DS.saveDues([
  ...duesBeforeCycle,
  {
    id: "due-week-1",
    studentId: "st-old",
    groupId: "gr-1",
    month: 9,
    year: 2025,
    amount: 100,
    status: "unpaid",
    cycle: "weekly",
    periodKey: "2025-W37",
    periodLabel: "أسبوع 37 (6 – 12 سبتمبر)",
    dueDate: "2025-09-06",
    createdAt: new Date().toISOString(),
  },
])
const repCycle = SR.collectStudentReport("st-old")
const stmtCycle = SR.buildStudentReportPagesHtml({ report: repCycle, type: "payments", mode: "teacher" })
eq("الاستحقاق الأسبوعي يظهر بفترة مستقلة في كشف الحساب", stmtCycle.html.includes("أسبوع 37 (6 – 12 سبتمبر)"))
eq("الاستحقاق الشهري القديم ما زال يظهر بشهره", stmtCycle.html.includes("سبتمبر"))

// ============================================================
section("سيناريو 16: الاستبيانات — ردّ واحد لكل هوية في كل نسخة")
// ============================================================
// المسار المحلي في sync.ts (بلا Supabase) يطبق نفس قاعدة الخادم:
// بصمة = الرقم الموحّد، وردّ واحد لكل بصمة في كل نسخة، والمجهول لا يستثني.

const SYNC16 = await import("file://" + join(TMP, "supabase/sync.mjs"))
const SV16 = await import("file://" + join(TMP, "surveys.mjs"))

const snap16 = snapshotMemory()
const iso16 = new Date().toISOString()
const q1 = { id: "q1", type: "text", title: "رأيك في الحصة", required: true }
const q2 = { id: "q2", type: "rating", title: "تقييم الشرح", maxRating: 5 }

DS.saveSurveys([
  {
    id: "sv-once", title: "استبيان منع التكرار", audience: "all", questions: [q1],
    published: true, allowGuests: true, anonymous: false, version: 1,
    createdAt: iso16, updatedAt: iso16,
  },
  {
    id: "sv-anon", title: "استبيان مجهول", audience: "all", questions: [q1],
    published: true, allowGuests: true, anonymous: true, version: 1,
    createdAt: iso16, updatedAt: iso16,
  },
])

const respOf = (id) => DS.getSurveyResponses().filter(r => r.surveyId === id)

const g1 = await SYNC16.submitSurveyResponse({
  surveyId: "sv-once", answers: { q1: { text: "أول رد" } },
  guestName: "زائر أول", guestPhone: "01012345678",
})
eq("الزائر يرسل مرة أولى", g1.ok === true && g1.code === "ok", g1.error || "")
eq("ردّ واحد محفوظ", respOf("sv-once").length === 1)

const g2 = await SYNC16.submitSurveyResponse({
  surveyId: "sv-once", answers: { q1: { text: "تصحيح الإجابة" } },
  guestName: "زائر أول", guestPhone: "01012345678",
})
eq("إعادة الإرسال بنفس الرقم = تحديث ردّه لا ردّ ثانٍ", g2.ok === true && g2.code === "updated", g2.error || "")
eq("العدد ما زال ردًّا واحدًا", respOf("sv-once").length === 1, `عدد = ${respOf("sv-once").length}`)
eq("الإجابة استُبدلت فعلًا", respOf("sv-once")[0]?.answers?.q1?.text === "تصحيح الإجابة")

const g3 = await SYNC16.submitSurveyResponse({
  surveyId: "sv-once", answers: { q1: { text: "نفس الرقم بصيغة أخرى" } },
  guestName: "زائر أول", guestPhone: "٢٠ ١٠١ ٢٣٤ ٥٦٧٨",
})
eq("الرقم بالعربي-هندي وبصيغة دولية = نفس البصمة (لا يفلت بالتعديل الشكلي)",
  g3.ok === true && g3.code === "updated" && respOf("sv-once").length === 1, g3.error || "")

const g4 = await SYNC16.submitSurveyResponse({
  surveyId: "sv-once", answers: { q1: { text: "طالب ثانٍ" } },
  guestName: "زائر ثانٍ", guestPhone: "01098765432",
})
eq("رقم مختلف = ردّ جديد (لا يُلغى حق غيره في الإجابة)", g4.ok === true && g4.code === "ok")
eq("اللوحة فيها ردّان من شخصين", respOf("sv-once").length === 2)

// ---- بلا رقم هاتف إطلاقًا: بطاقة المتصفح هي الهوية (ترحيل 023) ----
// «متصفح جديد» = مسح بطاقة الجهاز (وضع تخفٍّ/جهاز آخر)
const newBrowser = () => {
  try { window.localStorage.removeItem("survey_device_id") } catch { /* لا شيء */ }
  document.cookie = "sdid=; path=/; max-age=0"
}

newBrowser()
const g5 = await SYNC16.submitSurveyResponse({ surveyId: "sv-once", answers: { q1: { text: "بلا رقم" } } })
eq("الزائر يجيب بلا رقم هاتف ولا اسم (هويته بطاقة متصفحه)", g5.ok === true && g5.code === "ok", g5.error || "")
eq("أُضيف ردّه", respOf("sv-once").length === 3)

const g5b = await SYNC16.submitSurveyResponse({ surveyId: "sv-once", answers: { q1: { text: "محاولة ثانية بلا رقم" } } })
eq("نفس المتصفح لا يُسجَّل مرتين (تحديث لا ردّ جديد)", g5b.ok === true && g5b.code === "updated", g5b.error || "")
eq("العدد لم يزد", respOf("sv-once").length === 3, `عدد = ${respOf("sv-once").length}`)

newBrowser()
const g5c = await SYNC16.submitSurveyResponse({ surveyId: "sv-once", answers: { q1: { text: "زائر من جهاز آخر" } } })
eq("متصفح آخر = شخص آخر يحق له الرد", g5c.ok === true && g5c.code === "ok")
eq("صار عندنا أربعة ردود", respOf("sv-once").length === 4)

// ---- النسخ: تعديل الأسئلة يفتح الإجابة، وتعديل غيره لا يفتحها ----
const svOnce = DS.getSurveys().find(x => x.id === "sv-once")
eq("لا تغيير في الأسئلة = نفس النسخة", SV16.nextVersionAfterEdit(svOnce, svOnce.questions) === 1)
const v2 = SV16.nextVersionAfterEdit(svOnce, [q1, q2])
eq("سؤال إضافي = نسخة ٢", v2 === 2)
DS.saveSurveys(DS.getSurveys().map(x => (x.id === "sv-once" ? { ...x, questions: [q1, q2], version: v2, updatedAt: new Date().toISOString() } : x)))
eq("النسخة محفوظة في السجل", DS.getSurveys().find(x => x.id === "sv-once").version === 2)

const g6 = await SYNC16.submitSurveyResponse({
  surveyId: "sv-once", answers: { q1: { text: "رد على الأسئلة الجديدة" }, q2: { rating: 4 } },
  guestName: "زائر أول", guestPhone: "01012345678",
})
eq("من أجاب على نسخة قديمة يستطيع الإجابة على الجديدة", g6.ok === true && g6.code === "ok", g6.error || "")
eq("ردوده القديمة على النسخة ١ محفوظة (لا تُمسح عند التعديل)",
  respOf("sv-once").filter(r => (Number(r.version) || 1) === 1).length === 4)
eq("ردّ واحد فقط على النسخة الحالية", respOf("sv-once").filter(r => (Number(r.version) || 1) === 2).length === 1)
eq("عدد الردود الكلي = ٥ (أربعة على النسخة ١ + واحد على النسخة ٢)", respOf("sv-once").length === 5)

const g7 = await SYNC16.submitSurveyResponse({
  surveyId: "sv-once", answers: { q1: { text: "محاولة تكرار على النسخة الجديدة" } },
  guestName: "زائر أول", guestPhone: "01012345678",
})
eq("التكرار على نفس النسخة = تحديث فقط", g7.ok === true && g7.code === "updated")
eq("عدد النسخة الثانية بقي ١", respOf("sv-once").filter(r => (Number(r.version) || 1) === 2).length === 1)

// ---- الاستبيان المجهول: بلا أسماء، ومع ذلك ردّ واحد ----
const a1_16 = await SYNC16.submitSurveyResponse({
  surveyId: "sv-anon", answers: { q1: { text: "رأي صريح" } },
  guestName: "فلان الفلاني", guestPhone: "01012345678",
})
eq("المجهول يقبل ردًا واحدًا", a1_16.ok === true && respOf("sv-anon").length === 1, a1_16.error || "")
eq("المجهول لا يخزّن الاسم", (respOf("sv-anon")[0]?.studentName || "") === "")
const a2_16 = await SYNC16.submitSurveyResponse({
  surveyId: "sv-anon", answers: { q1: { text: "رأي ثانٍ من نفس الرقم" } },
  guestName: "فلان", guestPhone: "01012345678",
})
eq("المجهول: الإعادة تحديث ولا تضيف ردًا ثانيًا", a2_16.ok === true && a2_16.code === "updated")
eq("المجهول: ما زال ردًّا واحدًا", respOf("sv-anon").length === 1, `عدد = ${respOf("sv-anon").length}`)
eq("المجهول: لا رقم ولا اسم في الصف المحفوظ",
  !respOf("sv-anon")[0]?.phone && (respOf("sv-anon")[0]?.studentName || "") === "")
const anonRow16 = respOf("sv-anon")[0] || {}
eq("المجهول: البصمة وحدها موجودة (تُستخدم للمنع لا للكشف)",
  typeof anonRow16.identityKey === "string" && String(anonRow16.identityKey).startsWith("ph:"))
newBrowser()
const a3_16 = await SYNC16.submitSurveyResponse({ surveyId: "sv-anon", answers: { q1: { text: "دخول مجهول تمامًا" } } })
eq("المجهول بلا رقم ولا اسم: مقبول (البطاقة تكفي لمنع التكرار)", a3_16.ok === true, a3_16.error || "")
eq("المجهول: ردّان من شخصين مختلفين", respOf("sv-anon").length === 2)
const a3b_16 = await SYNC16.submitSurveyResponse({ surveyId: "sv-anon", answers: { q1: { text: "محاولة تكرار مجهولة" } } })
eq("المجهول: نفس المتصفح لا يكرر", a3b_16.ok === true && a3b_16.code === "updated")
eq("المجهول: العدد ثابت", respOf("sv-anon").length === 2)
eq("المجهول: لا اسم ولا رقم في أي صف",
  respOf("sv-anon").every(r => !r.phone && (r.studentName || "") === ""))

// ---- التصويت الحر: المعلم يختاره صراحةً فلا منع تكرار ----
DS.saveSurveys([...DS.getSurveys(), {
  id: "sv-open", title: "تصويت حر", audience: "all", questions: [q1],
  published: true, allowGuests: true, guestIdentity: "open", version: 1,
  createdAt: iso16, updatedAt: iso16,
}])
const o1 = await SYNC16.submitSurveyResponse({ surveyId: "sv-open", answers: { q1: { text: "صوت ١" } } })
const o2 = await SYNC16.submitSurveyResponse({ surveyId: "sv-open", answers: { q1: { text: "صوت ٢" } } })
eq("التصويت الحر يقبل أكثر من ردّ من نفس المتصفح", o1.ok === true && o2.ok === true && respOf("sv-open").length === 2)

// ---- قفل الإجابة بعد الإرسال ----
DS.saveSurveys(DS.getSurveys().map(x => (x.id === "sv-anon" ? { ...x, lockAfterSubmit: true } : x)))
const a4_16 = await SYNC16.submitSurveyResponse({
  surveyId: "sv-anon", answers: { q1: { text: "محاولة تعديل بعد القفل" } },
  guestName: "فلان", guestPhone: "01012345678",
})
eq("المقفول: لا تعديل بعد الإرسال", a4_16.ok === false && /لا يمكن تعديلها/.test(a4_16.error || ""), a4_16.error || "")
eq("المقفول: الإجابة بقيت آخر ما أُرسل (لم تُستبدل بمحاولة مرفوضة)",
  respOf("sv-anon").some(r => r.answers?.q1?.text === "رأي ثانٍ من نفس الرقم"))

// ---- أدوات النسخ في الواجهة ----
eq("hasAnsweredCurrent يفرّق النسخ",
  SV16.hasAnsweredCurrent({ id: "sv-once", version: 2 }, ["sv-once:1"]) === false &&
  SV16.hasAnsweredCurrent({ id: "sv-once", version: 2 }, ["sv-once:2"]) === true)
eq("hasAnsweredOlderVersion يشرح للطالب سبب إعادة الفتح",
  SV16.hasAnsweredOlderVersion({ id: "sv-once", version: 2 }, ["sv-once:1"]) === true)
const pub16 = await SYNC16.fetchPublicSurveys("01012345678")
eq("بلا Supabase: اللوحة لا تعرض استبيانات (وعدم الانهيار مضمون)",
  pub16.available === false && Array.isArray(pub16.answeredKeys))

// صفر تخزين محلي: كل ما سبق في ذاكرة الجلسة فقط
eq("ردود الاستبيانات لا تُكتب على الجهاز", localDataKeys().length === 0, localDataKeys().join("، ") || "لا شيء")
restoreMemory(snap16)

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
