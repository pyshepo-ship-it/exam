"use client"

import React, { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Clock, CheckCircle2, Trophy, BookOpen, AlertCircle, LogIn, UserPlus, ShieldCheck, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Exam,
  ExamAttempt,
  ExamAttemptAnswer,
  Grade,
  Student,
  Question,
  SubQuestion,
  getExams,
  getGrades,
  getStudents,
  getGroupsOfGrade,
  getExamAttempts,
  saveExamAttempts,
  maybeAutoHonor,
} from "@/lib/data-storage"
import { gradeExam } from "@/lib/exam-grade"
import { gradeSealedExam, sealExamForStudent } from "@/lib/exam-public"
import { fetchPublicData, fetchAttemptCount, submitPublicAttempt, submitPublicHonoree } from "@/lib/supabase/sync"
import { TeacherSignature } from "@/components/teacher-signature"
import { TEACHER_NAME } from "@/lib/branding"
import { getPortalSession } from "@/lib/student-accounts"
import { examAvailability, attemptsStatus } from "@/lib/portal-content"
import { decodeSealForReview } from "@/lib/exam-public"
import {
  ARABIC_ORDINALS,
  getQuestionHeader,
  getQuestionTypeMeta,
  renderCompleteParts,
  getUnderlinedWords,
} from "@/lib/exam-templates"

type Step = "load" | "missing" | "identify" | "exam" | "result" | "closed"

function formatTime(totalSeconds: number) {
  const m = Math.max(0, Math.floor(totalSeconds / 60))
  const s = Math.max(0, totalSeconds % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export default function TakeExamPage() {
  const params = useParams<{ id: string }>()
  const examId = params?.id

  const [step, setStep] = useState<Step>("load")
  const [exam, setExam] = useState<Exam | null>(null)
  const [grades, setGrades] = useState<Grade[]>([])
  const [students, setStudents] = useState<Student[]>([])

  const [studentName, setStudentName] = useState(() => {
    if (typeof window === "undefined") return ""
    return getPortalSession()?.name || ""
  })
  const [gradeId, setGradeId] = useState("")
  const [groupId, setGroupId] = useState("")
  const [answers, setAnswers] = useState<Record<string, ExamAttemptAnswer>>({})
  // عرض سؤال واحد في كل مرة — مؤشر السؤال الفرعي الحالي
  const [cursor, setCursor] = useState(0)
  const [startedAt, setStartedAt] = useState("")
  const [remaining, setRemaining] = useState(0)
  const [result, setResult] = useState<ReturnType<typeof gradeExam> | null>(null)
  const [answerVisibility, setAnswerVisibility] = useState<'never' | 'afterEach' | 'atEnd'>("never")
  const [closedReason, setClosedReason] = useState("")
  const [honored, setHonored] = useState(false)
  // بيانات الطالب من جلسة الدخول — الاختبارات للمسجلين فقط (لا اختيار اسم للزوار)
  const [portalStudent, setPortalStudent] = useState<{ id: string; name: string; gradeId: string; groupId: string } | null>(null)
  const submittedRef = React.useRef(false)
  const hadPositiveTime = React.useRef(false)
  const sealRef = React.useRef("")
  const specRef = React.useRef<Record<string, { choiceId?: string; text?: string; isTrue?: boolean }>>({})

  useEffect(() => {
    const load = async () => {
      let found = getExams().find(e => e.id === examId) || null
      let nextGrades = getGrades()
      const nextStudents = getStudents()

      const publicData = await fetchPublicData()
      if (publicData) {
        if (!found) found = publicData.exams.find(e => e.id === examId) || null
        if (nextGrades.length === 0) {
          nextGrades = publicData.grades.map(g => ({
            id: g.id,
            name: g.name,
            academicYear: "",
            createdAt: "",
            groups: publicData.groups
              .filter(gr => gr.gradeId === g.id)
              .map(gr => ({
                id: gr.id,
                name: gr.name,
                days: [] as string[],
                startTime: "",
                endTime: "",
                monthlyFee: 0,
                studentsCount: 0,
              })),
          }))
        }
      }

      // جلسة الطالب: الهوية تلقائية — لا اختيار اسم إطلاقاً
      const portal = getPortalSession()
      if (portal) {
        const me = nextStudents.find(s => s.id === portal.studentId)
        setStudentName(me?.name || portal.name)
        setPortalStudent({
          id: portal.studentId,
          name: me?.name || portal.name,
          gradeId: me?.gradeId || "",
          groupId: me?.groupId || "",
        })
        if (me) {
          setGradeId(me.gradeId)
          setGroupId(me.groupId)
        }
      }

      if (found) {
        // منع الطالب من اختبار ليس لمجموعته (عزل تام حسب الصف والمجموعة)
        if (portal) {
          const me = nextStudents.find(s => s.id === portal.studentId)
          if (me) {
            if (found.gradeId && found.gradeId !== me.gradeId) {
              setStep("missing")
              setGrades(nextGrades)
              setStudents(nextStudents)
              return
            }
            const targets = found.targetGroupIds || []
            if (targets.length > 0 && !targets.includes(me.groupId)) {
              setStep("missing")
              setGrades(nextGrades)
              setStudents(nextStudents)
              return
            }
          }
        }
        // بوابة الإتاحة الزمنية
        const av = examAvailability(found)
        if (!av.open) {
          setClosedReason(av.reason || "الاختبار مغلق حالياً")
          setStep("closed")
          setGrades(nextGrades)
          setStudents(nextStudents)
          return
        }
        // حد عدد مرات الاجتياز — محلياً + العدّاد السحابي (عبر الأجهزة)
        if (portal) {
          const remote = await fetchAttemptCount(found.id, portal.studentId).catch(() => null)
          const at = attemptsStatus(found, getExamAttempts(), portal.studentId, undefined, undefined, remote ?? 0)
          if (!at.allowed) {
            setClosedReason(at.reason || "استُنفدت محاولاتك لهذا الاختبار")
            setStep("closed")
            setGrades(nextGrades)
            setStudents(nextStudents)
            return
          }
        }
        const sealed = sealExamForStudent(found)
        sealRef.current = sealed.token
        setAnswerVisibility(found.answerVisibility || "never")
        setExam(sealed.view)
        setGradeId(prev => prev || found!.gradeId || "")
        setGroupId(prev => prev || found!.groupId || "")
      } else {
        setExam(null)
      }
      setGrades(nextGrades)
      setStudents(nextStudents)
      if (!found || !found.allowOnline) {
        setStep("missing")
      } else {
        setStep("identify")
      }
    }
    load()
  }, [examId])

  useEffect(() => {
    if (step !== "exam") return
    const timer = window.setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          window.clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [step])

  useEffect(() => {
    if (step === "exam" && remaining > 0) hadPositiveTime.current = true
    if (step === "exam" && remaining === 0 && hadPositiveTime.current) {
      finishExam()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, step])

  const groups = getGroupsOfGrade(grades, gradeId)
  const groupStudents = students.filter(s => s.groupId === groupId && s.status === "active")

  const startExam = () => {
    if (!exam) return
    // الاختبار للمسجلين فقط — الهوية تأتي من الجلسة تلقائياً
    if (!portalStudent) return
    // وضع «بعد الإجابة على السؤال»: مفاتيح الإجابات تُفك محلياً بقرار صريح من المعلم
    if (answerVisibility === "afterEach" && sealRef.current) {
      specRef.current = decodeSealForReview(sealRef.current, exam.id)
    }
    if (!gradeId || !groupId) {
      alert("لم يتم تحديد صفك ومجموعتك — أكمل بياناتك من إعدادات حسابك أو راجع المعلم")
      return
    }
    const minutes = exam.duration && exam.duration > 0 ? exam.duration : 60
    setStartedAt(new Date().toISOString())
    setRemaining(minutes * 60)
    setCursor(0)
    setStep("exam")
  }

  const setAnswer = (id: string, patch: ExamAttemptAnswer) => {
    setAnswers(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const finishExam = async () => {
    if (!exam || step === "result" || submittedRef.current) return
    submittedRef.current = true
    const graded = sealRef.current
      ? gradeSealedExam(exam, sealRef.current, answers)
      : gradeExam(exam, answers)
    setResult(graded)

    const attempt: ExamAttempt = {
      id: `${exam.id}-${Date.now()}`,
      examId: exam.id,
      studentId: portalStudent?.id,
      studentName: (portalStudent?.name || studentName).trim(),
      groupId,
      gradeId,
      answers,
      score: graded.score,
      totalMarks: graded.autoTotal,
      startedAt: startedAt || new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      durationSeconds: Math.max(
        0,
        Math.round((Date.now() - new Date(startedAt || Date.now()).getTime()) / 1000)
      ),
    }

    const all = [...getExamAttempts(), attempt]
    saveExamAttempts(all)
    submitPublicAttempt(attempt).catch(() => {})

    const honoree = maybeAutoHonor({
      exam,
      studentName: attempt.studentName,
      groupId,
      studentId: portalStudent?.id,
      score: graded.score,
      totalMarks: graded.autoTotal,
    })
    if (honoree) {
      setHonored(true)
      submitPublicHonoree(honoree).catch(() => {})
    }
    setStep("result")
  }

  // نص الإجابة الصحيحة لسؤال فرعي (من المفتاح المفكوك — يُستخدم في afterEach/atEnd فقط)
  const correctAnswerLabel = (sqId: string, questionType: number, subQuestion?: { choices?: { id: string; choiceKey?: string; choiceText: string }[] }): string => {
    const spec = specRef.current[sqId]
    if (!spec) return ""
    if (questionType === 1) {
      const c = subQuestion?.choices?.find(x => x.id === spec.choiceId)
      return c ? `(${c.choiceKey || ""}) ${c.choiceText}` : ""
    }
    if (questionType === 3) return spec.isTrue === true ? "صح" : "خطأ"
    return spec.text || ""
  }

  /** هل السؤال الفرعي مُجاب عليه؟ */
  const isSubAnswered = (q: Question, sq: SubQuestion): boolean => {
    const a = answers[sq.id]
    if (!a) return false
    if (q.questionType === 1) return !!a.choiceId
    if (q.questionType === 3) return typeof a.isTrue === "boolean"
    return !!(a.text || "").trim()
  }

  /** رسم سؤال فرعي واحد بكل أنواعه + تغذية راجعة «بعد الإجابة» */
  const renderSubQuestion = (question: Question, sq: SubQuestion) => {
    const answeredNow = isSubAnswered(question, sq)
    const feedback = answerVisibility === "afterEach" && answeredNow ? (() => {
      const gradedDetail = specRef.current[sq.id]
      if (!gradedDetail) return null
      let correct = false
      if (question.questionType === 1) correct = answers[sq.id].choiceId === gradedDetail.choiceId
      else if (question.questionType === 3) correct = answers[sq.id].isTrue === gradedDetail.isTrue
      else {
        const norm = (s?: string) => (s || "").trim().replace(/\s+/g, " ").toLowerCase()
        correct = norm(answers[sq.id].text) === norm(gradedDetail.text) && !!norm(gradedDetail.text)
      }
      const label = correctAnswerLabel(sq.id, question.questionType, sq)
      return { correct, label }
    })() : null

    return (
      <div className="border-t border-dashed pt-3 space-y-2">
        <p className="font-semibold">{sq.questionText}</p>

        {question.questionType === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sq.choices?.map(c => {
              const selected = answers[sq.id]?.choiceId === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setAnswer(sq.id, { choiceId: c.id })}
                  className={`text-right rounded-xl border px-3 py-2 ${
                    selected ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950" : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  {c.choiceKey}) {c.choiceText}
                </button>
              )
            })}
          </div>
        )}

        {question.questionType === 2 && (
          <div>
            <p className="text-sm text-gray-600 mb-2">
              {(() => {
                const { before, after, atEnd } = renderCompleteParts(sq)
                return atEnd ? `${before} ${after} ........` : `${before} ........ ${after}`
              })()}
            </p>
            <Input
              placeholder="أكمل الفراغ"
              value={answers[sq.id]?.text || ""}
              onChange={e => setAnswer(sq.id, { text: e.target.value })}
            />
          </div>
        )}

        {question.questionType === 3 && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant={answers[sq.id]?.isTrue === true ? "default" : "outline"}
              onClick={() => setAnswer(sq.id, { isTrue: true })}
            >
              صح
            </Button>
            <Button
              type="button"
              variant={answers[sq.id]?.isTrue === false ? "default" : "outline"}
              onClick={() => setAnswer(sq.id, { isTrue: false })}
            >
              خطأ
            </Button>
          </div>
        )}

        {(question.questionType === 4 || question.questionType === 5 || question.questionType === 6 || question.questionType === 7 || question.questionType === 8) && (
          <div>
            {question.questionType === 5 && (
              <p className="text-sm mb-2">
                {getUnderlinedWords(sq).map((w, i) => (
                  <span key={i}>
                    <span className={w.underlined ? "underline font-bold text-rose-600 dark:text-rose-400" : undefined}>{w.word}</span>
                    {i < getUnderlinedWords(sq).length - 1 ? " " : ""}
                  </span>
                ))}
              </p>
            )}
            <textarea
              rows={question.questionType === 5 ? 2 : (sq.answerLines || 1)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={
                question.questionType === 5
                  ? "التصحيح"
                  : question.questionType === 6
                  ? "اكتب المصطلح العلمي هنا"
                  : question.questionType === 7
                  ? "اكتب التعريف هنا"
                  : "إجابتك"
              }
              value={answers[sq.id]?.text || ""}
              onChange={e => setAnswer(sq.id, { text: e.target.value })}
            />
          </div>
        )}

        {feedback && (
          <div className={`rounded-xl border px-3 py-2 text-sm font-bold ${
            feedback.correct
              ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800 text-green-700 dark:text-green-300"
              : "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300"
          }`}>
            {feedback.correct ? "✅ إجابة صحيحة" : `❌ إجابة خاطئة — الإجابة الصحيحة: ${feedback.label}`}
          </div>
        )}
      </div>
    )
  }

  if (step === "load") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500" />
      </div>
    )
  }

  if (step === "closed") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <Clock className="w-14 h-14 mx-auto text-amber-500" />
          <h1 className="text-2xl font-bold">الاختبار مغلق الآن</h1>
          <p className="text-gray-500">{closedReason || "لم يفت موعد هذا الاختبار بعد — تابع إعلانات المعلم"}</p>
          <Link href="/student"><Button variant="outline">بوابة الطالب</Button></Link>
          <TeacherSignature />
        </div>
      </div>
    )
  }

  if (step === "missing" || !exam) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="w-14 h-14 mx-auto text-rose-500" />
          <h1 className="text-2xl font-bold">الاختبار غير متاح</h1>
          <p className="text-gray-500">ربما لم يُنشر للطلاب بعد، أو انتهى رابطه.</p>
          <Link href="/"><Button variant="outline">العودة للصفحة الرئيسية</Button></Link>
          <TeacherSignature />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-arabic" dir="rtl">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold truncate">{exam.title}</h1>
              <p className="text-xs text-gray-500">
                {exam.duration || 60} دقيقة
                {exam.totalMarks ? ` • ${exam.totalMarks} درجة` : ""}
              </p>
            </div>
          </div>
          {step === "exam" && (
            <div className={`flex items-center gap-2 font-mono font-bold ${remaining < 60 ? "text-red-600" : "text-indigo-700"}`}>
              <Clock className="w-5 h-5" />
              {formatTime(remaining)}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {step === "identify" && !portalStudent && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto">
              <UserX className="w-8 h-8 text-white" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">الاختبار متاح للطلاب المسجلين فقط</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                لضمان عدالة النتائج وتسجيل درجاتك في تقريرك، يجب تسجيل الدخول بحسابك قبل بدء الاختبار.
                <br />
                لا تملك حساباً؟ سجّل الآن وانتظر موافقة المعلم.
              </p>
            </div>
            <div className="space-y-3 max-w-sm mx-auto pt-2">
              <Button asChild className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 h-12 text-base">
                <Link href={`/student/login?next=${encodeURIComponent("/exam/" + examId)}`}>
                  <LogIn className="w-5 h-5 ml-2" />
                  تسجيل الدخول لبدء الاختبار
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full h-12 text-base">
                <Link href="/student/register">
                  <UserPlus className="w-5 h-5 ml-2" />
                  إنشاء حساب جديد
                </Link>
              </Button>
            </div>
            <p className="text-xs text-gray-400 pt-2">
              بعد تسجيل الدخول ستعود لهذا الاختبار تلقائياً وسيبدأ العدّ عند الضغط على «بدء الاختبار».
            </p>
          </div>
        )}

        {step === "identify" && portalStudent && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <h2 className="text-xl font-bold">تأكيد بدء الاختبار</h2>
            <p className="text-sm text-gray-500">
              بعد البدء يبدأ العدّ التنازلي ({exam.duration || 60} دقيقة) ولا يمكن إيقافه.
            </p>
            <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="font-bold text-lg truncate">{portalStudent.name}</span>
                </div>
                <span className="shrink-0 bg-green-100 text-green-700 rounded-full px-3 py-1 text-xs font-bold">✓ مسجل الدخول</span>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {grades.find(g => g.id === gradeId)?.name || ""}
                {groupId ? ` — ${groups.find(x => x.id === groupId)?.name || ""}` : ""}
              </div>
              <p className="text-xs text-gray-400">
                اسمك وصفك ومجموعتك مسجَّلة تلقائياً من حسابك — تُحفظ درجتك في تقريرك مباشرة.
              </p>
            </div>
            <Button onClick={startExam} className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 h-12 text-base">
              بدء الاختبار
            </Button>
          </div>
        )}

        {step === "exam" && (() => {
          // تسلسل كل الأسئلة الفرعية — يُعرض واحد فقط في كل لحظة
          const items = exam.questions.flatMap((q, qi) => q.subQuestions.map(sq => ({ q, sq, qi })))
          if (items.length === 0) {
            return (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border p-8 text-center space-y-3">
                <AlertCircle className="w-12 h-12 mx-auto text-amber-500" />
                <p className="font-bold">لا توجد أسئلة في هذا الاختبار بعد</p>
                <Button onClick={finishExam} variant="outline">متابعة</Button>
              </div>
            )
          }
          const safeCursor = Math.min(cursor, items.length - 1)
          const cur = items[safeCursor]
          const meta = getQuestionTypeMeta(cur.q.questionType)
          const isLast = safeCursor >= items.length - 1
          const answered = isSubAnswered(cur.q, cur.sq)
          const pct = Math.round(((safeCursor + (answered ? 1 : 0)) / items.length) * 100)
          return (
            <div className="space-y-4">
              {/* شريط التقدم */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
                <div className="flex items-center justify-between text-sm font-bold mb-2">
                  <span className="text-gray-900 dark:text-white">السؤال {safeCursor + 1} من {items.length}</span>
                  <span className="text-gray-400">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full bg-gradient-to-l from-indigo-500 to-purple-600 transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
              </div>

              {/* السؤال الحالي فقط */}
              <section className="bg-white dark:bg-gray-900 rounded-2xl border p-5 space-y-4">
                <h3 className="font-extrabold flex items-center gap-2">
                  <span className="text-white text-xs px-2 py-1 rounded" style={{ background: meta.accent }}>
                    {meta.paperMark}
                  </span>
                  السؤال {ARABIC_ORDINALS[cur.qi] || cur.qi + 1}: {getQuestionHeader(cur.q)}
                </h3>
                {renderSubQuestion(cur.q, cur.sq)}
              </section>

              {/* التنقل: السابق / التالي (يُفتح بعد الإجابة) / إنهاء عند الأخير */}
              <div className="sticky bottom-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur rounded-2xl border p-4 flex items-center justify-between gap-3">
                <Button variant="outline" onClick={() => setCursor(safeCursor - 1)} disabled={safeCursor === 0}>
                  السابق
                </Button>
                <p className="text-xs text-gray-500 hidden sm:block text-center">
                  {isLast ? "آخر سؤال — راجع إجابتك ثم أنهِ الاختبار" : "أجب على السؤال ليظهر التالي"}
                </p>
                {isLast ? (
                  <Button onClick={finishExam} className="bg-gradient-to-r from-emerald-500 to-teal-600">
                    إنهاء الاختبار وإظهار النتيجة
                  </Button>
                ) : (
                  <Button
                    onClick={() => setCursor(safeCursor + 1)}
                    disabled={!answered}
                    title={!answered ? "أجب على السؤال أولاً" : "السؤال التالي"}
                    className="bg-gradient-to-r from-indigo-500 to-purple-600"
                  >
                    التالي
                  </Button>
                )}
              </div>
            </div>
          )
        })()}

        {step === "result" && result && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border p-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500" />
            <h2 className="text-2xl font-extrabold">انتهى الاختبار</h2>
            <p className="text-5xl font-black text-indigo-700">
              {result.score} / {result.autoTotal || 0}
            </p>
            <p className="text-gray-500">
              النسبة {result.percent.toFixed(0)}%
              {result.manualTotal > 0 && ` — ${result.manualTotal} درجة تُصحَّح يدوياً`}
            </p>
            {honored && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 p-4 text-amber-800 dark:text-amber-200">
                <Trophy className="w-6 h-6 mx-auto mb-1" />
                <p className="font-bold">مبروك — اسمك على لوحة الشرف هذا الشهر</p>
              </div>
            )}

            {/* مراجعة الإجابات الصحيحة — عند اختيار المعلم «في نهاية الاختبار» */}
            {answerVisibility === "atEnd" && (() => {
              specRef.current = decodeSealForReview(sealRef.current, exam.id)
              const detailMap = new Map(result.details.map(d => [d.subQuestionId, d]))
              const reviewRows: { text: string; correct: boolean; answer: string; right: string }[] = []
              for (const q of exam.questions || []) {
                for (const sq of q.subQuestions || []) {
                  const d = detailMap.get(sq.id)
                  if (!d || !d.auto) continue
                  const ans = answers[sq.id] || {}
                  const myAnswer =
                    q.questionType === 1
                      ? sq.choices?.find(c => c.id === ans.choiceId)?.choiceText || "—"
                      : q.questionType === 3
                      ? ans.isTrue === true ? "صح" : ans.isTrue === false ? "خطأ" : "—"
                      : ans.text?.trim() || "—"
                  reviewRows.push({
                    text: `${getQuestionHeader(q)} — ${sq.questionText}`,
                    correct: d.correct,
                    answer: myAnswer,
                    right: correctAnswerLabel(sq.id, q.questionType, sq) || "—",
                  })
                }
              }
              if (reviewRows.length === 0) return null
              return (
                <div className="text-right border-t pt-4 mt-2 space-y-2">
                  <h3 className="font-extrabold">مراجعة الإجابات الصحيحة</h3>
                  {reviewRows.map((r, i) => (
                    <div key={i} className={`rounded-xl border px-4 py-3 text-sm ${
                      r.correct ? "border-green-200 dark:border-green-900 bg-green-50/60 dark:bg-green-950/20" : "border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/20"
                    }`}>
                      <p className="font-bold text-gray-800 dark:text-gray-100">{r.correct ? "✅" : "❌"} {r.text}</p>
                      <p className="text-gray-600 dark:text-gray-300 mt-1">إجابتك: {r.answer}</p>
                      {!r.correct && <p className="text-green-700 dark:text-green-300 font-bold mt-0.5">الصحيح: {r.right}</p>}
                    </div>
                  ))}
                </div>
              )
            })()}
            <p className="text-sm text-gray-400">إعداد {TEACHER_NAME}</p>
            <Link href="/"><Button variant="outline">العودة للصفحة الرئيسية</Button></Link>
          </div>
        )}

        <TeacherSignature />
      </main>
    </div>
  )
}
