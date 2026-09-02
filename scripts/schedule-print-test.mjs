/**
 * اختبار توليد وطباعة الجدول (PDF HTML) بـ jsdom — node scripts/schedule-print-test.mjs
 *
 * يولّد HTML النسختين فعلياً (المدرس التفصيلية + الطلاب) ويتحقق:
 *  1) نسخة المدرس تحتوي الأسعار والأسماء والهواتف والأرصدة
 *  2) نسخة الطلاب خالية تماماً من أي بيانات حساسة (أمان)
 *  3) خوارزمية تقسيم الصفحات تعمل مع بيانات كثيرة (بارتفاعات محاكاة)
 *  4) الحالات الخاصة: مجموعة بلا طلاب، جدول فارغ، صيغ وقت مختلفة
 */
import { readFileSync } from "node:fs"
import ts from "typescript"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!DOCTYPE html><html dir='rtl'><body></body></html>", { url: "http://localhost/" })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.Image = dom.window.Image
globalThis.HTMLElement = dom.window.HTMLElement

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

const utils = readFileSync("src/lib/utils.ts", "utf8").replace(/import[\s\S]*?from\s*"[\w/.-]+"/g, "")
const weekdays = readFileSync("src/lib/weekdays.ts", "utf8").replace(/export /g, "")
const storageKeys = `const STORAGE_KEYS = { GRADES: "grades", STUDENTS: "students", DUES: "dues", PAYMENTS: "payments", ANNOUNCEMENTS: "announcements", CURRENT_ACADEMIC_YEAR: "currentAcademicYear" };`

let ds = readFileSync("src/lib/data-storage.ts", "utf8")
ds = ds.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/supabase\/sync"/, "")
ds = ds.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/storage-keys"/, "")
ds = ds.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/weekdays"/, "")

let branding = readFileSync("src/lib/branding.ts", "utf8")
branding = branding.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/supabase\/sync"/, "")

let sp = readFileSync("src/lib/schedule-print.ts", "utf8")
sp = sp
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/data-storage"/, "")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/branding"/, "")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/utils"/, "")
  .replace(/import \{ exportToPDF, printElement \} from "\.\/pdf-utils"/,
    `const exportToPDF = async () => true
     const printElement = () => {}`)

let sched = readFileSync("src/lib/schedule.ts", "utf8")
sched = sched
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/data-storage"/, "")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/utils"/, "")

const stubs = ["queuePush","pushGrades","pushStudents","pushDues","pushPayments","pushExams","pushSessions","pushAttendance","pushAnnouncements","pushHonorees","pushSharedFiles","pushImportantLinks","pushYearArchives","pushSetting","pushExamAttempts"]
  .map(f => `const ${f} = () => Promise.resolve();`).join("\n")

const prelude = utils + "\n" + weekdays + "\n" + storageKeys + "\n" + stubs + "\n"
const js = ts.transpileModule(prelude + ds + "\n" + branding + "\n" + sched + "\n" + sp, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText

const { writeFileSync, rmSync } = await import("node:fs")
const { resolve } = await import("node:path")
const tmp = resolve(process.cwd(), ".tmp-schedule-print-test.js")
writeFileSync(tmp, js, "utf8")

let mod
try {
  mod = await import("file://" + tmp)
} finally {
  rmSync(tmp, { force: true })
}

let pass = 0, fail = 0
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  \u2705 " + name) }
  else { fail++; console.log("  \u274c " + name + (extra ? " \u2014 " + extra : "")) }
}

// ============ بيانات اختبارية ============
const grades = [
  {
    id: "g1", name: "الصف الرابع الابتدائي", academicYear: "2026-2027", createdAt: "",
    groups: [
      { id: "gr1", name: "مجموعة 1", days: ["السبت", "الأربعاء"], startTime: "17:00", endTime: "18:00", monthlyFee: 150, studentsCount: 3 },
      { id: "gr2", name: "مجموعة 2", days: ["السبت", "الأربعاء"], startTime: "18:00", endTime: "19:00", monthlyFee: 150, studentsCount: 2 },
    ],
  },
  {
    id: "g2", name: "الصف الخامس الابتدائي", academicYear: "2026-2027", createdAt: "",
    groups: [
      { id: "gr3", name: "مجموعة A", days: ["الأحد", "الثلاثاء"], startTime: "15:00", endTime: "16:30", monthlyFee: 200, studentsCount: 2 },
    ],
  },
]
const students = [
  { id: "s1", name: "أحمد محمد علي", phone: "01001234567", gradeId: "g1", groupId: "gr1", status: "active", createdAt: "", updatedAt: "" },
  { id: "s2", name: "سارة حسين", phone: "01119876543", gradeId: "g1", groupId: "gr1", status: "active", createdAt: "", updatedAt: "" },
  { id: "s3", name: "يوسف كريم", phone: "", gradeId: "g1", groupId: "gr1", status: "inactive", createdAt: "", updatedAt: "" },
  { id: "s4", name: "منة الله سيد", phone: "01222334455", gradeId: "g1", groupId: "gr2", status: "active", createdAt: "", updatedAt: "" },
  { id: "s5", name: "عمر خالد", phone: "01055667788", gradeId: "g1", groupId: "gr2", status: "active", createdAt: "", updatedAt: "" },
  { id: "s6", name: "حبيبة إبراهيم", phone: "01500998877", gradeId: "g2", groupId: "gr3", status: "active", createdAt: "", updatedAt: "" },
  { id: "s7", name: "زياد فتحي", phone: "01060778899", gradeId: "g2", groupId: "gr3", status: "active", createdAt: "", updatedAt: "" },
]
const dues = [
  { id: "d1", studentId: "s1", groupId: "gr1", month: 9, year: 2026, amount: 150, status: "pending", createdAt: "" },
  { id: "d2", studentId: "s2", groupId: "gr1", month: 9, year: 2026, amount: 150, status: "paid", createdAt: "" },
]
const payments = [
  { id: "p1", studentId: "s2", dueId: "d2", amount: 150, paymentDate: "2026-09-01", month: 9, year: 2026, createdAt: "" },
]
store.set("grades", JSON.stringify(grades))
store.set("students", JSON.stringify(students))
store.set("dues", JSON.stringify(dues))
store.set("payments", JSON.stringify(payments))

console.log("اختبار 1: نسخة المدرس التفصيلية (PDF HTML فعلي)")
const t = mod.buildSchedulePagesHtml({ mode: "teacher", grades, students, academicYear: "2026-2027", teacherName: "أ/ ضحى العربي", signatureLine: "مع تمنياتي لكم بالتوفيق" })
check("تولّد صفحة واحدة على الأقل", t.pageCount >= 1)
check("تحتوي أسماء الطلاب", t.html.includes("أحمد محمد علي") && t.html.includes("سارة حسين"))
check("تحتوي أرقام الهواتف", t.html.includes("01001234567"))
check("تحتوي الأسعار", t.html.includes("ج.م"))
check("تحتوي الأرصدة المالية", t.html.includes("مستحق") && t.html.includes("مسدد"))
check("تحتوي حالة الطالب (نشط/موقوف)", t.html.includes("نشط") && t.html.includes("موقوف"))
check("جدول الملخص بالإجماليات", t.html.includes("الإجمالي العام"))
check("توقيع المدرس", t.html.includes("أ/ ضحى العربي"))
check("شارة نسخة المدرس", t.html.includes("نسخة تفصيلية خاصة بالمدرس"))

console.log("اختبار 2: نسخة الطلاب (آمنة — مواعيد فقط)")
const s = mod.buildSchedulePagesHtml({ mode: "student", grades, academicYear: "2026-2027" })
check("تولّد صفحة واحدة على الأقل", s.pageCount >= 1)
check("تحتوي أسماء المجموعات", s.html.includes("مجموعة 1") && s.html.includes("مجموعة A"))
check("تحتوي الأيام", s.html.includes("السبت") && s.html.includes("الأحد"))
check("تحتوي الأوقات", s.html.includes("5:00 م"))
check("لا تحتوي أسماء الطلاب إطلاقاً", !s.html.includes("أحمد") && !s.html.includes("سارة") && !s.html.includes("يوسف"))
check("لا تحتوي أرقام هواتف إطلاقاً", !s.html.includes("01001234567") && !s.html.includes("01119876543"))
check("لا تحتوي الأسعار إطلاقاً", !s.html.includes("ج.م"))
check("لا تحتوي كلمة رصيد أو مستحق", !s.html.includes("رصيد") && !s.html.includes("مستحق") && !s.html.includes("مسدد"))
check("شارة جدول الطلاب", s.html.includes("جدول مواعيد الطلاب"))

console.log("اختبار 3: تقسيم الصفحات — بارتفاعات محاكاة واقعية (jsdom لا يحسب أبعاداً حقيقية)")
// كل عنصر يُقاس بارتفاع 400px → كل كتلة (بطاقة+جدول) = 800px، والميزانية 1009px → صفحة واحدة لكل كتلة
const realRect = dom.window.HTMLElement.prototype.getBoundingClientRect
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { height: 400, width: 700, top: 0, left: 0, right: 700, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }
}
const bigGrades = []
const bigStudents = []
let sid = 0
for (let g = 1; g <= 9; g++) {
  const groups = []
  for (let gr = 1; gr <= 6; gr++) {
    const gid = `bg${g}-${gr}`
    groups.push({ id: gid, name: `مجموعة ${gr}`, days: ["السبت", "الأربعاء"], startTime: `${String(8 + gr).padStart(2, "0")}:00`, endTime: `${String(9 + gr).padStart(2, "0")}:00`, monthlyFee: 100 + g * 10, studentsCount: 40 })
    for (let st = 0; st < 40; st++) {
      sid++
      bigStudents.push({ id: `bs${sid}`, name: `طالب رقم ${sid}`, phone: `01000000${String(sid).padStart(5, "0")}`, gradeId: `bg${g}`, groupId: gid, status: "active", createdAt: "", updatedAt: "" })
    }
  }
  bigGrades.push({ id: `bg${g}`, name: `الصف رقم ${g}`, academicYear: "2026-2027", createdAt: "", groups })
}
store.set("grades", JSON.stringify(bigGrades))
store.set("students", JSON.stringify(bigStudents))
const big = mod.buildSchedulePagesHtml({ mode: "teacher", grades: bigGrades, students: bigStudents, academicYear: "2026-2027" })
check(`النسخة التفصيلية تتجاوز صفحة واحدة (${big.pageCount} صفحة)`, big.pageCount > 1)
check("كل الصفحات فيها class=exam-page", (big.html.match(/class="exam-page"/g) || []).length === big.pageCount)
check("ترقيم الصفحات صحيح", big.html.includes("صفحة 1 من") && big.html.includes(`صفحة ${big.pageCount} من`))
const bigS = mod.buildSchedulePagesHtml({ mode: "student", grades: bigGrades, academicYear: "2026-2027" })
check(`نسخة الطلاب تتجاوز صفحة واحدة (${bigS.pageCount} صفحة)`, bigS.pageCount > 1)
check("نسخة الطلاب الكبيرة بلا أي هواتف", !bigS.html.includes("01000000"))
check("نسخة الطلاب الكبيرة بلا أسعار", !bigS.html.includes("ج.م"))
dom.window.HTMLElement.prototype.getBoundingClientRect = realRect

console.log("اختبار 4: حالات خاصة")
store.set("grades", JSON.stringify([{ id: "gx", name: "صف جديد", academicYear: "2026-2027", createdAt: "", groups: [{ id: "gx1", name: "مجموعة فارغة", days: ["الجمعة"], startTime: "10:00", endTime: "11:00", monthlyFee: 100, studentsCount: 0 }] }]))
store.set("students", JSON.stringify([]))
const empty = mod.buildSchedulePagesHtml({ mode: "teacher", grades: JSON.parse(store.get("grades")), students: [], academicYear: "2026-2027" })
check("مجموعة بلا طلاب تظهر برسالة مناسبة", empty.html.includes("لا يوجد طلاب مسجلون"))
const none = mod.buildSchedulePagesHtml({ mode: "student", grades: [], academicYear: "2026-2027" })
check("جدول فارغ يعرض رسالة مناسبة ولا ينهار", none.pageCount >= 1 && none.html.includes("لا توجد مجموعات بعد"))

console.log("اختبار 5: سلامة المطابقة الزمنية مع صيغ مختلفة (normalizeTime)")
check("9:00 يطابق 09:00 في الكشف", (() => {
  const gs = [{ id: "a", name: "صف", academicYear: "", createdAt: "", groups: [{ id: "ag", name: "م", days: ["السبت"], startTime: "9:00", endTime: "10:00", monthlyFee: 0, studentsCount: 0 }] }]
  return mod.findScheduleConflicts(gs, { days: ["السبت"], startTime: "09:00", endTime: "10:00" }).length === 1
})())
check("وقت النهاية قبل البداية يُرفض", mod.isTimeAfter("17:00", "16:00") === false)
check("وقت سليم يُقبل", mod.isTimeAfter("16:00", "18:00") === true)

console.log("========================================================")
console.log(`النتيجة: ${pass} ناجح / ${fail} فاشل`)
process.exit(fail > 0 ? 1 : 0)
