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
src = src.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/weekdays"/, "")
const weekdays = readFileSync("src/lib/weekdays.ts", "utf8").replace(/export /g, "")
// بدائل محلية
src =
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
  "\n" + src

const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText

const mod = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
)

let gradeSrc = readFileSync("src/lib/exam-grade.ts", "utf8")
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

console.log("\n\x1b[1mسيناريو 9: حضور يومي بدون حصص يدوية\x1b[0m")
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

console.log("\n\x1b[1mسيناريو 10: لوحة الشرف التلقائية من نتيجة الاختبار\x1b[0m")
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


console.log("\n\x1b[1mسيناريو 11: التصحيح الآلي للاختبار الإلكتروني\x1b[0m")
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
let gradeBare = readFileSync("src/lib/exam-grade.ts", "utf8").replace(/import[\s\S]*?from\s*"\.\/data-storage"/, "")
const pubJs = ts.transpileModule(gradeBare + "\n" + pubSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const pubMod = await import(
  "data:text/javascript;base64," + Buffer.from(pubJs).toString("base64")
)

console.log("\n\x1b[1mسيناريو 12: إخفاء مفاتيح التصحيح عن واجهة الطالب\x1b[0m")
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

console.log("\n\x1b[1mسيناريو 13: تقسيم أسئلة الامتحان ديناميكياً على الصفحات وعدم شطر أي سؤال\x1b[0m")
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

console.log(`\n${"=".repeat(56)}`)
console.log(`\x1b[1mالنتيجة: ${pass} ناجح / ${fail} فاشل\x1b[0m`)
if (fail) {
  fails.forEach((f) => console.log("  • " + f))
  process.exit(1)
}
console.log("\x1b[32mكل الاختبارات السلوكية نجحت ✅\x1b[0m")
