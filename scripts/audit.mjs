/**
 * تدقيق شامل للمشروع — يُشغَّل بـ: node scripts/audit.mjs
 *
 * يفحص:
 *  1. ألّا تعود ميزة «البيانات التجريبية» القديمة (شريط يقترح إزالة جماعية للصفوف)
 *     — أُلغيت نهائياً بطلب من المالك لأنها سببت قلقاً من حذف بيانات حقيقية
 *  2. القوائم المنسدلة: هل تُصفّى المجموعات حسب الصف المختار؟
 *  3. خرائط Supabase: تطابق الأعمدة مع مخطط قاعدة البيانات
 *  4. أعمدة NOT NULL: هل يمكن أن تصلها قيمة null؟
 *  5. ثغرات شائعة: مفاتيح React، SelectItem بقيمة فارغة، روابط خارجية
 */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

let pass = 0
let fail = 0
const failures = []

function check(name, condition, detail = "") {
  if (condition) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    fail++
    failures.push(`${name}${detail ? " — " + detail : ""}`)
    console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`)
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`)
}

const read = (p) => readFileSync(join(process.cwd(), p), "utf8")

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(f)) out.push(p)
  }
  return out
}

// ============================================================
section("1) ميزة «البيانات التجريبية» أُلغيت نهائياً")
// ============================================================
// بطلب من المالك: كان يظهر في صفحة الصفوف والمجموعات شريط «بيانات تجريبية قديمة»
// يقترح إزالة جماعية، وهو ما أوحى بأن بيانات مسجَّلة فعلاً قد تُحذف. وبما أن كل
// البيانات الآن في Supabase ولا تُنشأ أي صفوف تجريبية في الإصدارات الحالية،
// حُذف الشريط ومنطق الكشف وواجهة الاستعادة من الإعدادات بالكامل.
const srcFiles = walk("src")
const srcText = srcFiles.map((f) => readFileSync(f, "utf8")).join("\n")
// محتوى data-storage — يُستخدم في أقسام لاحقة (السلامة المالية، السنة الدراسية)
const storage = read("src/lib/data-storage.ts")

check(
  "لا وجود لشريط البيانات التجريبية ولا لمنطقه في الكود",
  !/SampleDataBanner|sample-data-banner|getSampleGrades|removeSampleGrades|restoreSampleGrades|SAMPLE_GRADE_IDS|SAMPLE_GRADE_NAMES/.test(
    srcText
  )
)
check(
  "لا توجد أي بذرة بيانات تجريبية في الكود (لن تعود البيانات الافتراضية)",
  !srcFiles.some((f) => {
    const c = readFileSync(f, "utf8")
    // نبحث عن كتابة فعلية للبذرة (setItem)، لا عن تنظيفها (removeItem)
    return (
      /localStorage\.setItem\(\s*['"]initialized['"]/.test(c) ||
      /(?:const|let)\s+(sampleGrades|defaultGrades|seedGrades)\s*(?::[^=]+)?=\s*\[/.test(c)
    )
  })
)

// ============================================================
section("2) القوائم المنسدلة (المجموعات تتبع الصف المختار)")
// ============================================================
const students = read("src/app/dashboard/students/page.tsx")
check(
  "الطلاب/الفلتر: المجموعات مُصفّاة حسب الصف",
  /filterGrade === "all" \|\| g\.gradeId === filterGrade/.test(students)
)
check(
  "الطلاب/النموذج: قائمة المجموعات مشتقة من الصف المختار",
  students.includes("const formGroups = grades.find(g => g.id === form.gradeId)?.groups || []") &&
    /formGroups\.map\(/.test(students)
)
check(
  "الطلاب: رسالة عند عدم وجود صفوف",
  students.includes("لا توجد صفوف — أضف صفاً أولاً")
)

const exams = read("src/app/dashboard/exams/page.tsx")
check(
  "الاختبارات: المجموعات مُصفّاة حسب الصف المختار",
  exams.includes("getGroupsOfGrade(grades, examForm.gradeId)")
)
check("الاختبارات: يمكن نشرها للطلاب على الموقع", exams.includes("allowOnline"))
check("ورقة الاختبار تحمل توقيع المعلمة", read("src/components/exam/exam-paper.tsx").includes("TEACHER_SIGNATURE_LINE"))
check("طباعة A4 متاحة من المعاينة", exams.includes('printElement("exam-preview-content")'))

const attendance = read("src/app/dashboard/attendance/page.tsx")
check(
  "الحضور: المجموعات مُصفّاة حسب الصف المختار",
  attendance.includes("getGroupsOfGrade(grades, selectedGrade)")
)
check(
  "الحضور: أُزيل عنصر Select الميت المستخدم كنافذة",
  !/<Select open=\{newSessionDialog\}/.test(attendance)
)
check("الحضور: لا يُسجَّل عبر الحصص بل يوم المجموعة", !attendance.includes("إضافة حصة جديدة") && attendance.includes("saveGroupDayAttendance"))
check("الحضور: رسالة عند عدم وجود طلاب", attendance.includes("لا يوجد طلاب في هذه المجموعة"))

const payments = read("src/app/dashboard/payments/page.tsx")
check(
  "التحصيل: المجموعات مشتقة من الصف المختار",
  payments.includes("grades.find(g => g.id === payGradeId)?.groups")
)
check(
  "التحصيل: الطلاب مُصفّون حسب المجموعة والحالة النشطة",
  /s\.groupId === payGroupId && s\.status === "active"/.test(payments)
)

// كل SelectItem يجب أن يملك قيمة غير فارغة (Radix يرمي خطأ مع value="")
section("3) سلامة عناصر القوائم (Radix Select)")
const emptyValue = []
for (const f of walk("src")) {
  const c = readFileSync(f, "utf8")
  if (/<SelectItem\s+value=""/.test(c)) emptyValue.push(f)
}
check("لا يوجد SelectItem بقيمة فارغة", emptyValue.length === 0, emptyValue.join(", "))

// ============================================================
section("4) خرائط Supabase مقابل مخطط قاعدة البيانات")
// ============================================================
const sync = read("src/lib/supabase/sync.ts")
const schema = read("supabase/migrations/005_fix_id_types.sql")

// كل ملفات الترحيل بالترتيب — الأعمدة المضافة لاحقًا بـ ALTER TABLE
// جزء من المخطط الفعلي الحالي، ويجب أن تُحتسب مع أعمدة CREATE TABLE
const MIGRATIONS_DIR = "supabase/migrations"
const migrationsSql = readdirSync(join(process.cwd(), MIGRATIONS_DIR))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(process.cwd(), MIGRATIONS_DIR, f), "utf8"))
  .join("\n")

const ALTER_ADD_RE = (table) =>
  new RegExp(
    `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${table}\\s+ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?([a-z_][a-z0-9_]*)([^;]*)`,
    "gi"
  )

function alterColumns(table) {
  return [...migrationsSql.matchAll(ALTER_ADD_RE(table))].map((m) => m[1].toLowerCase())
}

// استخراج أعمدة كل جدول من ملف SQL (+ الأعمدة المضافة بالترحيلات اللاحقة)
function sqlColumns(table) {
  const added = alterColumns(table)
  const m = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`).exec(schema)
  if (!m) return added.length ? [...new Set(added)] : null
  const created = m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT)/i.test(l))
    .map((l) => l.split(/\s+/)[0])
    .filter(Boolean)
  return [...new Set([...created, ...added])]
}

// استخراج المفاتيح من دالة تحويل
function mapKeys(fnName) {
  const m = new RegExp(`(?:const|export const) ${fnName} = \\([^)]*\\) => \\(\\{([\\s\\S]*?)\\n\\}\\);`).exec(sync)
  if (!m) return null
  return [...m[1].matchAll(/^\s{2}([a-z_]+):/gm)].map((x) => x[1])
}

const pairs = [
  ["grades", "toGradeRow"],
  ["students", "toStudentRow"],
  ["dues", "toDueRow"],
  ["payments", "toPaymentRow"],
  ["exams", "toExamRow"],
  ["sessions", "toSessionRow"],
  ["attendance", "toAttendanceRow"],
]

for (const [table, fn] of pairs) {
  const cols = sqlColumns(table)
  const keys = mapKeys(fn)
  if (!cols || !keys) {
    check(`${table}: أمكن تحليل المخطط والخريطة`, false, `cols=${!!cols} keys=${!!keys}`)
    continue
  }
  const unknown = keys.filter((k) => !cols.includes(k))
  check(`${table}: كل الحقول المرسلة موجودة في الجدول`, unknown.length === 0, unknown.join(", "))
}

// أعمدة NOT NULL يجب ألا تُرسل null
section("5) أعمدة NOT NULL محمية من القيم الفارغة")
function notNullCols(table) {
  const m = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`).exec(schema)
  const created = !m
    ? []
    : m[1]
        .split("\n")
        .filter((l) => /NOT NULL/.test(l) && !/DEFAULT/.test(l))
        .map((l) => l.trim().split(/\s+/)[0])
  // أعمدة NOT NULL (بلا DEFAULT) أُضيفت بترحيل لاحق
  const added = [...migrationsSql.matchAll(ALTER_ADD_RE(table))]
    .filter((x) => /NOT\s+NULL/i.test(x[2]) && !/DEFAULT/i.test(x[2]))
    .map((x) => x[1].toLowerCase())
  return [...new Set([...created, ...added])]
}
// أعمدة المفاتيح الأجنبية لا تُملأ بقيم وهمية — تُحمى بترشيح السجلات
// اليتيمة قبل الرفع (انظر pushDues / pushPayments / pushSessions / pushAttendance)
const FK_GUARDED = {
  dues: ["student_id"],
  payments: ["student_id"],
  sessions: ["group_id"],
  attendance: ["session_id", "student_id"],
}

for (const [table, fn] of pairs) {
  const req = notNullCols(table)
    .filter((c) => c !== "id")
    .filter((c) => !(FK_GUARDED[table] || []).includes(c))
  const body = new RegExp(`(?:const|export const) ${fn} = \\([^)]*\\) => \\(\\{([\\s\\S]*?)\\n\\}\\);`).exec(sync)?.[1] || ""
  const unsafe = req.filter((col) => {
    const line = new RegExp(`^\\s{2}${col}:(.*)$`, "m").exec(body)?.[1] || ""
    // آمن إذا كان فيه || أو ?? أو قيمة حرفية
    return line && !/\|\||\?\?/.test(line)
  })
  check(`${table}: أعمدة NOT NULL لها قيم بديلة`, unsafe.length === 0, unsafe.join(", "))
}

section("5b) ترشيح السجلات اليتيمة (بديل القيم الوهمية للمفاتيح الأجنبية)")
check(
  "dues: تُستبعد السجلات التي فُقد طالبها (إلا إذا لم تُحمَّل قائمة الطلاب بعد)",
  /\.filter\(\s*\(\s*d\s*\)\s*=>\s*(!studentsLoaded\s*\|\|\s*studentIds\.has\(d\.studentId\)|studentIds\.has\(d\.studentId\))\)/.test(sync)
)
check(
  "payments: تُستبعد السجلات التي فُقد طالبها (إلا إذا لم تُحمَّل قائمة الطلاب بعد)",
  /\.filter\(\s*\(\s*p\s*\)\s*=>\s*(!studentsLoaded\s*\|\|\s*studentIds\.has\(p\.studentId\)|studentIds\.has\(p\.studentId\))\)/.test(sync)
)
check(
  "sessions: تُستبعد الحصص التي فُقدت مجموعتها (إلا إذا لم تُحمَّل قائمة الصفوف بعد)",
  /gradesLoaded\s*\?\s*rows\.filter\(\s*\(\s*s\s*\)\s*=>\s*groupIds\.has\(s\.groupId\)\)\s*:\s*rows/.test(sync)
)
check(
  "attendance: تُستبعد السجلات التي فُقدت حصتها أو طالبها (مع الحماية)",
  /\(!sessionsLoaded\s*\|\|\s*sessionIds\.has\(a\.sessionId\)\s*\)\s*&&\s*\(!studentsLoaded\s*\|\|\s*studentIds\.has\(a\.studentId\)\)/.test(sync)
)

// ============================================================
section("6) ترتيب المزامنة والتبعيات")
// ============================================================
check("يوجد طابور حفظ متسلسل يمنع التسابق", sync.includes("pushChain"))
check("إعادة محاولة عند خطأ المفتاح الأجنبي", sync.includes("isForeignKeyError"))
check(
  "الرفع بالترتيب: الصفوف ثم الطلاب ثم الاستحقاقات",
  /pushGrades[\s\S]{0,200}pushStudents[\s\S]{0,200}pushDues/.test(
    sync.slice(sync.indexOf("async function pushAllOrdered"))
  )
)
check("تنظيف المراجع المعلّقة قبل الرفع (مع الحماية: لا تصفير عند غياب الصفوف)", /if \(gradesLoaded && row\.grade_id && !gradeIds\.has\(row\.grade_id\)\) row\.grade_id = null/.test(sync))

// ============================================================
section("7) الأمان والثغرات العامة")
// ============================================================
const allFiles = walk("src")

const hardcoded = allFiles.filter((f) => {
  const c = readFileSync(f, "utf8")
  return /(?:service_role|SUPABASE_SERVICE|eyJhbGciOiJIUzI1NiIs)/.test(c)
})
check("لا يوجد مفتاح خدمة Supabase مكشوف في الواجهة", hardcoded.length === 0, hardcoded.join(", "))

const dangerousHtml = allFiles.filter((f) =>
  /dangerouslySetInnerHTML/.test(readFileSync(f, "utf8"))
)
check("لا يوجد dangerouslySetInnerHTML (حماية من XSS)", dangerousHtml.length === 0, dangerousHtml.join(", "))

const noopener = allFiles.filter((f) => {
  const c = readFileSync(f, "utf8")
  return /target="_blank"/.test(c) && !/rel="noopener/.test(c)
})
check("كل الروابط الخارجية تستخدم rel=noopener", noopener.length === 0, noopener.join(", "))

// قرار المالك: الصفحة العامة تعرض زر «دخول المعلم» بهيئة هادئة غير بارزة (أيقونة + نص رمادي صغير)
// يؤول إلى لوحة التحكم /login — وأزرار الطلاب تبقى هي البارزة للزوار
const home = read("src/app/page.tsx")
check(
  "الصفحة الرئيسية تعرض زر دخول المعلم الهادئ المؤدي إلى /login",
  /href="\/login"/.test(home) && /aria-label="دخول المعلم"/.test(home)
)
check(
  "صفحة الدخول بلا لافتة ملاحظة Supabase أسفل النموذج",
  !/ملاحظة مهمة/.test(read("src/app/login/page.tsx"))
)

// حماية لوحة التحكم
const middleware = read("src/proxy.ts")
check("يوجد middleware لحماية المسارات", middleware.length > 0)

const layout = read("src/app/dashboard/layout.tsx")
check(
  "تخطيط اللوحة بلا رسائل اتصال بقاعدة البيانات",
  !layout.includes("SyncIndicator") && !/toast\.(error|success)/.test(layout)
)
check(
  "أخطاء المزامنة لا تظهر كتوست في كل الصفحات",
  !/toast\.error\(message/.test(sync)
)

// ============================================================
section("8) سلامة الحسابات المالية")
// ============================================================
check(
  "رصيد الطالب = الاستحقاقات - المدفوعات",
  /balance: totalDues - totalPayments/.test(storage)
)
check(
  "السنة الدراسية تُحسب من سبتمبر",
  /month >= 9 \? `\$\{year\}-\$\{year \+ 1\}`/.test(storage)
)

// ============================================================
console.log(`\n${"=".repeat(56)}`)
console.log(`\x1b[1mالنتيجة: ${pass} ناجح / ${fail} فاشل\x1b[0m`)
if (fail > 0) {
  console.log("\nالفاشل:")
  failures.forEach((f) => console.log(`  • ${f}`))
  process.exit(1)
} else {
  console.log("\x1b[32mكل الفحوصات نجحت ✅\x1b[0m")
}
