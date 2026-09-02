/**
 * فحص وتدقيق واختبار شامل ومتطور وعميق لجميع أجزاء النظام
 * Comprehensive, Intensive Security, Programmatic, and Operational Audit & Tests
 */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"

// ============================================================
// 1. محاكاة بيئة المتصفح و LocalStorage
// ============================================================
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
globalThis.window = globalThis

let totalPass = 0
let totalFail = 0
const failureList = []

function test(name, fn) {
  try {
    fn()
    totalPass++
    console.log(`  ✅ ${name}`)
  } catch (e) {
    totalFail++
    failureList.push(`${name}: ${e.message}`)
    console.log(`  ❌ ${name} — ${e.message}`)
  }
}

function assert(condition, msg = "Assertion failed") {
  if (!condition) throw new Error(msg)
}

function assertEq(actual, expected, msg = "") {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${msg} (متوقع: ${b} | الفعلي: ${a})`)
}

function section(title) {
  console.log(`\n\x1b[1;36m========================================================\x1b[0m`)
  console.log(`\x1b[1;33m${title}\x1b[0m`)
  console.log(`\x1b[1;36m========================================================\x1b[0m`)
}

// ============================================================
// 2. تحميل وحدات النظام
// ============================================================
const transpileAndLoad = async (path, replacements = []) => {
  let code = readFileSync(path, "utf8")
  for (const [pattern, rep] of replacements) {
    code = code.replace(pattern, rep)
  }
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText
  return await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"))
}

// Weekdays
const weekdaysMod = await transpileAndLoad("src/lib/weekdays.ts")

// Data storage (with mocked sync)
const weekdaysRaw = readFileSync("src/lib/weekdays.ts", "utf8").replace(/export /g, "")
const storageRaw = readFileSync("src/lib/data-storage.ts", "utf8")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/supabase\/sync"/, "")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/storage-keys"/, "")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/weekdays"/, "")

const mockSyncHeader = `
${weekdaysRaw}
const STORAGE_KEYS = ${JSON.stringify({
  GRADES: "grades",
  STUDENTS: "students",
  DUES: "dues",
  PAYMENTS: "payments",
  EXAMS: "exams",
  SESSIONS: "sessions",
  ATTENDANCE: "attendance",
  EXAM_ATTEMPTS: "examAttempts",
  ANNOUNCEMENTS: "announcements",
  HONOREES: "honorees",
  SHARED_FILES: "sharedFiles",
  IMPORTANT_LINKS: "importantLinks",
  CURRENT_ACADEMIC_YEAR: "currentAcademicYear",
  YEAR_ARCHIVES: "yearArchives",
})};
let pushQueueLog = [];
const queuePush = (fn) => { pushQueueLog.push(fn); };
const pushGrades = () => Promise.resolve();
const pushStudents = () => Promise.resolve();
const pushDues = () => Promise.resolve();
const pushPayments = () => Promise.resolve();
const pushExams = () => Promise.resolve();
const pushSessions = () => Promise.resolve();
const pushAttendance = () => Promise.resolve();
const pushAnnouncements = () => Promise.resolve();
const pushHonorees = () => Promise.resolve();
const pushSharedFiles = () => Promise.resolve();
const pushImportantLinks = () => Promise.resolve();
const pushYearArchives = () => Promise.resolve();
const pushSetting = () => Promise.resolve();
const pushExamAttempts = () => Promise.resolve();
`

const storageJs = ts.transpileModule(mockSyncHeader + "\n" + storageRaw, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const storageMod = await import("data:text/javascript;base64," + Buffer.from(storageJs).toString("base64"))

// Exam Grade
const gradeMod = await transpileAndLoad("src/lib/exam-grade.ts", [
  [/import[\s\S]*?from\s*"\.\/data-storage"/, ""],
])

// Exam Public
const examPublicMod = await transpileAndLoad("src/lib/exam-public.ts", [
  [/import type[\s\S]*?from\s*"\.\/data-storage"/, ""],
  [/import\s*\{[\s\S]*?\}\s*from\s*"\.\/exam-grade"/, ""],
], [
  // inject gradeExam
])
const examPublicJs = ts.transpileModule(
  readFileSync("src/lib/exam-grade.ts", "utf8").replace(/import[\s\S]*?from\s*"\.\/data-storage"/, "") +
  "\n" +
  readFileSync("src/lib/exam-public.ts", "utf8")
    .replace(/import type[\s\S]*?from\s*"\.\/data-storage"/, "")
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/exam-grade"/, ""),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }
).outputText
const publicMod = await import("data:text/javascript;base64," + Buffer.from(examPublicJs).toString("base64"))

// Exam templates
const templatesMod = await transpileAndLoad("src/lib/exam-templates.ts", [
  [/import type[\s\S]*?from\s*"\.\/data-storage"/, ""],
])

// Supabase sync
const syncRaw = readFileSync("src/lib/supabase/sync.ts", "utf8")

// Helper function to scan files
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(f)) out.push(p)
  }
  return out
}

const allTsFiles = walk("src")

// ============================================================
// اختبار 1: القراءة والكتابة والحفظ (CRUD & Persistence)
// ============================================================
section("1) اختبارات الكتابة والقراءة والحفظ المحلي والتعامل مع الأخطاء")

test("حفظ واسترجاع الصفوف مع بنية المجموعات كاملة", () => {
  store.clear()
  const g = [
    {
      id: "grade-1",
      name: "الصف الأول الإعدادي",
      academicYear: "2026-2027",
      groups: [
        { id: "grp-1", name: "مجموعة السبت", days: ["السبت", "الثلاثاء"], startTime: "14:00", endTime: "16:00", monthlyFee: 250, studentsCount: 0 },
      ],
      createdAt: new Date().toISOString(),
    },
  ]
  storageMod.saveGrades(g)
  const loaded = storageMod.getGrades()
  assertEq(loaded.length, 1)
  assertEq(loaded[0].name, "الصف الأول الإعدادي")
  assertEq(loaded[0].groups[0].days, ["السبت", "الثلاثاء"])
})

test("معالجة JSON تالف في LocalStorage دون انهيار التطبيق", () => {
  store.set("grades", "{ broken json !!")
  const loaded = storageMod.getGrades()
  assertEq(loaded, [], "يجب أن يعيد مصفوفة فارغة بأمان")
})

test("معالجة بيانات غير مصفوفة (primitive أو object)", () => {
  store.set("students", JSON.stringify({ not: "an array" }))
  const loaded = storageMod.getStudents()
  assertEq(loaded, [], "يجب أن يعيد مصفوفة فارغة إذا كانت القيمة كائناً")
})

test("حفظ واسترجاع الطلاب مع الملاحظات ورقم الهاتف", () => {
  store.clear()
  const s = [
    {
      id: "std-1",
      name: "زياد أحمد",
      phone: "01012345678",
      gradeId: "grade-1",
      groupId: "grp-1",
      status: "active",
      notes: "طالب متفوق",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]
  storageMod.saveStudents(s)
  const loaded = storageMod.getStudents()
  assertEq(loaded.length, 1)
  assertEq(loaded[0].name, "زياد أحمد")
  assertEq(loaded[0].phone, "01012345678")
})

test("حفظ واسترجاع الإعلانات مع حالة التثبيت (Pinned)", () => {
  store.clear()
  const ann = [
    { id: "a1", title: "تنبيه هام", body: "تأجيل الحصة", pinned: true, createdAt: new Date().toISOString() },
    { id: "a2", title: "موعد الاختبار", body: "السبت القادم", pinned: false, createdAt: new Date().toISOString() },
  ]
  storageMod.saveAnnouncements(ann)
  const loaded = storageMod.getAnnouncements()
  assertEq(loaded.length, 2)
  assertEq(loaded[0].pinned, true)
})

test("حفظ واسترجاع الملفات المشتركة وروابط الموقع", () => {
  store.clear()
  storageMod.saveSharedFiles([
    { id: "f1", name: "شيت الوحدة الأولى.pdf", source: "upload", dataUrl: "data:application/pdf;base64,AAAA", addedAt: new Date().toISOString() },
  ])
  storageMod.saveImportantLinks([
    { id: "l1", title: "بنك الأسئلة", url: "https://example.com/bank", addedAt: new Date().toISOString() },
  ])
  assertEq(storageMod.getSharedFiles().length, 1)
  assertEq(storageMod.getImportantLinks().length, 1)
  assertEq(storageMod.getImportantLinks()[0].url, "https://example.com/bank")
})

// ============================================================
// اختبار 2: العمليات الحسابية والمالية وإدارة الديون والمدفوعات
// ============================================================
section("2) اختبارات العمليات الحسابية والمالية والحسابات المعقدة")

test("حساب رصيد الطالب مع تعدد الاستحقاقات والمدفوعات", () => {
  store.clear()
  storageMod.saveStudents([{ id: "s1", name: "محمود", gradeId: "g1", groupId: "grp1", status: "active", createdAt: "", updatedAt: "" }])
  storageMod.saveDues([
    { id: "d1", studentId: "s1", groupId: "grp1", month: 9, year: 2026, amount: 300, status: "pending", createdAt: "" },
    { id: "d2", studentId: "s1", groupId: "grp1", month: 10, year: 2026, amount: 300, status: "pending", createdAt: "" },
    { id: "d3", studentId: "s1", groupId: "grp1", month: 11, year: 2026, amount: 300, status: "pending", createdAt: "" },
  ])
  storageMod.savePayments([
    { id: "p1", studentId: "s1", amount: 300, paymentDate: "2026-09-05", month: 9, year: 2026, createdAt: "" },
    { id: "p2", studentId: "s1", amount: 150, paymentDate: "2026-10-10", month: 10, year: 2026, createdAt: "" },
  ])

  const balance = storageMod.getStudentBalance("s1")
  assertEq(balance.totalDues, 900, "إجمالي المستحقات")
  assertEq(balance.totalPayments, 450, "إجمالي المدفوعات")
  assertEq(balance.balance, 450, "المتبقي المستحق")
})

test("حساب رصيد الطالب الدائن (دفع أكثر من المستحق)", () => {
  store.clear()
  storageMod.saveDues([
    { id: "d1", studentId: "s2", groupId: "grp1", month: 9, year: 2026, amount: 200, status: "pending", createdAt: "" },
  ])
  storageMod.savePayments([
    { id: "p1", studentId: "s2", amount: 500, paymentDate: "2026-09-01", month: 9, year: 2026, createdAt: "" },
  ])
  const balance = storageMod.getStudentBalance("s2")
  assertEq(balance.balance, -300, "رصيد دائن 300 جنيه")
})

test("حساب رصيد لطالب بدون أي سجلات مالية", () => {
  store.clear()
  const balance = storageMod.getStudentBalance("unknown-student")
  assertEq(balance.totalDues, 0)
  assertEq(balance.totalPayments, 0)
  assertEq(balance.balance, 0)
})

// ============================================================
// اختبار 3: التقويم والسنة الدراسية والأرشفة
// ============================================================
section("3) اختبارات إدارة العام الدراسي والأرشفة والاستعادة الشاملة")

test("حساب السنة الدراسية الحالية من التاريخ عبر مدار العام", () => {
  assertEq(storageMod.getCurrentAcademicYear(new Date("2026-09-01")), "2026-2027", "سبتمبر 2026")
  assertEq(storageMod.getCurrentAcademicYear(new Date("2026-12-31")), "2026-2027", "ديسمبر 2026")
  assertEq(storageMod.getCurrentAcademicYear(new Date("2027-01-01")), "2026-2027", "يناير 2027")
  assertEq(storageMod.getCurrentAcademicYear(new Date("2027-08-31")), "2026-2027", "أغسطس 2027")
  assertEq(storageMod.getCurrentAcademicYear(new Date("2027-09-01")), "2027-2028", "سبتمبر 2027")
})

test("اقتراح السنة القادمة بعد إغلاق سنة معينة", () => {
  assertEq(storageMod.getNextAcademicYear("2026-2027"), "2027-2028")
  assertEq(storageMod.getNextAcademicYear("2029-2030"), "2030-2031")
})

test("إغلاق العام الدراسي يؤرشف 7 جداول وينظف النشطة بالكامل", () => {
  store.clear()
  storageMod.saveGrades([{ id: "g1", name: "الصف الرابع", academicYear: "2026-2027", groups: [{ id: "gr1", name: "م1", days: [], startTime: "", endTime: "", monthlyFee: 100, studentsCount: 1 }], createdAt: "" }])
  storageMod.saveStudents([{ id: "s1", name: "خالد", gradeId: "g1", groupId: "gr1", status: "active", createdAt: "", updatedAt: "" }])
  storageMod.saveDues([{ id: "d1", studentId: "s1", groupId: "gr1", month: 9, year: 2026, amount: 100, status: "pending", createdAt: "" }])
  storageMod.savePayments([{ id: "p1", studentId: "s1", amount: 100, paymentDate: "2026-09-01", month: 9, year: 2026, createdAt: "" }])
  storageMod.saveExams([{ id: "e1", gradeId: "g1", title: "امتحان 1", academicYear: "2026-2027", questions: [], createdAt: "", updatedAt: "" }])
  storageMod.saveSessions([{ id: "se1", groupId: "gr1", sessionDate: "2026-09-01", startTime: "", endTime: "", createdAt: "" }])
  storageMod.saveAttendance([{ id: "att1", sessionId: "se1", studentId: "s1", status: "present", createdAt: "" }])

  const archive = storageMod.closeAcademicYear("2026-2027")
  assertEq(archive.stats.grades, 1)
  assertEq(archive.stats.students, 1)
  assertEq(archive.stats.dues, 1)
  assertEq(archive.stats.payments, 1)
  assertEq(archive.stats.exams, 1)
  assertEq(archive.stats.sessions, 1)
  assertEq(archive.stats.attendance, 1)

  // تأكد من تصفير البيانات النشطة
  assertEq(storageMod.getGrades().length, 0)
  assertEq(storageMod.getStudents().length, 0)
  assertEq(storageMod.getDues().length, 0)
  assertEq(storageMod.getPayments().length, 0)
  assertEq(storageMod.getExams().length, 0)
  assertEq(storageMod.getSessions().length, 0)
  assertEq(storageMod.getAttendance().length, 0)
})

test("استعادة الأرشيف تُرجع جميع البيانات السبعة دون نقصان", () => {
  const ok = storageMod.restoreYearArchive("2026-2027")
  assert(ok, "يجب أن تنجح الاستعادة")
  assertEq(storageMod.getGrades().length, 1)
  assertEq(storageMod.getStudents().length, 1)
  assertEq(storageMod.getDues().length, 1)
  assertEq(storageMod.getPayments().length, 1)
  assertEq(storageMod.getExams().length, 1)
  assertEq(storageMod.getSessions().length, 1)
  assertEq(storageMod.getAttendance().length, 1)
  assertEq(storageMod.getStudents()[0].name, "خالد")
})

// ============================================================
// اختبار 4: محرك التصحيح والذكاء الاختباري والتطبيع اللغوي
// ============================================================
section("4) اختبارات التصحيح الآلي للاختبارات وتطبيع النصوص العربية")

test("تطبيع النصوص العربية (الهمزات، التاء المربوطة، التشكيل، المسافات)", () => {
  const norm = gradeMod.normalizeAnswer
  assertEq(norm("  أَحْمَدُ  "), "احمد")
  assertEq(norm("إِبْرَاهِيم"), "ابراهيم")
  assertEq(norm("آيَةٌ"), "ايه")
  assertEq(norm("مَدْرَسَة"), "مدرسه")
  assertEq(norm("مُصْطَفَى"), "مصطفي")
  assertEq(norm("الـــطَّـــاقَـــة"), "الطاقه")
  assertEq(norm("النَّبَاتَاتُ   الْخَضْرَاءُ"), "النباتات الخضراء")
})

test("تصحيح كامل لجميع أنواع الأسئلة الخمسة (MCQ, أكمل, صح وخطأ, علل, صحح)", () => {
  const exam = {
    id: "ex-comprehensive",
    title: "اختبار العلوم الشامل",
    autoHonorBoard: true,
    honorMinPercent: 90,
    academicYear: "2026-2027",
    gradeId: "g1",
    questions: [
      {
        id: "q1",
        questionType: 1, // اختيار من متعدد
        questionNumber: 1,
        orderNumber: 1,
        headerText: "",
        subQuestions: [
          {
            id: "sq1_1",
            orderNumber: 1,
            questionText: "وحدة قياس القوة هي",
            marks: 2,
            choices: [
              { id: "c1", choiceKey: "أ", choiceText: "النيوتن", isCorrect: true },
              { id: "c2", choiceKey: "ب", choiceText: "الجول", isCorrect: false },
              { id: "c3", choiceKey: "ج", choiceText: "المتر", isCorrect: false },
            ],
          },
        ],
      },
      {
        id: "q2",
        questionType: 2, // أكمل
        questionNumber: 2,
        orderNumber: 2,
        headerText: "",
        subQuestions: [
          {
            id: "sq2_1",
            orderNumber: 1,
            questionText: "",
            correctAnswer: "الضوء",
            marks: 2,
          },
        ],
      },
      {
        id: "q3",
        questionType: 3, // صح أو خطأ
        questionNumber: 3,
        orderNumber: 3,
        headerText: "",
        subQuestions: [
          {
            id: "sq3_1",
            orderNumber: 1,
            questionText: "الشمس أقرب النجوم للأرض",
            isTrue: true,
            marks: 2,
          },
        ],
      },
      {
        id: "q4",
        questionType: 4, // مقال / علل (تصحيح يدوي)
        questionNumber: 4,
        orderNumber: 4,
        headerText: "",
        subQuestions: [
          {
            id: "sq4_1",
            orderNumber: 1,
            questionText: "نرى البرق قبل سماع الرعد",
            marks: 3,
            answerLines: 2,
          },
        ],
      },
      {
        id: "q5",
        questionType: 5, // صحح ما تحته خط
        questionNumber: 5,
        orderNumber: 5,
        headerText: "",
        subQuestions: [
          {
            id: "sq5_1",
            orderNumber: 1,
            questionText: "تتحرك الكواكب حول القمر",
            marks: 2,
            corrections: [
              { id: "cor1", wrongWord: "القمر", correctAnswer: "الشمس", wordPosition: 4, wordCount: 1 },
            ],
          },
        ],
      },
    ],
  }

  // إجابات طالب: 4 أسئلة موضوعية صحيحة (المجموع الآلي = 8 من 8) وسؤال مقالي (3 درجات يدوية)
  const studentAnswers = {
    sq1_1: { choiceId: "c1" }, // صحيح (+2)
    sq2_1: { text: " الضَّوْء " }, // صحيح (+2)
    sq3_1: { isTrue: true }, // صحيح (+2)
    sq4_1: { text: "لأن سرعة الضوء أكبر من سرعة الصوت" }, // مقالي (يدوي 3)
    sq5_1: { text: " الشَّمْسُ " }, // صحيح (+2)
  }

  const res = gradeMod.gradeExam(exam, studentAnswers)
  assertEq(res.score, 8, "الدرجة الآلية المحتسبة")
  assertEq(res.autoTotal, 8, "المجموع الآلي الكلي")
  assertEq(res.manualTotal, 3, "المجموع اليدوي الكلي")
  assertEq(res.percent, 100, "النسبة المئوية للأسئلة الآلية")

  // فحص الترشيح للوحة الشرف
  const canHonor = gradeMod.shouldPromoteToHonor(exam, res)
  assert(canHonor, "يجب أن يترشح للوحة الشرف لحصوله على 100% (الحد الأدنى 90%)")
})

test("تصحيح إجابة خاطئة وإجابة فارغة في الاختبار", () => {
  const exam = {
    questions: [
      {
        id: "q1",
        questionType: 1,
        questionNumber: 1,
        orderNumber: 1,
        headerText: "",
        subQuestions: [
          { id: "sq1", orderNumber: 1, questionText: "؟", marks: 5, choices: [{ id: "c1", isCorrect: true, choiceKey: "أ", choiceText: "نعم" }, { id: "c2", isCorrect: false, choiceKey: "ب", choiceText: "لا" }] },
          { id: "sq2", orderNumber: 2, questionText: "؟", marks: 5, choices: [{ id: "c3", isCorrect: true, choiceKey: "أ", choiceText: "نعم" }, { id: "c4", isCorrect: false, choiceKey: "ب", choiceText: "لا" }] },
        ],
      },
    ],
  }
  const res = gradeMod.gradeExam(exam, {
    sq1: { choiceId: "c2" }, // إجابة خاطئة
    // sq2 متروك فارغاً
  })
  assertEq(res.score, 0)
  assertEq(res.autoTotal, 10)
  assertEq(res.percent, 0)
})

// ============================================================
// اختبار 5: الأمان وحماية مفاتيح التصحيح ومنع تسريب الإجابات
// ============================================================
section("5) اختبارات الأمان وحماية مفاتيح التصحيح ومنع الغش والتسريب")

test("stripExamAnswers يحذف تماماً جميع الإجابات الصحيحة من شجرة الاختبار", () => {
  const exam = {
    id: "secret-exam",
    title: "اختبار سري",
    questions: [
      {
        id: "q1",
        questionType: 1,
        questionNumber: 1,
        orderNumber: 1,
        headerText: "",
        subQuestions: [
          { id: "sq1", orderNumber: 1, questionText: "", marks: 2, choices: [{ id: "c1", choiceKey: "أ", choiceText: "1", isCorrect: true }] },
        ],
      },
      {
        id: "q2",
        questionType: 2,
        questionNumber: 2,
        orderNumber: 2,
        headerText: "",
        subQuestions: [
          { id: "sq2", orderNumber: 1, questionText: "", marks: 2, correctAnswer: "السرية التامة" },
        ],
      },
      {
        id: "q3",
        questionType: 3,
        questionNumber: 3,
        orderNumber: 3,
        headerText: "",
        subQuestions: [
          { id: "sq3", orderNumber: 1, questionText: "", marks: 2, isTrue: true },
        ],
      },
      {
        id: "q5",
        questionType: 5,
        questionNumber: 5,
        orderNumber: 5,
        headerText: "",
        subQuestions: [
          { id: "sq5", orderNumber: 1, questionText: "", marks: 2, corrections: [{ id: "co1", wrongWord: "أ", correctAnswer: "ب", wordPosition: 1 }] },
        ],
      },
    ],
  }

  const stripped = publicMod.stripExamAnswers(exam)
  const q1 = stripped.questions[0].subQuestions[0]
  const q2 = stripped.questions[1].subQuestions[0]
  const q3 = stripped.questions[2].subQuestions[0]
  const q5 = stripped.questions[3].subQuestions[0]

  assertEq(q1.choices[0].isCorrect, false, "MCQ isCorrect must be false")
  assertEq(q2.correctAnswer, undefined, "Complete correctAnswer must be undefined")
  assertEq(q3.isTrue, undefined, "True/False isTrue must be undefined")
  assertEq(q5.corrections[0].correctAnswer, "", "Correction correctAnswer must be empty")
})

test("sealExamForStudent & gradeSealedExam يغلف المفاتيح بطريقة معتمة ويصحح بدقة", () => {
  const exam = {
    id: "seal-test",
    title: "اختبار مختوم",
    questions: [
      {
        id: "q1",
        questionType: 1,
        questionNumber: 1,
        orderNumber: 1,
        headerText: "",
        subQuestions: [
          { id: "sq1", orderNumber: 1, questionText: "سؤال", marks: 5, choices: [{ id: "c_right", choiceKey: "أ", choiceText: "صحيح", isCorrect: true }, { id: "c_wrong", choiceKey: "ب", choiceText: "خطأ", isCorrect: false }] },
        ],
      },
    ],
  }

  const { view, token } = publicMod.sealExamForStudent(exam)
  // العرض لا يحمل إجابة صحيحة
  assertEq(view.questions[0].subQuestions[0].choices[0].isCorrect, false)
  // التوكن المشفر يصحح بدقة
  const gradedOk = publicMod.gradeSealedExam(view, token, { sq1: { choiceId: "c_right" } })
  assertEq(gradedOk.score, 5)
  const gradedBad = publicMod.gradeSealedExam(view, token, { sq1: { choiceId: "c_wrong" } })
  assertEq(gradedBad.score, 0)
})

test("toPublicExamCard يفرغ الأسئلة لمنع تسريبها على الصفحة الرئيسية", () => {
  const card = publicMod.toPublicExamCard({
    id: "e1",
    title: "اختبار",
    allowOnline: true,
    questions: [{ id: "q1", questionType: 1, questionNumber: 1, orderNumber: 1, headerText: "", subQuestions: [] }],
  })
  assertEq(card.questions.length, 0, "مصفوفة الأسئلة مفرغة تماماً في البطاقة العامة")
})

// ============================================================
// اختبار 6: الحضور اليومي وجدول المجموعات
// ============================================================
section("6) اختبارات نظام الحضور اليومي وربط الأيام والمجموعات")

test("تسجيل حضور يومي لمجموعة وحساب إحصائيات الحضور والغياب", () => {
  store.clear()
  storageMod.saveGrades([{ id: "g1", name: "الصف الخامس", academicYear: "2026-2027", groups: [{ id: "grp-sat", name: "مجموعة السبت", days: ["السبت"], startTime: "10:00", endTime: "12:00", monthlyFee: 150, studentsCount: 2 }], createdAt: "" }])
  storageMod.saveStudents([
    { id: "st1", name: "عمر", gradeId: "g1", groupId: "grp-sat", status: "active", createdAt: "", updatedAt: "" },
    { id: "st2", name: "مريم", gradeId: "g1", groupId: "grp-sat", status: "active", createdAt: "", updatedAt: "" },
  ])

  // تسجيل حضور 2026-09-05 (عمر حاضر، مريم غائبة)
  storageMod.saveGroupDayAttendance("grp-sat", "2026-09-05", [
    { studentId: "st1", present: true },
    { studentId: "st2", present: false },
  ])

  const dayAtt = storageMod.getGroupDayAttendance("grp-sat", "2026-09-05")
  assertEq(dayAtt.length, 2)
  assertEq(dayAtt.find(a => a.studentId === "st1").status, "present")
  assertEq(dayAtt.find(a => a.studentId === "st2").status, "absent")

  const groupAtt = storageMod.getAttendanceForGroup("grp-sat")
  assertEq(groupAtt.length, 2)
  assertEq(storageMod.getGroupAttendanceDates("grp-sat"), ["2026-09-05"])
})

test("التحقق من أيام الأسبوع باللغة العربية ومطابقة جدول المجموعة", () => {
  assertEq(weekdaysMod.arabicWeekday("2026-09-05"), "السبت") // 5 Sep 2026 is Saturday
  assertEq(weekdaysMod.arabicWeekday("2026-09-06"), "الأحد")
  assertEq(weekdaysMod.arabicWeekday("2026-09-07"), "الاثنين")
  assertEq(weekdaysMod.arabicWeekday("2026-09-08"), "الثلاثاء")
  assertEq(weekdaysMod.arabicWeekday("2026-09-09"), "الأربعاء")
  assertEq(weekdaysMod.arabicWeekday("2026-09-10"), "الخميس")
  assertEq(weekdaysMod.arabicWeekday("2026-09-11"), "الجمعة")

  const groupDays = ["السبت", "الثلاثاء"]
  assert(weekdaysMod.isGroupDay(groupDays, "2026-09-05"), "السبت من أيام المجموعة")
  assert(!weekdaysMod.isGroupDay(groupDays, "2026-09-06"), "الأحد ليس من أيام المجموعة")
})

// ============================================================
// اختبار 7: لوحة الشرف التلقائية والمطابقة الذكية
// ============================================================
section("7) اختبارات لوحة الشرف التلقائية ومحددات الشهور")

test("إضافة متفوق تلقائياً إلى لوحة الشرف عند تحقيق النسبة المطلوبة", () => {
  store.clear()
  const exam = {
    id: "exam-honor-1",
    title: "اختبار أكتوبر",
    autoHonorBoard: true,
    honorMinPercent: 100,
    academicYear: "2026-2027",
    gradeId: "g1",
    questions: [],
    createdAt: "",
    updatedAt: "",
  }
  const h = storageMod.maybeAutoHonor({
    exam,
    studentName: "ميار ياسر",
    groupId: "grp-1",
    studentId: "s-mayar",
    score: 20,
    totalMarks: 20,
  })
  assert(h !== null, "يجب إضافة الطالب للوحة الشرف")
  assertEq(h.studentName, "ميار ياسر")
  assertEq(h.autoPromoted, true)
  assertEq(storageMod.getHonorees().length, 1)

  // منع التكرار لنفس الطالب لنفس الاختبار في نفس الشهر
  const duplicate = storageMod.maybeAutoHonor({
    exam,
    studentName: "ميار ياسر",
    groupId: "grp-1",
    studentId: "s-mayar",
    score: 20,
    totalMarks: 20,
  })
  assertEq(duplicate, null, "يجب عدم تكرار نفس الطالب لنفس الامتحان")
  assertEq(storageMod.getHonorees().length, 1)
})

test("فحص نشاط المكرم حسب الشهر الحالي", () => {
  const h1 = { id: "h1", studentName: "أ", groupId: "g", reason: "", month: 9, year: 2026, createdAt: "" }
  assert(storageMod.isHonoreeActive(h1, new Date("2026-09-15")), "نشط في سبتمبر 2026")
  assert(!storageMod.isHonoreeActive(h1, new Date("2026-10-01")), "غير نشط في أكتوبر 2026")
  assert(!storageMod.isHonoreeActive(h1, new Date("2025-09-15")), "غير نشط في سنة أخرى")
})

// ============================================================
// اختبار 8: قوالب الامتحانات والزخارف العلمية
// ============================================================
section("8) اختبارات قوالب الامتحانات والزخارف العلمية واكتشاف الصفوف")

test("التعرف على الشريحة الدراسية وتعيين الزخارف العلمية المناسبة", () => {
  assertEq(templatesMod.detectGradeBand("الصف الرابع الابتدائي"), "g4")
  assertEq(templatesMod.detectGradeBand("الصف الخامس الابتدائي"), "g5")
  assertEq(templatesMod.detectGradeBand("الصف السادس الابتدائي"), "g6")
  assertEq(templatesMod.detectGradeBand("الصف الأول الإعدادي"), "prep")
  assertEq(templatesMod.detectGradeBand("الصف الثاني الإعدادي"), "prep")
  assertEq(templatesMod.detectGradeBand("الصف الأول الثانوي"), "sec1")

  const g4Ornaments = templatesMod.getOrnamentsForGrade("الصف الرابع الابتدائي")
  assert(g4Ornaments.includes("sun") && g4Ornaments.includes("leaf"), "الرابع يحوي شمس ونبات")

  const prepOrnaments = templatesMod.getOrnamentsForGrade("الصف الأول الإعدادي")
  assert(prepOrnaments.includes("atom") && prepOrnaments.includes("flask"), "الإعدادي يحوي ذرة ودورق")
})

test("القوالب الخمسة معرفة بالكامل ولها أسماء وتدرجات لونية", () => {
  assertEq(templatesMod.EXAM_TEMPLATES.length, 5)
  const ids = templatesMod.EXAM_TEMPLATES.map(t => t.id)
  assert(ids.includes("classic"))
  assert(ids.includes("lab"))
  assert(ids.includes("life"))
  assert(ids.includes("cosmos"))
  assert(ids.includes("explorer"))
})

// ============================================================
// اختبار 9: التدقيق الأمني وفحص الشفرة المصدرية (Static Security Audit)
// ============================================================
section("9) التدقيق الأمني البرمجي الصارم لكل سطر في الكود")

test("فحص عدم وجود مفاتيح Supabase السرية (service_role) في الواجهة", () => {
  const leaks = allTsFiles.filter(f => {
    const content = readFileSync(f, "utf8")
    return /(?:service_role|SUPABASE_SERVICE_ROLE_KEY|eyJhbGciOiJIUzI1NiIs)/.test(content)
  })
  assertEq(leaks.length, 0, `تسريب في: ${leaks.join(", ")}`)
})

test("فحص خلو جميع الملفات من dangerouslySetInnerHTML (حماية من XSS)", () => {
  const xss = allTsFiles.filter(f => {
    const content = readFileSync(f, "utf8")
    return /dangerouslySetInnerHTML/.test(content)
  })
  assertEq(xss.length, 0, `ثغرة XSS محتملة في: ${xss.join(", ")}`)
})

test("فحص جميع الروابط الخارجية: يجب أن تحتوي على rel='noopener noreferrer'", () => {
  const unsafeLinks = allTsFiles.filter(f => {
    const content = readFileSync(f, "utf8")
    const hasTargetBlank = /target="_blank"/.test(content)
    const hasRelNoopener = /rel="noopener/.test(content)
    return hasTargetBlank && !hasRelNoopener
  })
  assertEq(unsafeLinks.length, 0, `روابط خارجية غير آمنة في: ${unsafeLinks.join(", ")}`)
})

test("فحص عناصر Radix Select: خلو جميع SelectItem من القيم الفارغة value=''", () => {
  const emptySelects = allTsFiles.filter(f => {
    const content = readFileSync(f, "utf8")
    return /<SelectItem\s+value=""/.test(content)
  })
  assertEq(emptySelects.length, 0, `عنصر Select فارغ في: ${emptySelects.join(", ")}`)
})

test("فحص Middleware: حماية جميع مسارات /dashboard والتوجيه إلى /login", () => {
  const mw = readFileSync("src/middleware.ts", "utf8")
  assert(mw.includes("req.nextUrl.pathname.startsWith('/dashboard')"), "حماية مسار الداشبورد")
  assert(mw.includes("NextResponse.redirect(redirectUrl)"), "إعادة التوجيه عند انعدام الجلسة")
})

test("فحص الصفحة العامة: عدم ظهور رابط الدخول في الصفحة الرئيسية", () => {
  const home = readFileSync("src/app/page.tsx", "utf8")
  assert(!/href="\/login"/.test(home), "الصفحة الرئيسية عامة ولا تحوي رابط لوحة التحكم")
})

// ============================================================
// اختبار 10: حماية سلامة المخطط وقواعد Supabase RLS
// ============================================================
section("10) اختبارات سلامة مخطط قاعدة البيانات وسياسات الأمان RLS")

test("فحص مخطط قاعدة البيانات: وجود جميع الجداول الـ 15", () => {
  const schema = readFileSync("supabase/schema.sql", "utf8")
  const requiredTables = [
    "grades", "groups", "students", "dues", "payments",
    "exams", "sessions", "attendance", "announcements",
    "honorees", "shared_files", "important_links",
    "year_archives", "app_settings", "exam_attempts"
  ]
  for (const table of requiredTables) {
    assert(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `جدول ${table} مفقود في schema.sql`)
  }
})

test("فحص تفعيل سياسات RLS على جميع الجداول الـ 15", () => {
  const schema = readFileSync("supabase/schema.sql", "utf8")
  const requiredTables = [
    "grades", "groups", "students", "dues", "payments",
    "exams", "sessions", "attendance", "announcements",
    "honorees", "shared_files", "important_links",
    "year_archives", "app_settings", "exam_attempts"
  ]
  for (const table of requiredTables) {
    assert(schema.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`), `RLS غير مفعل للجدول ${table}`)
  }
})

test("فحص صلاحيات الوصول للزوار (anon): قراءة المحتوى العام فقط مع إمكانية تسليم الاختبار", () => {
  const schema = readFileSync("supabase/schema.sql", "utf8")
  assert(schema.includes("CREATE POLICY \"public read announcements\""), "قراءة الإعلانات عامة")
  assert(schema.includes("CREATE POLICY \"public read honorees\""), "قراءة لوحة الشرف عامة")
  assert(schema.includes("CREATE POLICY \"public read shared_files\""), "قراءة الملفات عامة")
  assert(schema.includes("CREATE POLICY \"public read important_links\""), "قراءة الروابط عامة")
  assert(schema.includes("CREATE POLICY \"anon insert exam_attempts\""), "تسليم الاختبار متاح للزائر")
})

// ============================================================
// النتائج النهائية
// ============================================================
console.log(`\n\x1b[1;35m${"=".repeat(56)}\x1b[0m`)
console.log(`\x1b[1mإجمالي الاختبارات المتقدمة: ${totalPass + totalFail} | الناجحة: ${totalPass} ✅ | الفاشلة: ${totalFail} ❌\x1b[0m`)
console.log(`\x1b[1;35m${"=".repeat(56)}\x1b[0m`)

if (totalFail > 0) {
  console.log("\nقائمة الفشل:")
  failureList.forEach(f => console.log(`  • ${f}`))
  process.exit(1)
} else {
  console.log(`\x1b[32;1m🎉 جميع الاختبارات الأمنية والبرمجية والتشغيلية والحسابية نجحت بنسبة 100% بدون أي أخطاء! ✅\x1b[0m\n`)
}
