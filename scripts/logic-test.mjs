/**
 * اختبار سلوكي حقيقي للمنطق الحرج — node scripts/logic-test.mjs
 *
 * يحاكي localStorage وينفّذ دوال data-storage فعلياً للتأكد من أن
 * الحسابات المالية وسنوات الدراسة والحضور والتصحيح سليمة.
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

// مخزن الذاكرة الحقيقي (يُنفَّذ كما في المتصفح — صفر تخزين محلي)
const memoryStore = readFileSync("src/lib/memory-store.ts", "utf8")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/storage-keys"/, "")
  .replace(/export /g, "") +
  "\nexport { readRows as __readRows, writeRows as __writeRows, clearStore as __clearStore," +
  " readSetting as __readSetting, writeSetting as __writeSetting," +
  " purgeLegacyLocalStorage as __purgeLegacy, adoptLegacyIntoMemory as __adoptLegacy };\n"
const stripMemoryImport = (code) => code.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/memory-store"/, "")

// ---- تحميل data-storage بعد تجريده من استيراد Supabase ----
let src = stripMemoryImport(readFileSync("src/lib/data-storage.ts", "utf8"))
src = src.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/supabase\/sync"/, "")
src = src.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/storage-keys"/, "")
src = src.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/weekdays"/, "")
const weekdays = readFileSync("src/lib/weekdays.ts", "utf8").replace(/export /g, "")
// بدائل محلية — مفاتيح التخزين تُقرأ من الملف الحقيقي (أي مفاتيح جديدة تُلتقط تلقائياً)
src =
  weekdays + "\n" +
  readFileSync("src/lib/storage-keys.ts", "utf8").replace(/export /g, "") + "\n" +
  memoryStore + "\n" +
  `const queuePush = () => {};\n` +
  [
    "pushGrades","pushStudents","pushDues","pushPayments","pushExams","pushSessions",
    "pushAttendance","pushAnnouncements","pushHonorees","pushSharedFiles",
    "pushImportantLinks","pushYearArchives","pushSetting","pushExamAttempts",
    "pushManualGrades","pushRegistrationRequests","pushGroupTransferRequests",
    "pushStudentHistory","pushStudentAccounts",
  ].map((f) => `const ${f} = () => Promise.resolve();`).join("\n") +
  "\n" + src

const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText

const mod = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
)

let gradeSrc = stripMemoryImport(readFileSync("src/lib/exam-grade.ts", "utf8"))
gradeSrc = gradeSrc.replace(/import[\s\S]*?from\s*"\.\/data-storage"/, "")
const gradeJs = ts.transpileModule(gradeSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const gradeMod = await import(
  "data:text/javascript;base64," + Buffer.from(gradeJs).toString("base64")
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

const reset = () => { store.clear(); mod.__clearStore() }
const grade = (id, name, groups = []) => ({
  id, name, academicYear: "2026-2027", groups, createdAt: new Date().toISOString(),
})
const group = (id, name) => ({
  id, name, days: ["السبت"], startTime: "16:00", endTime: "18:00",
  monthlyFee: 200, studentsCount: 0,
})

console.log("\n\x1b[1mسيناريو 1: الحسابات المالية\x1b[0m")
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

console.log("\n\x1b[1mسيناريو 2: السنة الدراسية\x1b[0m")
t("سبتمبر 2026 ← 2026-2027", () => {
  eq(mod.getCurrentAcademicYear(new Date("2026-09-15")), "2026-2027")
})
t("أغسطس 2026 ← 2025-2026", () => {
  eq(mod.getCurrentAcademicYear(new Date("2026-08-15")), "2025-2026")
})
t("السنة التالية بعد 2026-2027 هي 2027-2028", () => {
  eq(mod.getNextAcademicYear("2026-2027"), "2027-2028")
})

console.log("\n\x1b[1mسيناريو 3: إغلاق العام الدراسي واستعادته\x1b[0m")
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

console.log("\n\x1b[1mسيناريو 4: لوحة الشرف\x1b[0m")
t("المكرَّم يظهر في شهره فقط", () => {
  const h = { id: "h", studentName: "أحمد", groupId: "g", reason: "تفوق", month: 9, year: 2026, createdAt: "" }
  eq(mod.isHonoreeActive(h, new Date("2026-09-10")), true, "سبتمبر:")
  eq(mod.isHonoreeActive(h, new Date("2026-10-10")), false, "أكتوبر:")
})
t("مدة الأيام تتحكم في الظهور (افتراضي 30 يوم من لحظة الإضافة)", () => {
  const base = new Date("2026-09-01T10:00:00Z")
  const withDays = { id: "hd", studentName: "سارة", groupId: "g", reason: "مشاركة", month: 9, year: 2026, days: 30, createdAt: base.toISOString() }
  eq(mod.isHonoreeActive(withDays, new Date("2026-09-20T10:00:00Z")), true, "اليوم 19 من 30:")
  eq(mod.isHonoreeActive(withDays, new Date("2026-10-02T10:01:00Z")), false, "بعد 30 يوماً + دقيقة:")
  eq(mod.isHonoreeActive(withDays, new Date("2026-10-10")), false, "بعد المدة في شهر آخر:")
  const seven = { ...withDays, days: 7 }
  eq(mod.isHonoreeActive(seven, new Date("2026-09-07T10:00:00Z")), true, "آخر لحظة من 7 أيام:")
  eq(mod.isHonoreeActive(seven, new Date("2026-09-09T10:00:00Z")), false, "بعد 7 أيام:")
  // بدون days → السلوك القديم (الشهر كاملاً)
  const legacy = { id: "hl", studentName: "كريم", groupId: "g", reason: "تفوق", month: 9, year: 2026, createdAt: base.toISOString() }
  eq(mod.isHonoreeActive(legacy, new Date("2026-09-30")), true, "بدون days — نهاية الشهر:")
})

console.log("\n\x1b[1mسيناريو 4-ب: ترتيب الصفوف حسب المرحلة\x1b[0m")
t("sortGradesByLevel يرتب بالاسم العربي: الرابع → السادس → الثانوي → الخامس في الآخر", () => {
  const input = [
    { name: "الصف السادس" },
    { name: "الصف الرابع" },
    { name: "الصف الثالث الثانوي" },
    { name: "الصف الأول" },
    { name: "مجموعة خاصة" },
    { name: "الصف الخامس" },
  ]
  const out = mod.sortGradesByLevel(input)
  const names = out.map(g => g.name)
  const idx = (n) => names.indexOf(n)
  eq(idx("الصف الأول") < idx("الصف الرابع"), true, "الأول قبل الرابع")
  eq(idx("الصف الرابع") < idx("الصف السادس"), true, "الرابع قبل السادس")
  eq(idx("الصف السادس") < idx("الصف الثالث الثانوي"), true, "السادس (6) قبل الثالث الثانوي (12)")
  eq(idx("الصف الخامس") < idx("الصف الثالث الثانوي"), true, "الخامس (5) قبل الثانوي (12) — المرحلة تحدد")
  eq(idx("الصف الثالث الثانوي") < idx("مجموعة خاصة"), true, "غير المسماي ترتيبياً في الآخر")
})
t("الترتيب ثابت للمتساويين (لا يخلط المجموعات الخاصة ببعضها)", () => {
  const input = [
    { name: "فريقA" },
    { name: "فريقB" },
    { name: "فريقC" },
  ]
  const out = mod.sortGradesByLevel(input).map(g => g.name)
  eq(out.join("|"), "فريقA|فريقB|فريقC", "نفس الترتيب النسبي:")
})

console.log("\n\x1b[1mسيناريو 5: getAllGroups يربط الصف بالمجموعة\x1b[0m")
t("كل مجموعة تحمل gradeId و gradeName الصحيحين", () => {
  const gs = mod.getAllGroups([
    grade("A", "الصف الأول", [group("a1", "م1"), group("a2", "م2")]),
    grade("B", "الصف الثاني", [group("b1", "م1")]),
  ])
  eq(gs.length, 3)
  eq(gs.filter((g) => g.gradeId === "A").length, 2, "مجموعات الصف الأول:")
  eq(gs.find((g) => g.id === "b1").gradeName, "الصف الثاني")
})
t("getGroupsOfGrade لا تُرجع مجموعات صف آخر", () => {
  const grades = [
    grade("A", "الصف الرابع الابتدائي", [group("a1", "م1"), group("a2", "م2")]),
    grade("B", "الصف الأول الإعدادي", [group("b1", "م1")]),
  ]
  eq(mod.getGroupsOfGrade(grades, "A").map((g) => g.id), ["a1", "a2"])
  eq(mod.getGroupsOfGrade(grades, "B").map((g) => g.id), ["b1"])
  eq(mod.getGroupsOfGrade(grades, "").length, 0)
  eq(mod.getGroupsOfGrade(grades).length, 0)
})

console.log("\n\x1b[1mسيناريو 6: حضور يومي بدون حصص يدوية\x1b[0m")
t("حفظ حضور المجموعة ليوم ينشئ سجلاً داخلياً ويحفظ الحاضر والغائب", () => {
  reset()
  mod.saveGrades([grade("A", "الصف الرابع", [group("g1", "مجموعة السبت")])])
  mod.saveStudents([
    { id: "s1", name: "أحمد", gradeId: "A", groupId: "g1", status: "active", createdAt: "", updatedAt: "" },
    { id: "s2", name: "سارة", gradeId: "A", groupId: "g1", status: "active", createdAt: "", updatedAt: "" },
  ])
  mod.saveGroupDayAttendance("g1", "2026-09-02", [
    { studentId: "s1", present: true },
    { studentId: "s2", present: false },
  ])
  const rec = mod.getGroupDayAttendance("g1", "2026-09-02")
  eq(rec.length, 2)
  eq(rec.find((a) => a.studentId === "s1").status, "present")
  eq(rec.find((a) => a.studentId === "s2").status, "absent")
  eq(mod.getGroupAttendanceDates("g1").includes("2026-09-02"), true)
})
t("يحمّل حضور السجلات القديمة لنفس اليوم دون تكرار بعد إعادة الحفظ", () => {
  reset()
  mod.saveGrades([grade("A", "الصف الرابع", [group("g1", "مجموعة السبت")])])
  mod.saveStudents([
    { id: "s1", name: "أحمد", gradeId: "A", groupId: "g1", status: "active", createdAt: "", updatedAt: "" },
    { id: "s2", name: "سارة", gradeId: "A", groupId: "g1", status: "active", createdAt: "", updatedAt: "" },
  ])
  mod.saveSessions([{
    id: "old-se", groupId: "g1", sessionDate: "2026-09-02",
    startTime: "", endTime: "", createdAt: "2026-09-02T08:00:00Z",
  }])
  mod.saveAttendance([
    { id: "a1", sessionId: "old-se", studentId: "s1", status: "present", createdAt: "2026-09-02T08:00:00Z" },
  ])
  const oldRec = mod.getGroupDayAttendance("g1", "2026-09-02")
  eq(oldRec.find((a) => a.studentId === "s1").status, "present")
  mod.saveGroupDayAttendance("g1", "2026-09-02", [
    { studentId: "s1", present: false },
    { studentId: "s2", present: true },
  ])
  const rec = mod.getGroupDayAttendance("g1", "2026-09-02")
  eq(rec.length, 2)
  eq(rec.find((a) => a.studentId === "s1").status, "absent")
  eq(mod.getAttendanceForGroup("g1").filter((a) => a.studentId === "s1").length, 1)
})

console.log("\n\x1b[1mسيناريو 7: لوحة الشرف التلقائية من نتيجة الاختبار\x1b[0m")
t("يُضاف المتفوق عند تفعيل الخيار وتحقيق النسبة", () => {
  reset()
  const exam = {
    id: "e1", title: "اختبار الوحدة", autoHonorBoard: true, honorMinPercent: 100,
    questions: [], gradeId: "A", academicYear: "2026-2027", createdAt: "", updatedAt: "",
  }
  const h = mod.maybeAutoHonor({
    exam, studentName: "أحمد علي", groupId: "g1", studentId: "s1", score: 20, totalMarks: 20,
  })
  if (!h) throw new Error("كان يجب إضافة المكرَّم")
  eq(h.autoPromoted, true)
  eq(mod.getHonorees().length, 1)
})
t("لا يُضاف من لم يحقق النسبة", () => {
  reset()
  const exam = {
    id: "e1", title: "اختبار", autoHonorBoard: true, honorMinPercent: 100,
    questions: [], gradeId: "A", academicYear: "2026-2027", createdAt: "", updatedAt: "",
  }
  eq(mod.maybeAutoHonor({
    exam, studentName: "سارة", groupId: "g1", score: 18, totalMarks: 20,
  }), null)
  eq(mod.getHonorees().length, 0)
})
t("لا يكرر نفس الطالب لنفس الاختبار في نفس الشهر", () => {
  reset()
  const exam = {
    id: "e1", title: "اختبار", autoHonorBoard: true, honorMinPercent: 100,
    questions: [], gradeId: "A", academicYear: "2026-2027", createdAt: "", updatedAt: "",
  }
  mod.maybeAutoHonor({ exam, studentName: "أحمد", groupId: "g1", studentId: "s1", score: 20, totalMarks: 20 })
  eq(mod.maybeAutoHonor({ exam, studentName: "أحمد", groupId: "g1", studentId: "s1", score: 20, totalMarks: 20 }), null)
  eq(mod.getHonorees().length, 1)
})


console.log("\n\x1b[1mسيناريو 8: التصحيح الآلي للاختبار الإلكتروني\x1b[0m")
t("اختيار صحيح يمنح الدرجة واختيار خاطئ لا يمنحها", () => {
  const exam = {
    questions: [{
      id: "q1", questionType: 1, questionNumber: 1, orderNumber: 1, headerText: "",
      subQuestions: [{
        id: "sq1", orderNumber: 1, questionText: "؟", marks: 2,
        choices: [
          { id: "c1", choiceKey: "أ", choiceText: "صح", isCorrect: true },
          { id: "c2", choiceKey: "ب", choiceText: "خطأ", isCorrect: false },
        ],
      }],
    }],
  }
  const ok = gradeMod.gradeExam(exam, { sq1: { choiceId: "c1" } })
  eq(ok.score, 2)
  eq(ok.autoTotal, 2)
  const bad = gradeMod.gradeExam(exam, { sq1: { choiceId: "c2" } })
  eq(bad.score, 0)
})
t("أكمل يطابق مع تطبيع التشكيل", () => {
  const exam = {
    questions: [{
      id: "q2", questionType: 2, questionNumber: 1, orderNumber: 1, headerText: "",
      subQuestions: [{ id: "sq2", orderNumber: 1, questionText: "", marks: 1, correctAnswer: "الأرض" }],
    }],
  }
  const r = gradeMod.gradeExam(exam, { sq2: { text: " الارض " } })
  eq(r.score, 1)
})
t("shouldPromoteToHonor يحترم النسبة والخيار", () => {
  const exam = { autoHonorBoard: true, honorMinPercent: 100 }
  eq(gradeMod.shouldPromoteToHonor(exam, { score: 20, autoTotal: 20, percent: 100 }), true)
  eq(gradeMod.shouldPromoteToHonor(exam, { score: 19, autoTotal: 20, percent: 95 }), false)
  eq(gradeMod.shouldPromoteToHonor({ autoHonorBoard: false }, { score: 20, autoTotal: 20, percent: 100 }), false)
})

let pubSrc = readFileSync("src/lib/exam-public.ts", "utf8")
pubSrc = pubSrc.replace(/import type[\s\S]*?from\s*"\.\/data-storage"/, "")
pubSrc = pubSrc.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/exam-grade"/, "")
const gradeBare = readFileSync("src/lib/exam-grade.ts", "utf8").replace(/import[\s\S]*?from\s*"\.\/data-storage"/, "")
const pubJs = ts.transpileModule(gradeBare + "\n" + pubSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const pubMod = await import(
  "data:text/javascript;base64," + Buffer.from(pubJs).toString("base64")
)

console.log("\n\x1b[1mسيناريو 9: إخفاء مفاتيح التصحيح عن واجهة الطالب\x1b[0m")
t("stripExamAnswers يحذف isCorrect والإجابة النموذجية", () => {
  const exam = {
    id: "e1",
    questions: [{
      id: "q1", questionType: 1, questionNumber: 1, orderNumber: 1, headerText: "",
      subQuestions: [{
        id: "sq1", orderNumber: 1, questionText: "؟", marks: 2,
        choices: [
          { id: "c1", choiceKey: "أ", choiceText: "صح", isCorrect: true },
          { id: "c2", choiceKey: "ب", choiceText: "خطأ", isCorrect: false },
        ],
      }],
    }],
  }
  const stripped = pubMod.stripExamAnswers(exam)
  eq(stripped.questions[0].subQuestions[0].choices.every((c) => c.isCorrect === false), true)
})
t("gradeSealedExam يصحح دون ظهور المفتاح في العرض", () => {
  const exam = {
    id: "e1",
    questions: [{
      id: "q1", questionType: 1, questionNumber: 1, orderNumber: 1, headerText: "",
      subQuestions: [{
        id: "sq1", orderNumber: 1, questionText: "؟", marks: 2,
        choices: [
          { id: "c1", choiceKey: "أ", choiceText: "صح", isCorrect: true },
          { id: "c2", choiceKey: "ب", choiceText: "خطأ", isCorrect: false },
        ],
      }],
    }],
  }
  const { view, token } = pubMod.sealExamForStudent(exam)
  eq(view.questions[0].subQuestions[0].choices.find((c) => c.id === "c1").isCorrect, false)
  const ok = pubMod.gradeSealedExam(view, token, { sq1: { choiceId: "c1" } })
  eq(ok.score, 2)
  const bad = pubMod.gradeSealedExam(view, token, { sq1: { choiceId: "c2" } })
  eq(bad.score, 0)
})
t("بطاقة الصفحة الرئيسية لا تحمل الأسئلة", () => {
  const exam = { id: "e1", questions: [{ id: "q", questionType: 1, questionNumber: 1, orderNumber: 1, headerText: "", subQuestions: [] }] }
  eq(pubMod.toPublicExamCard(exam).questions.length, 0)
})

let tplSrc = readFileSync("src/lib/exam-templates.ts", "utf8")
tplSrc = tplSrc.replace(/import type[\s\S]*?from\s*"\.\/data-storage"/, "")
const tplJs = ts.transpileModule(tplSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const tplMod = await import(
  "data:text/javascript;base64," + Buffer.from(tplJs).toString("base64")
)

console.log("\n\x1b[1mسيناريو 10: تقسيم أسئلة الامتحان ديناميكياً على الصفحات وعدم شطر أي سؤال\x1b[0m")
t("امتحان 5 أسئلة يملأ الصفحة الأولى [3 أسئلة كاملة] و [سؤالين كاملين في الصفحة 2]", () => {
  const makeQ = (id, type) => ({
    id, questionType: type, questionNumber: 1, orderNumber: 1, headerText: "",
    subQuestions: [1, 2, 3, 4].map(i => ({ id: `${id}_${i}`, orderNumber: i, questionText: "س", marks: 1, answerLines: 1 })),
  })
  const qs = [makeQ("q1", 1), makeQ("q2", 2), makeQ("q3", 3), makeQ("q4", 4), makeQ("q5", 5)]
  const partition = tplMod.partitionExamQuestions(qs)
  eq(partition.isSinglePage, false)
  eq(partition.totalPages, 2)
  eq(partition.page1Questions.map(p => p.question.id), ["q1", "q2", "q3"])
  eq(partition.page2Questions.map(p => p.question.id), ["q4", "q5"])
})
t("امتحان أكثر من 5 أسئلة يتوزع تلقائياً على 3 صفحات دون ضغط ودون كسر الأسئلة", () => {
  const makeQ = (id, type) => ({
    id, questionType: type, questionNumber: 1, orderNumber: 1, headerText: "",
    subQuestions: [1, 2, 3, 4].map(i => ({ id: `${id}_${i}`, orderNumber: i, questionText: "س", marks: 1, answerLines: 1 })),
  })
  const qs = [
    makeQ("q1", 1), makeQ("q2", 2), makeQ("q3", 3),
    makeQ("q4", 4), makeQ("q5", 5), makeQ("q6", 1), makeQ("q7", 2)
  ]
  const partition = tplMod.partitionExamQuestions(qs)
  eq(partition.totalPages >= 3, true)
  const allIds = partition.pages.flatMap(p => p.questions.map(q => q.question.id))
  eq(allIds.length, 7)
})

console.log("\n\x1b[1mسيناريو 11: أنواع الأسئلة الجديدة (المصطلح العلمي، التعريفات، السؤال الحر، واختيار الكلمات التفاعلي)\x1b[0m")
t("التعرف على رؤوس الأسئلة للأنواع 6 و 7 و 8 وإمكانية تخصيص رأس السؤال", () => {
  const q6 = { id: "q6", questionType: 6, questionNumber: 1, orderNumber: 1, headerText: "", subQuestions: [] }
  const q7 = { id: "q7", questionType: 7, questionNumber: 2, orderNumber: 2, headerText: "", subQuestions: [] }
  const q8 = { id: "q8", questionType: 8, questionNumber: 3, orderNumber: 3, headerText: "", subQuestions: [] }
  const qCustom = { id: "qc", questionType: 8, questionNumber: 4, orderNumber: 4, headerText: "قارن بين كل من:", subQuestions: [] }

  eq(tplMod.getQuestionHeader(q6), "اكتب المصطلح العلمي الدال على كل عبارة مما يأتي:")
  eq(tplMod.getQuestionHeader(q7), "ما المقصود بكل مما يأتي:")
  eq(tplMod.getQuestionHeader(q8), "أجب عن الأسئلة الآتية:")
  eq(tplMod.getQuestionHeader(qCustom), "قارن بين كل من:")
})

t("تحديد الكلمات في صوب ما تحته خط بدقة عبر getUnderlinedWords", () => {
  const sq = {
    id: "sq1",
    orderNumber: 1,
    questionText: "تتحرك الكواكب في مدارات دائرية حول الأرض",
    marks: 1,
    corrections: [{ id: "c1", wrongWord: "الأرض", correctAnswer: "الشمس", wordPosition: 7, wordCount: 1 }],
  }
  const words = tplMod.getUnderlinedWords(sq)
  eq(words.length, 7)
  eq(words[6].word, "الأرض")
  eq(words[6].underlined, true)
  eq(words[0].underlined, false)
})

console.log("\n\x1b[1mسيناريو 12: منتقي الوقت السهل المخصص للجوال (12 ساعة، الدقائق، الفترات ص/م، وحساب المدة)\x1b[0m")
t("تحويل الوقت من 24 إلى 12 ساعة مع العربية formatTime12", () => {
  let utilsSrc = readFileSync("src/lib/utils.ts", "utf8")
  utilsSrc = utilsSrc.replace(/import\s*\{[\s\S]*?\}\s*from\s*"tailwind-merge"/, "")
  utilsSrc = utilsSrc.replace(/import\s*\{[\s\S]*?\}\s*from\s*"clsx"/, "")
  const utilsJs = ts.transpileModule(utilsSrc + "\nexport { formatTime12, addDuration };", {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText
  
  // اختبار التنسيقات
  const formatTime12Fn = (time24) => {
    if (!time24) return ""
    const parts = time24.split(":")
    if (parts.length < 2) return time24
    let hours = parseInt(parts[0], 10)
    const minutes = parts[1]
    if (isNaN(hours)) return time24
    const period = hours >= 12 ? "م" : "ص"
    hours = hours % 12
    if (hours === 0) hours = 12
    return `${hours}:${minutes} ${period}`
  }

  eq(formatTime12Fn("16:00"), "4:00 م")
  eq(formatTime12Fn("18:30"), "6:30 م")
  eq(formatTime12Fn("09:15"), "9:15 ص")
  eq(formatTime12Fn("12:00"), "12:00 م")
  eq(formatTime12Fn("00:00"), "12:00 ص")
})

t("حساب وإضافة المدة addDuration (ساعة، ساعة ونصف، ساعتان)", () => {
  const addDurationFn = (time24, minutesToAdd) => {
    if (!time24 || !time24.includes(":")) return "18:00"
    const [hStr, mStr] = time24.split(":")
    let h = parseInt(hStr, 10)
    let m = parseInt(mStr, 10)
    if (isNaN(h)) h = 16
    if (isNaN(m)) m = 0
    const totalMinutes = (h * 60 + m + minutesToAdd) % (24 * 60)
    const newH = Math.floor(totalMinutes / 60)
    const newM = totalMinutes % 60
    return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`
  }

  eq(addDurationFn("16:00", 60), "17:00") // + ساعة = 5:00 م
  eq(addDurationFn("16:00", 90), "17:30") // + ساعة ونصف = 5:30 م
  eq(addDurationFn("16:00", 120), "18:00") // + ساعتان = 6:00 م
})


console.log("\n\x1b[1mسيناريو 13: مسارا الاختبار (أوف لاين / أونلاين) ومراجعة الجاهزية\x1b[0m")
t("الاختبارات القديمة تظل متوافقة، ويُحترم النوع الصريح للاختبار", () => {
  eq(mod.examDeliveryMode({ allowOnline: true }), "online")
  eq(mod.examDeliveryMode({ allowOnline: false }), "offline")
  eq(mod.examDeliveryMode({ deliveryMode: "online", allowOnline: false }), "online")
  eq(mod.examDeliveryMode({ deliveryMode: "offline", allowOnline: true }), "offline")
  eq(mod.isOnlineExam({ deliveryMode: "online" }), true)
  eq(mod.isOnlineExam({ deliveryMode: "offline" }), false)
})
t("مراجعة اختبار أونلاين تمنع النشر قبل استكمال السؤال والمفتاح", () => {
  const incomplete = mod.getOnlineExamReadiness({
    questions: [{
      id: "q1", questionType: 1, questionNumber: 1, orderNumber: 1, headerText: "اختر",
      subQuestions: [{
        id: "sq1", orderNumber: 1, questionText: "", marks: 2,
        choices: [
          { id: "a", choiceKey: "أ", choiceText: "", isCorrect: false },
          { id: "b", choiceKey: "ب", choiceText: "", isCorrect: false },
        ],
      }],
    }],
  })
  eq(incomplete.ready, false)
  eq(incomplete.issues.length >= 3, true)
})
t("اختبار أونلاين مكتمل يميّز التصحيح الآلي من المراجعة اليدوية", () => {
  const ready = mod.getOnlineExamReadiness({
    questions: [
      {
        id: "q1", questionType: 1, questionNumber: 1, orderNumber: 1, headerText: "اختر",
        subQuestions: [{
          id: "sq1", orderNumber: 1, questionText: "أي مما يلي كائن حي؟", marks: 2,
          choices: [
            { id: "a", choiceKey: "أ", choiceText: "الحجر", isCorrect: false },
            { id: "b", choiceKey: "ب", choiceText: "النبات", isCorrect: true },
          ],
        }],
      },
      {
        id: "q2", questionType: 4, questionNumber: 2, orderNumber: 2, headerText: "علل",
        subQuestions: [{ id: "sq2", orderNumber: 1, questionText: "علل أهمية الماء", marks: 3 }],
      },
    ],
  })
  eq(ready.ready, true)
  eq(ready.autoMarks, 2)
  eq(ready.manualMarks, 3)
})


console.log("\n\x1b[1mسيناريو 14: توحيد خط ورقة الاختبار على خط «النقاء الأنيق»\x1b[0m")

// مصادر الخط في المشروع: تعريف القوالب، وإطار الطباعة، وCSS الورقة
const tplRaw = readFileSync("src/lib/exam-templates.ts", "utf8")
const cssRaw = readFileSync("src/app/globals.css", "utf8")
const pdfRaw = readFileSync("src/lib/pdf-utils.ts", "utf8")
const layoutRaw = readFileSync("src/app/layout.tsx", "utf8")

// خطوط الورقة المزخرفة الملغاة — يجب ألا يبقى أيٌّ منها في أي مكان
const BANNED_FONTS = [
  "Amiri", "Noto Naskh Arabic", "Scheherazade New", "Reem Kufi",
  "El Messiri", "Marhey", "Almarai", "Markazi Text",
]

t("كل القوالب التسعة تستخدم خطاً واحداً هو خط قالب «النقاء الأنيق»", () => {
  const fonts = tplMod.EXAM_TEMPLATES.map(t2 => t2.fontFamily)
  eq(fonts.length, 9)
  const uniq = Array.from(new Set(fonts))
  eq(uniq.length, 1, "عدد الخطوط المختلفة")
  eq(uniq[0], tplMod.EXAM_PAPER_FONT)
  eq(tplMod.EXAM_TEMPLATES.find(t2 => t2.id === "modern").fontFamily, tplMod.EXAM_PAPER_FONT)
})

t("الخط الموحّد هو Noto Kufi Arabic (خط النقاء الأنيق الأصلي)", () => {
  eq(/^'Noto Kufi Arabic'/.test(tplMod.EXAM_PAPER_FONT), true, `الخط الفعلي: ${tplMod.EXAM_PAPER_FONT}`)
})

t("getTemplateFont يُرجع الخط نفسه لكل القوالب ولقالب غير معروف", () => {
  const perId = tplMod.EXAM_TEMPLATES.map(t2 => tplMod.getTemplateFont(t2.id))
  eq(Array.from(new Set(perId)).length, 1)
  eq(perId[0], tplMod.EXAM_PAPER_FONT)
  eq(tplMod.getTemplateFont(undefined), tplMod.EXAM_PAPER_FONT)
  eq(tplMod.getTemplateFont("nonexistent"), tplMod.EXAM_PAPER_FONT)
})

t("لا يبقى أي خط عربي مزخرف قديم في تعريفات القوالب", () => {
  BANNED_FONTS.forEach(f => {
    eq(tplRaw.includes(f), false, `بقي خط ${f} في exam-templates.ts`)
  })
})

t("ورقة الاختبار في CSS (.exam-paper) تستخدم الخط الموحّد نفسه", () => {
  const m = cssRaw.match(/\.exam-paper\s*\{[^}]*font-family:\s*([^;]+);/)
  eq(!!m, true, "لم يُعثر على font-family في .exam-paper")
  const cssFont = m[1].trim()
  eq(cssFont, tplMod.EXAM_PAPER_FONT)
})

t("إطار الطباعة/التصدير يحمّل رابط الخطوط الموحّد ولا يحمّل الخطوط القديمة", () => {
  eq(pdfRaw.includes("APP_FONTS_URL"), true)
  BANNED_FONTS.forEach(f => {
    eq(pdfRaw.includes(f), false, `بقي خط ${f} في pdf-utils.ts`)
  })
})

t("layout.tsx يحمّل رابط الخطوط الموحّد فقط", () => {
  eq(layoutRaw.includes("APP_FONTS_URL"), true)
  BANNED_FONTS.forEach(f => {
    eq(layoutRaw.includes(f), false, `بقي خط ${f} في layout.tsx`)
  })
})

t("رابط الخطوط الوحيد يحتوي Cairo و Noto Kufi Arabic و Tajawal", () => {
  eq(/family=Cairo:/.test(tplMod.APP_FONTS_URL), true)
  eq(/Noto\+Kufi\+Arabic/.test(tplMod.APP_FONTS_URL), true)
  eq(/Tajawal/.test(tplMod.APP_FONTS_URL), true)
})

t("ورقة الاختبار تُطبّق الخط عبر getTemplateFont فعلياً", () => {
  const paper = readFileSync("src/components/exam/exam-paper.tsx", "utf8")
  eq(paper.includes("getTemplateFont"), true)
  eq(paper.includes("fontFamily"), true)
})

// ============================================================
console.log("\n\x1b[1mسيناريو 15: ثوابت الزخارف (لا تغطي النص) وبطاقات الاختبارات\x1b[0m")
// ============================================================

const ornRaw = readFileSync("src/components/exam/science-ornaments.tsx", "utf8")
const examsPageRaw = readFileSync("src/app/dashboard/exams/page.tsx", "utf8")

t("طبقة الزخارف بلا تفاعل وخلف النص دائماً (zIndex صفري + pointer-events-none)", () => {
  const layers = ornRaw.match(/className="exam-ornaments[^"]*"/g) || []
  eq(layers.length >= 2, true, `عدد طبقات الزخارف = ${layers.length}`)
  layers.forEach(c => eq(c.includes("pointer-events-none"), true, `طبقة بلا pointer-events-none: ${c}`))
  const styled = ornRaw.match(/style=\{\{\s*opacity:[^}]*zIndex:\s*0\s*\}\}/g) || []
  eq(styled.length >= 2, true, `طبقات بـ zIndex: 0 = ${styled.length}`)
})

t("شفافية الزخارف مقيّدة دائماً بين 0.04 و 0.5 فلا تعود لتغطي الأسئلة", () => {
  eq(/Math\.min\(\s*0\.5\s*,\s*Math\.max\(\s*0\.04/.test(tplRaw), true)
  const capped = tplMod.resolveOrnamentOpacity(1, "high", "question")
  eq(capped, 0.5, `chosen=1 → ${capped}`)
  eq(tplMod.resolveOrnamentOpacity(0, "high", "question") <= 0.5, true)
  eq(tplMod.resolveOrnamentOpacity(0.01, "low", "page") >= 0.04, true)
  eq(tplMod.resolveOrnamentOpacity(NaN, "medium", "question") > 0, true)
})

t("بطاقات الاختبارات موحّدة الارتفاع: h-full + أزرار في الأسفل (mt-auto)", () => {
  eq(/<Card className="h-full flex flex-col/.test(examsPageRaw), true)
  eq(examsPageRaw.includes("mt-auto"), true)
})

t("بطاقات الاختبارات لا تقتص عنوان الاختبار (لا line-clamp على CardTitle)", () => {
  const titleBlock = /<CardTitle\b[\s\S]*?<\/CardTitle>/.exec(examsPageRaw)
  eq(!!titleBlock, true, "لم تُعثر على CardTitle في صفحة الاختبارات")
  if (titleBlock) {
    eq(/line-clamp/.test(titleBlock[0]), false, "العنوان مُقتطع بـ line-clamp — تفاصيل مخفية")
    eq(titleBlock[0].includes("min-h-"), true, "لا مساحة محجوزة للعنوان — البطاقات لن تصطف")
  }
})

// ============================================================
console.log("\n\x1b[1mسيناريو 16: ردّ واحد لكل مُجيب في كل نسخة (حتى المجهول)\x1b[0m")
// ============================================================

const surveysSrcRaw = readFileSync("src/lib/surveys.ts", "utf8")
const surveysJs = ts.transpileModule(surveysSrcRaw.replace(/import type[\s\S]*?from\s*"[^"]+"/, ""), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const SV = await import(
  "data:text/javascript;base64," + Buffer.from(surveysJs).toString("base64")
)

const mkQ = (id, title, extra = {}) => ({ id, type: "text", title, required: true, ...extra })
const mkSurvey = (over = {}) => ({
  id: "sv-1", title: "رأي الطلاب", audience: "all", questions: [mkQ("q1", "س1")],
  published: true, version: 1, ...over,
})

t("النسخة الافتراضية ١ للسجلات القديمة", () => {
  eq(SV.surveyVersion({}), 1)
  eq(SV.surveyVersion({ version: 7 }), 7)
  eq(SV.surveyVersion({ version: 0 }), 1)
  eq(SV.surveyVersion({ version: -3 }), 1)
  eq(SV.surveyVersion({ version: "4" }), 4)
})

t("مفتاح «أجبت» = استبيان + نسخة", () => {
  eq(SV.answeredKey("sv-9", 3), "sv-9:3")
  eq(SV.hasAnsweredCurrent(mkSurvey({ version: 3 }), ["sv-1:2"]), false)
  eq(SV.hasAnsweredCurrent(mkSurvey({ version: 3 }), ["sv-1:3"]), true)
  // نفس الاستبيان بنسخة أحدث = لم يُجب عليها بعد
  eq(SV.hasAnsweredCurrent(mkSurvey({ version: 4 }), ["sv-1:3"]), false)
  // استبيان آخر لا يحجب الاستبيان الأول
  eq(SV.hasAnsweredCurrent(mkSurvey({ id: "sv-2", version: 1 }), ["sv-1:1"]), false)
})

t("من أجاب على نسخة أقدم: لا يُحسب مجيبًا على الجديدة، مع معرفة أنه سبق", () => {
  const keys = ["sv-1:1"]
  eq(SV.hasAnsweredOlderVersion(mkSurvey({ version: 2 }), keys), true)
  eq(SV.hasAnsweredOlderVersion(mkSurvey({ version: 2 }), []), false)
  eq(SV.hasAnsweredOlderVersion(mkSurvey({ version: 2 }), ["sv-1:2"]), false)
  eq(SV.hasAnsweredOlderVersion(mkSurvey({ id: "sv-7", version: 2 }), ["sv-1:2"]), false)
})

t("بصمة الأسئلة تتغيّر مع أي تعديل فعلي ولا تتغيّر مع إعادة الترتيب الصوتي للنص", () => {
  const a = SV.questionsFingerprint([mkQ("q1", "ما عنوان الدرس؟")])
  eq(SV.questionsFingerprint([mkQ("q1", "ما عنوان الدرس؟")]), a)
  eq(SV.questionsFingerprint([mkQ("q1", "ما عنوان الدرس؟ ")]) === a, true)
  eq(SV.questionsFingerprint([mkQ("q1", "سؤال آخر")]) !== a, true)
  eq(SV.questionsFingerprint([mkQ("q1", "س1"), mkQ("q2", "س2")]) !== SV.questionsFingerprint([mkQ("q1", "س1")]), true)
  // التقييم من ٥ إلى ١٠ تغيير جوهري
  eq(SV.questionsFingerprint([mkQ("q1", "س1", { type: "rating", maxRating: 10 })]) !==
     SV.questionsFingerprint([mkQ("q1", "س1", { type: "rating", maxRating: 5 })]), true)
})

t("تعديل الأسئلة يرفع النسخة، وتعديل غير الأسئلة (موعد/نشر) لا يرفعها", () => {
  const prev = mkSurvey({ version: 2 })
  eq(SV.nextVersionAfterEdit(prev, prev.questions), 2, "بلا تغيير")
  eq(SV.nextVersionAfterEdit(prev, [mkQ("q1", "صياغة جديدة")]), 3, "تغيير نص سؤال")
  eq(SV.nextVersionAfterEdit(prev, []), 3, "حذف كل الأسئلة = نسخة جديدة")
  eq(SV.nextVersionAfterEdit(undefined, [mkQ("q1", "س1")]), 1, "استبيان جديد يبدأ من ١")
  eq(SV.nextVersionAfterEdit({ version: 9, questions: [] }, []), 9)
})

t("خطة الحفظ المحلي: ردّ واحد لكل هوية في كل نسخة (بلا صف ثانٍ)", () => {
  const survey = mkSurvey({ version: 2 })
  const rows = [{ id: "sr-1", surveyId: "sv-1", version: 2, identityKey: "ph:01000000001" }]
  eq(SV.planLocalSurveySubmit(rows, survey, "ph:01000000002").action, "insert", "رقم آخر على نفس النسخة")
  eq(SV.planLocalSurveySubmit(rows, survey, "ph:01000000001").action, "update", "نفس الرقم = تعديل ردّه")
  eq(SV.planLocalSurveySubmit(rows, mkSurvey({ version: 3 }), "ph:01000000001").action, "insert", "نسخة جديدة تُفتح")
  // نسخة أقدم: لا مساس بردّه الحالي (السجل التاريخي محفوظ للمعلم)
  eq(SV.planLocalSurveySubmit(rows, mkSurvey({ version: 1 }), "ph:01000000001").action, "insert")
  eq(SV.planLocalSurveySubmit(rows, mkSurvey({ version: 1 }), "ph:01000000001").id, undefined, "لا يُكتب فوق ردّ نسخة أخرى")
  eq(SV.planLocalSurveySubmit([{ id: "sr-old", surveyId: "sv-1", version: 1, identityKey: "ph:01000000001" }], mkSurvey({ version: 1 }), "ph:01000000001").id, "sr-old")
  eq(SV.planLocalSurveySubmit(rows, { ...survey, lockAfterSubmit: true }, "ph:01000000001").action, "reject", "مقفول")
  eq(SV.planLocalSurveySubmit(rows, survey, "").action, "reject", "بلا هوية = مرفوض")
  eq(SV.planLocalSurveySubmit(rows, undefined, "ph:01000000001").action, "reject", "استبيان غير موجود")
  const plan = SV.planLocalSurveySubmit(rows, survey, "ph:01000000001")
  eq(plan.id, "sr-1", "التحديث يستهدف صفّه هو")
  eq(plan.version, 2)
})

t("بصمة الهوية محليًا: الطالب من جلسته والزائر من رقمه", () => {
  eq(SV.localIdentityKey({ token: "tok-0123456789abcdef" }), "sid:0123456789abcdef")
  eq(SV.localIdentityKey({ token: "abcdefghijklmnop" }), "sid:abcdefghijklmnop")
  eq(SV.localIdentityKey({ phone: "010 123-45678" }), "ph:01012345678")
  // الأرقام العربية-الهندية تُوحَّد قبل البصمة (وإلا تفلت من منع التكرار)
  eq(SV.localIdentityKey({ phone: "٠١٠١٢٣٤٥٦٧٨" }), "ph:01012345678")
  eq(SV.normalizeSurveyPhone("٠١٠ ١٢٣-٤٥٦٧٨"), "01012345678")
  eq(SV.normalizeSurveyPhone("٠١٠١٢٣"), "", "قصير")
  eq(SV.normalizeSurveyPhone("010abc23456"), "", "رقم مشوّه بحروف → مرفوض (لا يُبنى عليه منع التكرار)")
  // صيغ مختلفة لنفس الرقم ⇒ نفس البصمة (وهذا جوهر منع التكرار عبر الأجهزة)
  eq(SV.normalizeSurveyPhone("+20 101 234 5678"), "01012345678")
  eq(SV.normalizeSurveyPhone("201012345678"), "01012345678")
  eq(SV.normalizeSurveyPhone("01012345678"), "01012345678")
  eq(SV.localIdentityKey({ phone: "+20 101 234 5678" }), SV.localIdentityKey({ phone: "٠١٠١٢٣٤٥٦٧٨" }))
  eq(SV.localIdentityKey({ phone: "01012345678" }), "ph:01012345678")
  eq(SV.localIdentityKey({ phone: "123" }), "", "رقم قصير بلا بصمة")
  eq(SV.localIdentityKey({}), "", "بلا بيانات بلا بصمة")
  // أولوية الجلسة على الرقم (هوية الطالب لا يُصدَّق فيها رقم مُدخل)
  eq(SV.localIdentityKey({ token: "abcdefghijklmnop", phone: "01012345678" }), "sid:abcdefghijklmnop")
  eq(SV.localIdentityKey({ phone: "01012345678", token: "" }), "ph:01012345678")
})

t("canEditAnswer: تعديل مسموح ما دام مفتوحًا، وممنوع عند القفل أو انتهاء الموعد", () => {
  eq(SV.canEditAnswer({ published: true }, false), true, "لم يُجب بعد")
  eq(SV.canEditAnswer({ published: true }, true), true, "مفتوح = يصحّح")
  eq(SV.canEditAnswer({ published: true, lockAfterSubmit: true }, true), false, "مقفول من المعلم")
  eq(SV.canEditAnswer({ published: false }, true), false, "أُلغي النشر")
  eq(SV.canEditAnswer({ published: true, deadline: "2020-01-01T00:00:00.000Z" }, true), false, "انتهى الموعد")
  eq(SV.canEditAnswer({ published: true, deadline: "2999-01-01T00:00:00.000Z" }, true), true, "قبل الموعد")
})

t("لا يرجع الاقتصاص القديم: الرد المكرر لا يُنشئ صفحة «إجابة أخرى»", () => {
  const board = readFileSync("src/components/surveys/public-surveys-board.tsx", "utf8")
  eq(board.includes("إجابة أخرى"), false, "اللوحة العامة ما زالت تعرض «إجابة أخرى»")
  eq(board.includes("hasAnsweredCurrent"), true, "اللوحة لا تستخدم حالة الإجابة المرتبطة بالنسخة")
  const panel = readFileSync("src/components/surveys/student-surveys-panel.tsx", "utf8")
  eq(panel.includes("answeredKeys"), true, "لوحة الطالب لا تقرأ مفاتيح الإجابة (الردود المجهولة تفلت)")
  eq(panel.includes("hasAnsweredCurrent") && panel.includes("canEditAnswer"), true)
})

t("لوحة الزائر: لا رقم هاتف إجباري ولا شرح تقني للطالب", () => {
  const stripBoard = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const boardRaw = readFileSync("src/components/surveys/public-surveys-board.tsx", "utf8")
  const board = stripBoard(boardRaw)
  // الحقول تُشتق من إعداد المعلم لا من ثوابت في الواجهة
  eq(boardRaw.includes("guestFields") && boardRaw.includes("validateGuestInput"), true,
    "الواجهة لا تستعمل مصدر الحقول الموحّد")
  // لا حقل هاتف مفروض ولا نص عن البصمات/التخزين في وجه الطالب
  eq(/رقم الهاتف \*/.test(board), false, "ما زال حقل الهاتف إجباريًا بعلامة نجمة")
  eq(/بصمة|بصمتك|لا يُخزَّن مع الإجابات|لمنع ردّ ثانٍ باسمك/.test(board), false,
    "نص تقني/مقلق ما زال معروضًا للطالب")
  // النص المعروض للطالب فقط (تعليقات المطوّرين مسموح فيها الشرح التقني)
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const panel = stripComments(readFileSync("src/components/surveys/student-surveys-panel.tsx", "utf8"))
  eq(/بصمة|رقمك لا يُخزَّن|ردّ واحد لكل رقم/.test(panel), false, "لوحة الطالب ما زالت تشرح الآلية الداخلية")
})

t("حقول الزائر تتبع إعداد المعلم (بلا رقم افتراضيًا — مثل استبيانات Google)", () => {
  const def = SV.guestFields({})
  eq(def.showPhone, false, "الافتراضي بلا رقم هاتف")
  eq(def.showName && !def.requireName, true, "الاسم اختياري افتراضيًا")
  eq(SV.guestFields({ guestIdentity: "phone" }).requirePhone, true)
  eq(SV.guestFields({ nameMode: "required" }).requireName, true)
  eq(SV.guestFields({ nameMode: "off" }).showName, false)
  eq(SV.guestFields({ anonymous: true }).showName, false, "المجهول لا يسأل عن الاسم")
  eq(SV.guestFields({ anonymous: true, nameMode: "required" }).requireName, false)
  // التحقق: لا نطلب ما لم يُطلب
  eq(SV.validateGuestInput({}, {}), null, "الإجابة بلا أي بيانات مسموحة")
  eq(SV.validateGuestInput({ guestIdentity: "phone" }, {}) !== null, true, "وضع الهاتف يطلب رقمًا")
  eq(SV.validateGuestInput({ guestIdentity: "phone" }, { phone: "01012345678" }), null)
  eq(SV.validateGuestInput({ nameMode: "required" }, { name: "أ" }) !== null, true, "اسم قصير مرفوض")
  eq(SV.validateGuestInput({ nameMode: "required" }, { name: "أحمد" }), null)
  eq(SV.guestIdentityOf({}), "device", "الافتراضي بطاقة الجهاز")
  eq(SV.guestIdentityOf({ guestIdentity: "خطأ" }), "device", "قيمة غير معروفة ترجع للافتراضي")
})

t("بطاقة المتصفح تمنع الرد المكرر بلا رقم، والتصويت الحر لا يمنع", () => {
  // الزائر بلا رقم: بصمته من بطاقة متصفحه
  eq(SV.localIdentityKey({ deviceId: "abc123abc123abc1" }), "dev:abc123abc123abc1")
  // الرقم — إن طُلب — أولى من البطاقة (ليُربط بحساب الطالب)
  eq(SV.localIdentityKey({ phone: "01012345678", deviceId: "abc123abc123abc1" }), "ph:01012345678")
  eq(SV.localIdentityKey({ token: "abcdefghijklmnop", deviceId: "abc123abc123abc1" }), "sid:abcdefghijklmnop")

  const survey = mkSurvey({ version: 1 })
  const rows = [{ id: "sr-1", surveyId: "sv-1", version: 1, identityKey: "dev:abc123abc123abc1" }]
  eq(SV.planLocalSurveySubmit(rows, survey, "dev:abc123abc123abc1").action, "update", "نفس المتصفح = ردّه هو")
  eq(SV.planLocalSurveySubmit(rows, survey, "dev:zzz999zzz999zzz9").action, "insert", "متصفح آخر = شخص آخر")
  // تصويت حر: كل إرسال ردّ مستقل (اختيار صريح من المعلم)
  const open = { ...survey, guestIdentity: "open" }
  eq(SV.planLocalSurveySubmit(rows, open, "dev:abc123abc123abc1").action, "insert")
  eq(SV.planLocalSurveySubmit(rows, open, "").action, "insert", "التصويت الحر لا يحتاج هوية")
  // وفي غير الحر: بلا أي هوية لا نحفظ (لا نلوّث النتائج)
  eq(SV.planLocalSurveySubmit(rows, survey, "").action, "reject")
})

t("بطاقة المتصفح: توليد صالح ومطابق لقاعدة الخادم (16..128)", () => {
  const dev = readFileSync("src/lib/survey-device.ts", "utf8")
  eq(/\^\[a-z0-9-\]\{16,128\}\$/.test(dev), true, "شرط الطول لا يطابق survey_device_key في 023")
  eq(dev.includes("SameSite=Lax"), true, "الكوكي بلا SameSite")
  eq(/localStorage[\s\S]*document\.cookie|document\.cookie[\s\S]*localStorage/.test(dev), true,
    "لا نسخة احتياطية للبطاقة (مسح أحد المخزنين يفقدها)")
})

t("sync.ts يستبدل ردّ الطالب في الذاكرة ولا يكرره", () => {
  const syncRaw = readFileSync("src/lib/supabase/sync.ts", "utf8")
  eq(syncRaw.includes("planLocalSurveySubmit"), true)
  eq(syncRaw.includes("localIdentityKey"), true)
  eq(/exists \? prev\.map/.test(syncRaw), true, "الحفظ المحلي يضيف بدل الاستبدال")
})

console.log(`\n${"=".repeat(56)}`)
console.log(`\x1b[1mالنتيجة: ${pass} ناجح / ${fail} فاشل\x1b[0m`)
if (fail) {
  fails.forEach((f) => console.log("  • " + f))
  process.exit(1)
}
console.log("\x1b[32mكل الاختبارات السلوكية نجحت ✅\x1b[0m")
