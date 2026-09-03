/**
 * اختبار منطق منع تعارض المواعيد — node scripts/schedule-test.mjs
 *
 * يتحقق من القاعدة الذهبية: لا يمكن تسجيل مجموعتين في نفس الموعد
 * (نفس اليوم ونفس الوقت) — حتى لو كان يوم واحداً فقط متعارضاً —
 * وأن رسالة الرفض تخبر المعلم باسم المجموعة والصف الذي يحتل الموعد،
 * وأن نسخة الجدول المنشورة للطلاب آمنة (مواعيد فقط بدون أسعار).
 *
 * نفس نهج scripts/logic-test.mjs: محاكاة localStorage وتنفيذ فعلي للدوال.
 */
import { readFileSync } from "node:fs"
import ts from "typescript"

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
globalThis.window = globalThis

// تحميل utils + weekdays + data-storage (مجرّد من الاستيرادات المتصفحية)
const utils = readFileSync("src/lib/utils.ts", "utf8").replace(/import[\s\S]*?from\s*"[\w/.-]+"/g, "")
const weekdays = readFileSync("src/lib/weekdays.ts", "utf8").replace(/export /g, "")
const storageKeys = `const STORAGE_KEYS = { GRADES: "grades", ANNOUNCEMENTS: "announcements" };`

// مخزن الذاكرة الحقيقي — يُنفَّذ كما في المتصفح (صفر تخزين محلي للبيانات)
const memoryStore = readFileSync("src/lib/memory-store.ts", "utf8")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/storage-keys"/, "")
  .replace(/export /g, "") +
  "\nexport { readRows as __readRows, writeRows as __writeRows, clearStore as __clearStore," +
  " readSetting as __readSetting, writeSetting as __writeSetting," +
  " purgeLegacyLocalStorage as __purgeLegacy, adoptLegacyIntoMemory as __adoptLegacy };\n"
const stripMemoryImport = (code) => code.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/memory-store"/, "")

let ds = stripMemoryImport(readFileSync("src/lib/data-storage.ts", "utf8"))
ds = ds.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/supabase\/sync"/, "")
ds = ds.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/storage-keys"/, "")
ds = ds.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/weekdays"/, "")

let sched = readFileSync("src/lib/schedule.ts", "utf8")
sched = sched.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/data-storage"/, "")
sched = sched.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/utils"/, "")
sched = sched.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/branding"/, "")

const prelude = utils + "\n" + weekdays + "\n" + storageKeys + "\n" + memoryStore + "\n" +
  ["queuePush","pushGrades","pushStudents","pushDues","pushPayments","pushExams","pushSessions",
   "pushAttendance","pushAnnouncements","pushHonorees","pushSharedFiles","pushImportantLinks",
   "pushYearArchives","pushSetting","pushExamAttempts"].map(f => `const ${f} = () => Promise.resolve();`).join("\n") + "\n"

const js = ts.transpileModule(prelude + ds + "\n" + sched, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText

const { writeFileSync, rmSync } = await import("node:fs")
const { resolve } = await import("node:path")
const tmp = resolve(process.cwd(), ".tmp-schedule-test.mjs")
writeFileSync(tmp, js, "utf8")
try {
  const modUrl = "file://" + tmp.split("\\").join("/")
  var mod = await import(modUrl)
} finally {
  rmSync(tmp, { force: true })
}

let pass = 0, fail = 0
const check = (name, cond) => {
  if (cond) { pass++; console.log("  ✅ " + name) }
  else { fail++; console.log("  ❌ " + name) }
}

const grades = [
  {
    id: "g1", name: "الصف الرابع الابتدائي", academicYear: "2026-2027", createdAt: "",
    groups: [
      { id: "gr1", name: "مجموعة 1", days: ["السبت", "الأربعاء"], startTime: "17:00", endTime: "18:00", monthlyFee: 150, studentsCount: 12 },
    ],
  },
  {
    id: "g2", name: "الصف الخامس الابتدائي", academicYear: "2026-2027", createdAt: "",
    groups: [
      { id: "gr2", name: "مجموعة A", days: ["الأحد", "الثلاثاء"], startTime: "15:00", endTime: "16:30", monthlyFee: 200, studentsCount: 8 },
    ],
  },
]

console.log("سيناريو 1: نفس الموعد بالضبط (السبت والأربعاء 5-6 م) — يجب المنع")
const c1 = mod.findScheduleConflicts(grades, { days: ["السبت", "الأربعاء"], startTime: "17:00", endTime: "18:00" })
check("يكشف التعارض", c1.length === 2)
check("يخبر باسم المجموعة الحاملة للموعد", c1[0].group.name === "مجموعة 1")
check("يخبر باسم الصف", c1[0].gradeName === "الصف الرابع الابتدائي")
const msg = mod.buildConflictMessage(c1)
check("الرسالة تذكر اليوم والصف والمجموعة", msg.includes("السبت") && msg.includes("الصف الرابع") && msg.includes("مجموعة 1"))

console.log("سيناريو 2: يوم واحد متعارض فقط (السبت فقط بنفس الوقت) — يجب المنع")
const c2 = mod.findScheduleConflicts(grades, { days: ["السبت"], startTime: "17:00", endTime: "18:00" })
check("يمنع حتى لو يوم واحد", c2.length === 1 && c2[0].day === "السبت")

console.log("سيناريو 3: تقاطع جزئي في الوقت (4:30-6:30 يقطع مع 5-6) — يجب المنع")
const c3 = mod.findScheduleConflicts(grades, { days: ["الأربعاء"], startTime: "16:30", endTime: "18:30" })
check("التقاطع الجزئي يُعتبر تعارضاً", c3.length === 1)

console.log("سيناريو 4: نفس اليوم بوقت مختلف تماماً (السبت 8-9 م) — مسموح")
const c4 = mod.findScheduleConflicts(grades, { days: ["السبت"], startTime: "20:00", endTime: "21:00" })
check("لا تعارض عندما لا يتقاطع الوقت", c4.length === 0)

console.log("سيناريو 5: موعد متلاصق (السبت 6-7 م بعد 5-6 م) — مسموح")
const c5 = mod.findScheduleConflicts(grades, { days: ["السبت"], startTime: "18:00", endTime: "19:00" })
check("الحصة التالية مباشرة مسموحة", c5.length === 0)

console.log("سيناريو 6: تعديل نفس المجموعة (استثناء ذاتها) — مسموح")
const c6 = mod.findScheduleConflicts(grades, { days: ["السبت", "الأربعاء"], startTime: "17:00", endTime: "18:00" }, { groupId: "gr1" })
check("المجموعة لا تتعارض مع نفسها", c6.length === 0)

console.log("سيناريو 7: التعارض عبر صفوف مختلفة (الصف الخامس الأحد 15:30-16:30 يقطع مع مجموعة A)")
const c7 = mod.findScheduleConflicts(grades, { days: ["الأحد"], startTime: "15:30", endTime: "16:30" })
check("الفحص يشمل كل الصفوف لا الصف الحالي فقط", c7.length === 1 && c7[0].gradeName === "الصف الخامس الابتدائي")

console.log("سيناريو 8: نص إعلان الجدول آمن للطلاب")
store.set("grades", JSON.stringify(grades))
const body = mod.buildScheduleAnnouncementBody(grades)
check("الإعلان يعرض الأيام والوقت", body.includes("السبت") && body.includes("5:00 م"))
check("الإعلان لا يعرض الأسعار", !body.includes("150") && !body.includes("200"))

console.log("سيناريو 9: نشر/إلغاء نشر الجدول")
mod.setSchedulePublished(true)
check("الحالة منشورة", mod.isSchedulePublished() === true)
mod.setSchedulePublished(false)
check("الحالة غير منشورة", mod.isSchedulePublished() === false)

console.log("سيناريو 10: إعلان الجدول يُحدَّث ولا يتكرر")
const a1 = mod.publishScheduleAnnouncement(grades)
check("أُنشئ إعلان واحد", a1.length === 1 && a1[0].pinned === true)
store.set("grades", JSON.stringify(grades))
const a2 = mod.publishScheduleAnnouncement(grades, true)
check("إعادة النشر تُحدِّث ولا تكرر", a2.length === 1)
const a3 = mod.removeScheduleAnnouncement()
check("الحذف يعمل", a3.length === 0)

console.log("========================================================")
console.log(`النتيجة: ${pass} ناجح / ${fail} فاشل`)
process.exit(fail > 0 ? 1 : 0)
