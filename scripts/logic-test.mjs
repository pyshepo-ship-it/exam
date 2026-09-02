/**
 * اختبار سلوكي حقيقي للمنطق الحرج — node scripts/logic-test.mjs
 *
 * يحاكي localStorage وينفّذ دوال data-storage فعلياً للتأكد من أن
 * البيانات الحقيقية لا تُحذف أبداً، وأن الحسابات صحيحة.
 */

import { readFileSync } from "node:fs"
import ts from "typescript"

// ---- محاكاة localStorage ----
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
globalThis.window = globalThis

// ---- تحميل data-storage بعد تجريده من استيراد Supabase ----
let src = readFileSync("src/lib/data-storage.ts", "utf8")
src = src.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/supabase\/sync"/, "")
src = src.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/storage-keys"/, "")
// بدائل محلية
src =
  `const STORAGE_KEYS = ${JSON.stringify({
    GRADES: "grades", STUDENTS: "students", DUES: "dues", PAYMENTS: "payments",
    EXAMS: "exams", SESSIONS: "sessions", ATTENDANCE: "attendance",
    ANNOUNCEMENTS: "announcements", HONOREES: "honorees", SHARED_FILES: "sharedFiles",
    IMPORTANT_LINKS: "importantLinks", CURRENT_ACADEMIC_YEAR: "currentAcademicYear",
    YEAR_ARCHIVES: "yearArchives",
  })};\n` +
  `const queuePush = () => {};\n` +
  [
    "pushGrades","pushStudents","pushDues","pushPayments","pushExams","pushSessions",
    "pushAttendance","pushAnnouncements","pushHonorees","pushSharedFiles",
    "pushImportantLinks","pushYearArchives","pushSetting",
  ].map((f) => `const ${f} = () => Promise.resolve();`).join("\n") +
  "\n" + src

const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText

const mod = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
)

let pass = 0, fail = 0
const fails = []
function t(name, fn) {
  try {
    fn()
    pass++
    console.log(`  ✅ ${name}`)
  } catch (e) {
    fail++
    fails.push(`${name}: ${e.message}`)
    console.log(`  ❌ ${name} — ${e.message}`)
  }
}
function eq(a, b, msg = "") {
  const A = JSON.stringify(a), B = JSON.stringify(b)
  if (A !== B) throw new Error(`${msg} توقعت ${B} لكن حصلت على ${A}`)
}

const reset = () => store.clear()
const grade = (id, name, groups = []) => ({
  id, name, academicYear: "2026-2027", groups, createdAt: new Date().toISOString(),
})
const group = (id, name) => ({
  id, name, days: ["السبت"], startTime: "16:00", endTime: "18:00",
  monthlyFee: 200, studentsCount: 0,
})

console.log("\n\x1b[1mسيناريو 1: البيانات التجريبية القديمة الحقيقية\x1b[0m")
t("تُكتشف البذرة القديمة (id=1) الفارغة", () => {
  reset()
  mod.saveGrades([grade("1", "الصف الرابع الابتدائي", [group("g1", "مجموعة 1")])])
  eq(mod.getSampleGrades().length, 1)
})
t("تُحذف عند التأكيد ولا يُحذف أي طالب", () => {
  const r = mod.removeSampleGrades()
  eq(r.removedGrades, 1, "عدد الصفوف المحذوفة:")
  eq(r.removedStudents, 0, "عدد الطلاب المحذوفة:")
  eq(mod.getGrades().length, 0)
})
t("يمكن التراجع واستعادتها", () => {
  eq(mod.hasSampleBackup(), true)
  eq(mod.restoreSampleGrades(), 1)
  eq(mod.getGrades().length, 1)
})

console.log("\n\x1b[1mسيناريو 2: 🔴 الخطأ الذي حدث معك — صف حقيقي بنفس الاسم\x1b[0m")
t("صف أنشأه المستخدم باسم تجريبي لا يُعتبر تجريبياً", () => {
  reset()
  // المستخدم أنشأ صفاً حقيقياً — المعرّف من Date.now()
  mod.saveGrades([grade("1772650000000", "الصف الرابع الابتدائي", [group("gr9", "مجموعة أ")])])
  eq(mod.getSampleGrades().length, 0, "يجب ألا يُكتشف كتجريبي:")
})
t("removeSampleGrades لا يحذف شيئاً في هذه الحالة", () => {
  const r = mod.removeSampleGrades()
  eq(r.removedGrades, 0)
  eq(mod.getGrades().length, 1, "الصف الحقيقي باقٍ:")
  eq(mod.getGrades()[0].groups.length, 1, "المجموعة باقية:")
})

console.log("\n\x1b[1mسيناريو 3: الصف التجريبي عليه بيانات\x1b[0m")
t("لا يُعتبر تجريبياً إذا كان عليه طالب", () => {
  reset()
  mod.saveGrades([grade("1", "الصف الرابع الابتدائي", [group("g1", "مجموعة 1")])])
  mod.saveStudents([{
    id: "s1", name: "أحمد", gradeId: "1", groupId: "g1", status: "active",
    createdAt: "", updatedAt: "",
  }])
  eq(mod.getSampleGrades().length, 0)
})
t("لا يُعتبر تجريبياً إذا كان عليه اختبار", () => {
  reset()
  mod.saveGrades([grade("1", "الصف الرابع الابتدائي", [group("g1", "مجموعة 1")])])
  mod.saveExams([{
    id: "e1", gradeId: "1", title: "اختبار", academicYear: "2026-2027",
    questions: [], createdAt: "", updatedAt: "",
  }])
  eq(mod.getSampleGrades().length, 0)
})
t("لا يُعتبر تجريبياً إذا كان عليه حصة", () => {
  reset()
  mod.saveGrades([grade("1", "الصف الرابع الابتدائي", [group("g1", "مجموعة 1")])])
  mod.saveSessions([{
    id: "se1", groupId: "g1", sessionDate: "2026-09-01",
    startTime: "", endTime: "", createdAt: "",
  }])
  eq(mod.getSampleGrades().length, 0)
})

console.log("\n\x1b[1mسيناريو 4: الحسابات المالية\x1b[0m")
t("رصيد الطالب يُحسب صحيحاً", () => {
  reset()
  mod.saveStudents([{
    id: "s1", name: "أحمد", gradeId: "1", groupId: "g1",
    status: "active", createdAt: "", updatedAt: "",
  }])
  mod.saveDues([
    { id: "d1", studentId: "s1", groupId: "g1", month: 9, year: 2026, amount: 200, status: "pending", createdAt: "" },
    { id: "d2", studentId: "s1", groupId: "g1", month: 10, year: 2026, amount: 200, status: "pending", createdAt: "" },
  ])
  mod.savePayments([
    { id: "p1", studentId: "s1", amount: 150, paymentDate: "2026-09-05", month: 9, year: 2026, createdAt: "" },
  ])
  const b = mod.getStudentBalance("s1")
  eq(b.totalDues, 400, "إجمالي الاستحقاقات:")
  eq(b.totalPayments, 150, "إجمالي المدفوعات:")
  eq(b.balance, 250, "المتبقي:")
})

console.log("\n\x1b[1mسيناريو 5: السنة الدراسية\x1b[0m")
t("سبتمبر 2026 ← 2026-2027", () => {
  eq(mod.getCurrentAcademicYear(new Date("2026-09-15")), "2026-2027")
})
t("أغسطس 2026 ← 2025-2026", () => {
  eq(mod.getCurrentAcademicYear(new Date("2026-08-15")), "2025-2026")
})
t("السنة التالية بعد 2026-2027 هي 2027-2028", () => {
  eq(mod.getNextAcademicYear("2026-2027"), "2027-2028")
})

console.log("\n\x1b[1mسيناريو 6: إغلاق العام الدراسي واستعادته\x1b[0m")
t("الإغلاق يؤرشف كل البيانات ويفرّغ النشطة", () => {
  reset()
  mod.saveGrades([grade("g", "الصف الأول", [group("gg", "م1")])])
  mod.saveStudents([{ id: "s1", name: "أحمد", gradeId: "g", groupId: "gg", status: "active", createdAt: "", updatedAt: "" }])
  const a = mod.closeAcademicYear("2026-2027")
  eq(a.stats.students, 1, "عدد الطلاب المؤرشفة:")
  eq(mod.getStudents().length, 0, "الطلاب النشطون بعد الإغلاق:")
  eq(mod.getGrades().length, 0, "الصفوف النشطة بعد الإغلاق:")
})
t("الاستعادة تُرجع البيانات كاملة", () => {
  eq(mod.restoreYearArchive("2026-2027"), true)
  eq(mod.getStudents().length, 1)
  eq(mod.getGrades().length, 1)
})

console.log("\n\x1b[1mسيناريو 7: لوحة الشرف\x1b[0m")
t("المكرَّم يظهر في شهره فقط", () => {
  const h = { id: "h", studentName: "أحمد", groupId: "g", reason: "تفوق", month: 9, year: 2026, createdAt: "" }
  eq(mod.isHonoreeActive(h, new Date("2026-09-10")), true, "سبتمبر:")
  eq(mod.isHonoreeActive(h, new Date("2026-10-10")), false, "أكتوبر:")
})

console.log("\n\x1b[1mسيناريو 8: getAllGroups يربط الصف بالمجموعة\x1b[0m")
t("كل مجموعة تحمل gradeId و gradeName الصحيحين", () => {
  const gs = mod.getAllGroups([
    grade("A", "الصف الأول", [group("a1", "م1"), group("a2", "م2")]),
    grade("B", "الصف الثاني", [group("b1", "م1")]),
  ])
  eq(gs.length, 3)
  eq(gs.filter((g) => g.gradeId === "A").length, 2, "مجموعات الصف الأول:")
  eq(gs.find((g) => g.id === "b1").gradeName, "الصف الثاني")
})

console.log(`\n${"=".repeat(56)}`)
console.log(`\x1b[1mالنتيجة: ${pass} ناجح / ${fail} فاشل\x1b[0m`)
if (fail) {
  fails.forEach((f) => console.log("  • " + f))
  process.exit(1)
}
console.log("\x1b[32mكل الاختبارات السلوكية نجحت ✅\x1b[0m")
