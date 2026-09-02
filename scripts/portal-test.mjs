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
const printElement = () => {}`

// 1) storage-keys (كامل — أي مفاتيح جديدة تُلتقط تلقائياً)
const storageKeys = readFileSync("src/lib/storage-keys.ts", "utf8").replace(/export /g, "")

// 2) weekdays
const weekdays = readFileSync("src/lib/weekdays.ts", "utf8").replace(/export /g, "")

// 3) utils (بلا clsx/twMerge — cn غير مستخدم في المسارات المختبرة)
const utils = readFileSync("src/lib/utils.ts", "utf8").replace(/import[\s\S]*?from\s*"[\w/.@-]+"/g, "")

const rewrite = (src) => src.replace(/from "\.\/([\w-]+)"/g, 'from "./$1.mjs"')

const files = {}
files["storage-keys.mjs"] = storageKeys
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

for (const [name, src] of Object.entries(files)) {
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText
  // eslint-disabled: ملف مؤقت للاختبار
  const { writeFileSync } = await import("node:fs")
  writeFileSync(join(TMP, name), js, "utf8")
}

const DS = await import("file://" + join(TMP, "data-storage.mjs"))
const SA = await import("file://" + join(TMP, "student-accounts.mjs"))
const SR = await import("file://" + join(TMP, "student-report.mjs"))

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

const base = { name: "محمد علي حسن", phone: "01000000001", email: "Mohamed@Test.com", password: "secret1", confirmPassword: "secret1", gradeId: "g-1", groupId: "gr-1" }
eq("اسم قصير جداً → يُرفض", !(await SA.registerStudentAccount({ ...base, name: "محمد" })).ok)
eq("هاتف غير صحيح → يُرفض", !(await SA.registerStudentAccount({ ...base, phone: "12" })).ok)
eq("بريد غير صحيح → يُرفض", !(await SA.registerStudentAccount({ ...base, email: "not-an-email" })).ok)
eq("بدون صف/مجموعة → يُرفض", !(await SA.registerStudentAccount({ ...base, gradeId: "", groupId: "" })).ok)
eq("مجموعة لا تنتمي للصف → تُرفض", !(await SA.registerStudentAccount({ ...base, groupId: "gr-3" })).ok)
eq("كلمة مرور قصيرة → تُرفض", !(await SA.registerStudentAccount({ ...base, password: "123", confirmPassword: "123" })).ok)
eq("تأكيد غير مطابق → يُرفض", !(await SA.registerStudentAccount({ ...base, confirmPassword: "different" })).ok)

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

const reg2 = await SA.registerStudentAccount({ name: "سارة محمود خالد", phone: "01000000003", email: "sara@test.com", password: "sara123", confirmPassword: "sara123", gradeId: "g-2", groupId: "gr-3" })
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

const reg3 = await SA.registerStudentAccount({ name: "كريم فؤاد سيد", phone: "01000000004", email: "karim@test.com", password: "karim123", confirmPassword: "karim123", gradeId: "g-1", groupId: "gr-2" })
eq("طلب كريم يُقبل", reg3.ok === true)
const karimReqId = DS.getRegistrationRequests().find(r => r.email === "karim@test.com").id
const rej = SA.rejectRegistrationRequest(karimReqId, "البيانات غير مكتملة")
eq("الرفض مع سبب ينجح", rej.ok === true)
const karimReqAfter = DS.getRegistrationRequests().find(r => r.id === karimReqId)
eq("حالة الطلب rejected مع السبب", karimReqAfter.status === "rejected" && karimReqAfter.reviewNote === "البيانات غير مكتملة")
const karimLogin1 = await SA.portalLogin("karim@test.com", "karim123")
eq("الدخول بعد الرفض → ممنوع (rejected)", karimLogin1.ok === false && karimLogin1.status === "rejected")

// إعادة التقديم بنفس البريد بعد الرفض مسموحة
const reg3b = await SA.registerStudentAccount({ name: "كريم فؤاد سيد", phone: "01000000004", email: "karim@test.com", password: "karim123", confirmPassword: "karim123", gradeId: "g-1", groupId: "gr-2" })
eq("إعادة التقديم بعد الرفض مسموحة", reg3b.ok === true, reg3b.error || "")
const karimReqs = DS.getRegistrationRequests().filter(r => r.email === "karim@test.com")
const karimReq2 = karimReqs[karimReqs.length - 1]
eq("إعادة التقديم أنشأت طلباً جديداً pending (والقديم ظل rejected)", karimReqs.length === 2 && karimReq2.status === "pending" && karimReqs[0].status === "rejected")

// موافقة ثم حظر ثم إعادة تفعيل ثم حذف الحساب
SA.approveRegistrationRequest(karimReq2.id)
const karimId = DS.getRegistrationRequests()
  .filter(r => r.email === "karim@test.com" && r.status === "approved")
  .map(r => r.linkedStudentId)[0]
const blockRes = SA.setStudentPortalActive(karimId, false)
eq("حظر الطالب ينجح", blockRes.ok === true)
const karimLogin2 = await SA.portalLogin("karim@test.com", "karim123")
eq("الدخول بعد الحظر → ممنوع (blocked)", karimLogin2.ok === false && karimLogin2.status === "blocked")
SA.setStudentPortalActive(karimId, true)
const karimLogin3 = await SA.portalLogin("karim@test.com", "karim123")
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
console.log(`\n${"=".repeat(56)}`)
console.log(`\x1b[1mالنتيجة: ${pass} ناجح / ${fail} فاشل\x1b[0m`)
if (fail) {
  fails.forEach((f) => console.log("  • " + f))
  rmSync(TMP, { recursive: true, force: true })
  process.exit(1)
}
rmSync(TMP, { recursive: true, force: true })
console.log("\x1b[32mكل اختبارات بوابة الطالب والتقارير نجحت ✅\x1b[0m")
