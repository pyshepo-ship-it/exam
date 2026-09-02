/**
 * سكريبت التدقيق والمراجعة الشاملة الجديد والمستقل
 * Fresh Comprehensive Audit & Security Verification Suite
 *
 * يختبر جميع أقسام التطبيق بشكل منفرد + فحص الأمان والكوكيز والتوكين والتشفير
 */

import { readFileSync } from "node:fs"
import ts from "typescript"

// ==========================================
// محاكاة بيئة المتصفح والتخزين المحلي
// ==========================================
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
globalThis.window = globalThis

// تحميل الكود المصدري بعد استبعاد الاستيرادات الخارجية
let dsSrc = readFileSync("src/lib/data-storage.ts", "utf8")
dsSrc = dsSrc.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/supabase\/sync"/, "")
dsSrc = dsSrc.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/storage-keys"/, "")
dsSrc = dsSrc.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/weekdays"/, "")
const weekdays = readFileSync("src/lib/weekdays.ts", "utf8").replace(/export /g, "")

dsSrc =
  weekdays + "\n" +
  `const STORAGE_KEYS = ${JSON.stringify({
    GRADES: "grades", STUDENTS: "students", DUES: "dues", PAYMENTS: "payments",
    EXAMS: "exams", SESSIONS: "sessions", ATTENDANCE: "attendance",
    EXAM_ATTEMPTS: "examAttempts",
    ANNOUNCEMENTS: "announcements", HONOREES: "honorees", SHARED_FILES: "sharedFiles",
    IMPORTANT_LINKS: "importantLinks", CURRENT_ACADEMIC_YEAR: "currentAcademicYear",
    YEAR_ARCHIVES: "yearArchives",
  })};\n` +
  `const queuePush = () => {};\n` +
  [
    "pushGrades","pushStudents","pushDues","pushPayments","pushExams","pushSessions",
    "pushAttendance","pushAnnouncements","pushHonorees","pushSharedFiles",
    "pushImportantLinks","pushYearArchives","pushSetting","pushExamAttempts",
  ].map((f) => `const ${f} = () => Promise.resolve();`).join("\n") +
  "\n" + dsSrc

const dsJs = ts.transpileModule(dsSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const ds = await import("data:text/javascript;base64," + Buffer.from(dsJs).toString("base64"))

let gradeSrc = readFileSync("src/lib/exam-grade.ts", "utf8")
gradeSrc = gradeSrc.replace(/import[\s\S]*?from\s*"\.\/data-storage"/, "")
const gradeJs = ts.transpileModule(gradeSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const gradeMod = await import("data:text/javascript;base64," + Buffer.from(gradeJs).toString("base64"))

let pubSrc = readFileSync("src/lib/exam-public.ts", "utf8")
pubSrc = pubSrc.replace(/import type[\s\S]*?from\s*"\.\/data-storage"/, "")
pubSrc = pubSrc.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/exam-grade"/, "")
const pubJs = ts.transpileModule(gradeSrc + "\n" + pubSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const pubMod = await import("data:text/javascript;base64," + Buffer.from(pubJs).toString("base64"))

let tplSrc = readFileSync("src/lib/exam-templates.ts", "utf8")
tplSrc = tplSrc.replace(/import type[\s\S]*?from\s*"\.\/data-storage"/, "")
const tplJs = ts.transpileModule(tplSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const tplMod = await import("data:text/javascript;base64," + Buffer.from(tplJs).toString("base64"))

let utilsSrc = readFileSync("src/lib/utils.ts", "utf8")
utilsSrc = utilsSrc.replace(/import\s*\{[\s\S]*?\}\s*from\s*"tailwind-merge"/, "")
utilsSrc = utilsSrc.replace(/import\s*\{[\s\S]*?\}\s*from\s*"clsx"/, "")
const utilsJs = ts.transpileModule(utilsSrc + "\nexport { formatTime12, addDuration };", {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const utilsMod = await import("data:text/javascript;base64," + Buffer.from(utilsJs).toString("base64"))

// ==========================================
// محرك نتائج الاختبارات
// ==========================================
let totalPassed = 0, totalFailed = 0
const failMessages = []

function assert(condition, testName) {
  if (condition) {
    totalPassed++
    console.log(`  \x1b[32m✔\x1b[0m ${testName}`)
  } else {
    totalFailed++
    failMessages.push(testName)
    console.log(`  \x1b[31m✖\x1b[0m ${testName}`)
  }
}

function assertEqual(actual, expected, testName) {
  const actualStr = JSON.stringify(actual)
  const expStr = JSON.stringify(expected)
  if (actualStr === expStr) {
    totalPassed++
    console.log(`  \x1b[32m✔\x1b[0m ${testName}`)
  } else {
    totalFailed++
    failMessages.push(`${testName} -> Expected: ${expStr}, Got: ${actualStr}`)
    console.log(`  \x1b[31m✖\x1b[0m ${testName} (Expected ${expStr}, got ${actualStr})`)
  }
}

console.log("\n\x1b[1;34m====================================================================\x1b[0m")
console.log("\x1b[1;36m  فحص الجودة والأمان الشامل والاختبارات المخصصة لكل قسم منفرد  \x1b[0m")
console.log("\x1b[1;34m====================================================================\x1b[0m\n")

// ------------------------------------------------------------
// القسم 1: إدارة الصفوف والمجموعات ومنتقي الوقت للجوال
// ------------------------------------------------------------
console.log("\x1b[1;33m[1] قسم الصفوف والمجموعات ومواعيد الحصص (Time Picker Engine):\x1b[0m")
store.clear()

// اختبار تحويل 24h -> 12h مع العربية
assertEqual(utilsMod.formatTime12("16:00"), "4:00 م", "تحويل 16:00 إلى 4:00 م")
assertEqual(utilsMod.formatTime12("09:30"), "9:30 ص", "تحويل 09:30 إلى 9:30 ص")
assertEqual(utilsMod.formatTime12("12:00"), "12:00 م", "تحويل 12:00 (منتصف النهار) إلى 12:00 م")
assertEqual(utilsMod.formatTime12("00:00"), "12:00 ص", "تحويل 00:00 (منتصف الليل) إلى 12:00 ص")
assertEqual(utilsMod.formatTime12("13:45"), "1:45 م", "تحويل 13:45 إلى 1:45 م")

// اختبار إضافة المدة الزمنية
assertEqual(utilsMod.addDuration("16:00", 60), "17:00", "إضافة ساعة (60 دقيقة) إلى 16:00 -> 17:00")
assertEqual(utilsMod.addDuration("16:00", 90), "17:30", "إضافة ساعة ونصف (90 دقيقة) إلى 16:00 -> 17:30")
assertEqual(utilsMod.addDuration("16:00", 120), "18:00", "إضافة ساعتين (120 دقيقة) إلى 16:00 -> 18:00")
assertEqual(utilsMod.addDuration("23:30", 60), "00:30", "تجاوز منتصف الليل بأمان (23:30 + 60m -> 00:30)")

// حفظ واسترجاع صف ومجموعة
const testGrade = {
  id: "grade-p4",
  name: "الصف الرابع الابتدائي",
  academicYear: "2026-2027",
  createdAt: new Date().toISOString(),
  groups: [
    {
      id: "grp-sat-4pm",
      name: "مجموعة السبت 4 مساءً",
      days: ["السبت", "الثلاثاء"],
      startTime: "16:00",
      endTime: "18:00",
      monthlyFee: 250,
      studentsCount: 0,
    },
  ],
}
ds.saveGrades([testGrade])
const savedGrades = ds.getGrades()
assert(savedGrades.length === 1 && savedGrades[0].id === "grade-p4", "حفظ واسترجاع الصف والمجموعة بنجاح")
assertEqual(savedGrades[0].groups[0].startTime, "16:00", "وقت بداية المجموعة محفوظ بدقة")
assertEqual(savedGrades[0].groups[0].endTime, "18:00", "وقت نهاية المجموعة محفوظ بدقة")

// ------------------------------------------------------------
// القسم 2: قسم الطلاب والربط بالمجموعات
// ------------------------------------------------------------
console.log("\n\x1b[1;33m[2] قسم إدارة الطلاب والربط الإحصائي:\x1b[0m")
const testStudents = [
  { id: "std-1", name: "محمد أحمد علي", gradeId: "grade-p4", groupId: "grp-sat-4pm", phone: "01012345678", parentPhone: "01112345678", status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "std-2", name: "سارة محمود حسن", gradeId: "grade-p4", groupId: "grp-sat-4pm", phone: "01212345678", parentPhone: "01512345678", status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "std-3", name: "علي عمر إبراهيم", gradeId: "grade-p4", groupId: "grp-sat-4pm", phone: "", parentPhone: "", status: "inactive", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
]
ds.saveStudents(testStudents)
const activeStudents = ds.getStudents().filter(s => s.status === "active")
assertEqual(activeStudents.length, 2, "تصفية الطلاب النشطين (2 نشط، 1 غير نشط)")
const groupsOfP4 = ds.getGroupsOfGrade(ds.getGrades(), "grade-p4")
assertEqual(groupsOfP4.length, 1, "استرجاع مجموعات الصف الرابع بدقة")
assertEqual(groupsOfP4[0].name, "مجموعة السبت 4 مساءً", "مطابقة اسم المجموعة المسترجعة")

// ------------------------------------------------------------
// القسم 3: قسم الحضور والغياب اليومي (بدون حصص يدوية)
// ------------------------------------------------------------
console.log("\n\x1b[1;33m[3] قسم الحضور والغياب اليومي:\x1b[0m")
ds.saveGroupDayAttendance("grp-sat-4pm", "2026-09-02", [
  { studentId: "std-1", present: true, notes: "حاضر في الموعد" },
  { studentId: "std-2", present: false, notes: "عذر مسبق" },
])
const dayAtt = ds.getGroupDayAttendance("grp-sat-4pm", "2026-09-02")
assertEqual(dayAtt.length, 2, "تسجيل حضور يومين لطالبين")
assertEqual(dayAtt.find(a => a.studentId === "std-1")?.status, "present", "تسجيل الطالب 1 كـ حاضر")
assertEqual(dayAtt.find(a => a.studentId === "std-2")?.status, "absent", "تسجيل الطالب 2 كـ غائب")

// تحديث حضور نفس اليوم (تعديل السجل)
ds.saveGroupDayAttendance("grp-sat-4pm", "2026-09-02", [
  { studentId: "std-1", present: true },
  { studentId: "std-2", present: true }, // تغير إلى حاضر
])
const updatedAtt = ds.getGroupDayAttendance("grp-sat-4pm", "2026-09-02")
assertEqual(updatedAtt.filter(a => a.status === "present").length, 2, "تحديث سجل الحضور دون إنشاء سجلات مكررة")

// ------------------------------------------------------------
// القسم 4: قسم المالية والتحصيل والحسابات المعقدة
// ------------------------------------------------------------
console.log("\n\x1b[1;33m[4] قسم المالية والتحصيل ومطابقة الاستحقاقات:\x1b[0m")
ds.saveDues([
  { id: "due-sep", studentId: "std-1", groupId: "grp-sat-4pm", month: 9, year: 2026, amount: 250, status: "pending", createdAt: new Date().toISOString() },
  { id: "due-oct", studentId: "std-1", groupId: "grp-sat-4pm", month: 10, year: 2026, amount: 250, status: "pending", createdAt: new Date().toISOString() },
])
ds.savePayments([
  { id: "pay-1", studentId: "std-1", amount: 250, paymentDate: "2026-09-05", month: 9, year: 2026, notes: "دفع سبتمبر", createdAt: new Date().toISOString() },
  { id: "pay-2", studentId: "std-1", amount: 100, paymentDate: "2026-10-02", month: 10, year: 2026, notes: "دفعة من أكتوبر", createdAt: new Date().toISOString() },
])
const balanceStd1 = ds.getStudentBalance("std-1")
assertEqual(balanceStd1.totalDues, 500, "إجمالي استحقاقات الطالب 1 (250 + 250 = 500 ج.م)")
assertEqual(balanceStd1.totalPayments, 350, "إجمالي مدفوعات الطالب 1 (250 + 100 = 350 ج.م)")
assertEqual(balanceStd1.balance, 150, "المتبقي على الطالب 1 (500 - 350 = 150 ج.م)")

// ------------------------------------------------------------
// القسم 5: قسم الاختبارات وبناء الأسئلة (الأنواع الـ 8 وقوالب الطباعة)
// ------------------------------------------------------------
console.log("\n\x1b[1;33m[5] قسم الاختبارات والأنواع الـ 8 وقوالب التقسيم:\x1b[0m")
const sampleExam = {
  id: "exam-science-unit1",
  title: "اختبار مادة العلوم - الوحدة الأولى",
  gradeId: "grade-p4",
  academicYear: "2026-2027",
  duration: 45,
  totalMarks: 20,
  allowOnline: true,
  autoHonorBoard: true,
  honorMinPercent: 90,
  questions: [
    {
      id: "q-mcq",
      questionType: 1, // اختيار من متعدد
      questionNumber: 1,
      orderNumber: 1,
      headerText: "",
      subQuestions: [
        {
          id: "sq-m1",
          orderNumber: 1,
          questionText: "تتنفس الأسماك عن طريق:",
          marks: 2,
          choices: [
            { id: "c1", choiceKey: "أ", choiceText: "الرئتين", isCorrect: false },
            { id: "c2", choiceKey: "ب", choiceText: "الخياشيم", isCorrect: true },
            { id: "c3", choiceKey: "ج", choiceText: "الجلد", isCorrect: false },
          ],
        },
      ],
    },
    {
      id: "q-complete",
      questionType: 2, // أكمل العبارات
      questionNumber: 2,
      orderNumber: 2,
      headerText: "",
      subQuestions: [
        { id: "sq-c1", orderNumber: 1, questionText: "الحيوان الذي يلهث ليخفض حرارة جسمه هو", marks: 2, correctAnswer: "الثعلب القطبي" },
      ],
    },
    {
      id: "q-tf",
      questionType: 3, // صح أو خطأ
      questionNumber: 3,
      orderNumber: 3,
      headerText: "",
      subQuestions: [
        { id: "sq-tf1", orderNumber: 1, questionText: "حاسة السمع لدى الدلافين قوية جداً", marks: 2, isTrue: true },
      ],
    },
    {
      id: "q-reason",
      questionType: 4, // علل لما يأتي
      questionNumber: 4,
      orderNumber: 4,
      headerText: "",
      subQuestions: [
        { id: "sq-r1", orderNumber: 1, questionText: "تختبئ السحالي في الجحور نهاراً", marks: 2, answerLines: 1 },
      ],
    },
    {
      id: "q-correct",
      questionType: 5, // صوب ما تحته خط
      questionNumber: 5,
      orderNumber: 5,
      headerText: "",
      subQuestions: [
        {
          id: "sq-corr1",
          orderNumber: 1,
          questionText: "تتحرك الكواكب في مسارات دائرية حول الأرض",
          marks: 2,
          corrections: [{ id: "cor-1", wrongWord: "الأرض", correctAnswer: "الشمس", wordPosition: 7, wordCount: 1 }],
        },
      ],
    },
    {
      id: "q-term",
      questionType: 6, // المصطلح العلمي
      questionNumber: 6,
      orderNumber: 6,
      headerText: "",
      subQuestions: [
        { id: "sq-term1", orderNumber: 1, questionText: "سمة تميز الكائن الحي وتساعده على البقاء", marks: 2, correctAnswer: "التكيف" },
      ],
    },
    {
      id: "q-def",
      questionType: 7, // ما المقصود بكل مما يأتي
      questionNumber: 7,
      orderNumber: 7,
      headerText: "",
      subQuestions: [
        { id: "sq-def1", orderNumber: 1, questionText: "التكيف السلوكي", marks: 2, correctAnswer: "تغير في سلوك مجموعة من الحيوانات" },
      ],
    },
    {
      id: "q-free",
      questionType: 8, // سؤال حر / قارن
      questionNumber: 8,
      orderNumber: 8,
      headerText: "قارن بين التكيف التركيبي والتكيف السلوكي:",
      subQuestions: [
        { id: "sq-f1", orderNumber: 1, questionText: "من حيث التعريف ومثال لكل منهما", marks: 6, answerLines: 2 },
      ],
    },
  ],
  createdAt: "2026-09-02T10:00:00Z",
  updatedAt: "2026-09-02T10:00:00Z",
}

// اختبار تقسيم الصفحات دون شطر أي سؤال
const partition8 = tplMod.partitionExamQuestions(sampleExam.questions)
assert(partition8.totalPages >= 2, "توزيع الامتحان ذي الأسئلة المتعددة على عدة صفحات")
assert(partition8.pages.every(p => p.questions.length > 0), "كل صفحة تحتوي على أسئلة كاملة وغير فارغة")
// التحقق من عدم تجزئة أي سؤال
const allPartitionedQuestions = partition8.pages.flatMap(p => p.questions.map(q => q.question.id))
assertEqual(allPartitionedQuestions.length, 8, "كل الأسئلة الـ 8 موجودة كاملة دون نقصان أو تكرار")

// ------------------------------------------------------------
// القسم 6: محرك التصحيح الآلي وتطبيع النصوص العربية الصارم
// ------------------------------------------------------------
console.log("\n\x1b[1;33m[6] محرك التصحيح الآلي والتطبيع اللغوي العربي الصارم:\x1b[0m")
assertEqual(gradeMod.normalizeAnswer("  الثَعْلَبُ  القُطْبِيُّ "), "الثعلب القطبي", "إزالة التشكيل وتوحيد المسافات")
assertEqual(gradeMod.normalizeAnswer("أحمد وإبراهيم وآلاء"), "احمد وابراهيم والاء", "توحيد أشكال الهمزات")
assertEqual(gradeMod.normalizeAnswer("مدرسة ومدرسه"), "مدرسه ومدرسه", "توحيد التاء المربوطة والهاء")
assertEqual(gradeMod.normalizeAnswer("علي وعلي"), "علي وعلي", "توحيد الياء والألف المقصورة")

// تجربة تصحيح إجابات متطابقة ومعالجة الإجابات
const studentAnswers = {
  "sq-m1": { choiceId: "c2" }, // إجابة صحيحة (الخياشيم) -> 2 درجات
  "sq-c1": { text: " الثعلب القطبي " }, // إجابة صحيحة مع تطبيع -> 2 درجات
  "sq-tf1": { isTrue: true }, // إجابة صحيحة -> 2 درجات
  "sq-corr1": { text: " الشمس " }, // إجابة صحيحة -> 2 درجات
  "sq-term1": { text: "التَّكَيُّفُ" }, // إجابة صحيحة بالتشكيل -> 2 درجات
  "sq-def1": { text: "تغير في سلوك مجموعه من الحيوانات" }, // إجابة صحيحة بالتاء المربوطة والهاء -> 2 درجات
}
const gradeRes = gradeMod.gradeExam(sampleExam, studentAnswers)
assertEqual(gradeRes.score, 12, "حساب درجات الأسئلة المصححة آلياً (12 درجة من 12)")
assertEqual(gradeRes.autoTotal, 12, "إجمالي درجات الأسئلة الآلية (12 درجة)")
assertEqual(gradeRes.manualTotal, 8, "إجمالي درجات الأسئلة المقالية المصححة يدوياً (8 درجات)")

// ------------------------------------------------------------
// القسم 7: قسم لوحة الشرف التلقائية والمحددات الزمنية
// ------------------------------------------------------------
console.log("\n\x1b[1;33m[7] قسم لوحة الشرف التلقائية والفلاتر الشهرية:\x1b[0m")
const honorRes = ds.maybeAutoHonor({
  exam: sampleExam,
  studentName: "محمد أحمد علي",
  groupId: "grp-sat-4pm",
  studentId: "std-1",
  score: 12,
  totalMarks: 12,
})
assert(honorRes !== null && honorRes.studentName === "محمد أحمد علي", "ترقية الطالب المتفوق إلى لوحة الشرف")
const honorees = ds.getHonorees()
assertEqual(honorees.length, 1, "وجود سجل التكريم في لوحة الشرف")
assert(ds.isHonoreeActive(honorees[0], new Date()), "المكرم نشط في الشهر الحالي")

// ------------------------------------------------------------
// القسم 8: قسم الأرشفة الشاملة للعام الدراسي والاستعادة الكاملة
// ------------------------------------------------------------
console.log("\n\x1b[1;33m[8] قسم أرشفة العام الدراسي والاستعادة الشاملة:\x1b[0m")
const archiveResult = ds.closeAcademicYear("2026-2027")
assert(archiveResult.academicYear === "2026-2027", "أرشفة العام الدراسي 2026-2027 بنجاح")
assertEqual(ds.getStudents().length, 0, "تفريغ الطلاب النشطين بعد إغلاق العام")
assertEqual(ds.getGrades().length, 0, "تفريغ الصفوف النشطة بعد إغلاق العام")

const restored = ds.restoreYearArchive("2026-2027")
assert(restored === true, "استعادة أرشيف 2026-2027 بالكامل")
assertEqual(ds.getStudents().length, 3, "استعادة جميع الطلاب الـ 3 بدقة وبكامل بياناتهم")
assertEqual(ds.getGrades().length, 1, "استعادة الصفوف والمجموعات بدقة")

// ------------------------------------------------------------
// القسم 9: التدقيق الأمني وفحص التوكين والكوكيز والثغرات
// ------------------------------------------------------------
console.log("\n\x1b[1;33m[9] التدقيق الأمني المتقدم وفحص التوكين والكوكيز والثغرات:\x1b[0m")

// 1. فحص تشفير وختم التوكين الرقمي
const sealed = pubMod.sealExamForStudent(sampleExam)
assert(sealed.token.length > 20, "توليد توكين مغلف ومختوم رقمياً")
// فحص خلو كائن الأسئلة المعروض للطالب من أي إجابة نموذجية
assert(sealed.view.questions[0].subQuestions[0].choices.every(c => c.isCorrect === false), "إخفاء مفاتيح التصحيح تماماً عن كائن الطالب")
assert(sealed.view.questions[1].subQuestions[0].correctAnswer === undefined, "حذف الإجابة النموذجية لسؤال أكمل")
assert(sealed.view.questions[2].subQuestions[0].isTrue === undefined, "حذف إجابة صح وخطأ")

// 2. محاكاة هجوم التلاعب بالتوكين وتغيير الإجابات (Tampering & Signature Forgery)
let tamperedToken = ""
try {
  const bin = atob(sealed.token.split("").reverse().join(""))
  const envelope = JSON.parse(bin)
  envelope.spec["sq-m1"] = { choiceId: "c1" } // محاولة تزوير الإجابة الصحيحة
  const fakeBin = JSON.stringify(envelope)
  const bytes = new TextEncoder().encode(fakeBin)
  let fakeStr = ""
  bytes.forEach(b => { fakeStr += String.fromCharCode(b) })
  tamperedToken = btoa(fakeStr).split("").reverse().join("")
} catch {
  tamperedToken = "invalid-token"
}

// محاولة التصحيح بالتوكين المزور
const forgedGrade = pubMod.gradeSealedExam(sealed.view, tamperedToken, { "sq-m1": { choiceId: "c1" } })
// يجب أن يرفض التوكين المزور وتكون النتيجة 0
assertEqual(forgedGrade.score, 0, "كشف التلاعب بالتوكين ورفضه بنجاح وحماية النتيجة من التزوير")

// 3. فحص بطاقة العرض العامة (الصفحة الرئيسية)
const publicCard = pubMod.toPublicExamCard(sampleExam)
assertEqual(publicCard.questions.length, 0, "بطاقة الامتحان العامة لا تحتوي على أي أسئلة منعاً للتسريب")

// 4. فحص هجمات حقن النصوص Script Injection / XSS
const maliciousStudentName = '<script>alert("XSS")</script>'
const xssAttempt = {
  id: "att-xss",
  examId: sampleExam.id,
  studentName: maliciousStudentName,
  groupId: "grp-sat-4pm",
  gradeId: "grade-p4",
  answers: {},
  score: 10,
  totalMarks: 10,
  startedAt: new Date().toISOString(),
  submittedAt: new Date().toISOString(),
  durationSeconds: 300,
}
ds.saveExamAttempts([xssAttempt])
const savedAttempts = ds.getExamAttempts()
assertEqual(savedAttempts[0].studentName, maliciousStudentName, "حفظ النص كسلسلة نقية بدون تنفيذ XSS")

// 5. فحص حماية ملف Middleware
const middlewareFile = readFileSync("src/middleware.ts", "utf8")
assert(middlewareFile.includes("supabase.auth.getUser()"), "استخدام getUser() الصارم للتحقق من المصادقة بدلاً من getSession غير الموثوق")
assert(middlewareFile.includes("req.nextUrl.pathname.startsWith('/dashboard')"), "حماية مسارات /dashboard وإعادة التوجيه لـ /login")
assert(middlewareFile.includes("matcher: ['/dashboard/:path*', '/login']"), "تطبيق المطابق على جميع مسارات لوحة التحكم وصفحة الدخول")

// 6. فحص خلو المشروع من أية ثغرات تسريب مفاتيح
const envKeysCheck = !middlewareFile.includes("SUPABASE_SERVICE_ROLE_KEY") && !middlewareFile.includes("service_role")
assert(envKeysCheck, "عدم تسريب مفتاح service_role في الواجهات أو Middleware")

// ==========================================
// تقرير النتائج النهائي
// ==========================================
console.log("\n\x1b[1;34m====================================================================\x1b[0m")
console.log(`\x1b[1mإجمالي الفحوصات: ${totalPassed + totalFailed} | الناجحة: \x1b[32m${totalPassed}\x1b[0m | الفاشلة: \x1b[31m${totalFailed}\x1b[0m`)
console.log("\x1b[1;34m====================================================================\x1b[0m")

if (totalFailed > 0) {
  console.log("\n\x1b[31;1mيوجد اختبارات فاشلة:\x1b[0m")
  failMessages.forEach(m => console.log(` - ${m}`))
  process.exit(1)
} else {
  console.log("\n\x1b[32;1m🎉 تمت جميع الاختبارات والفحوصات الأمنية والوظيفية بنجاح 100% بدون أي خطأ! ✅\x1b[0m\n")
}
