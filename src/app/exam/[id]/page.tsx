"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Clock, CheckCircle2, Trophy, BookOpen, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Exam,
  ExamAttempt,
  ExamAttemptAnswer,
  Grade,
  Student,
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
import { fetchPublicData, submitPublicAttempt, submitPublicHonoree } from "@/lib/supabase/sync"
import { TeacherSignature } from "@/components/teacher-signature"
import { TEACHER_NAME } from "@/lib/branding"
import {
  ARABIC_ORDINALS,
  getQuestionHeader,
  getQuestionTypeMeta,
  renderCompleteParts,
  getUnderlinedWords,
} from "@/lib/exam-templates"

type Step = "load" | "missing" | "identify" | "exam" | "result"

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

  const [studentName, setStudentName] = useState("")
  const [gradeId, setGradeId] = useState("")
  const [groupId, setGroupId] = useState("")
  const [answers, setAnswers] = useState<Record<string, ExamAttemptAnswer>>({})
  const [startedAt, setStartedAt] = useState("")
  const [remaining, setRemaining] = useState(0)
  const [result, setResult] = useState<ReturnType<typeof gradeExam> | null>(null)
  const [honored, setHonored] = useState(false)
  const submittedRef = React.useRef(false)
  const hadPositiveTime = React.useRef(false)
  const sealRef = React.useRef("")

  useEffect(() => {
    const load = async () => {
      let found = getExams().find(e => e.id === examId) || null
      let nextGrades = getGrades()
      let nextStudents = getStudents()

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

      if (found) {
        const sealed = sealExamForStudent(found)
        sealRef.current = sealed.token
        setExam(sealed.view)
        setGradeId(found.gradeId || "")
        setGroupId(found.groupId || "")
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
    if (!studentName.trim()) {
      alert("يرجى كتابة اسمك")
      return
    }
    if (!gradeId || !groupId) {
      alert("يرجى اختيار الصف والمجموعة")
      return
    }
    const minutes = exam.duration && exam.duration > 0 ? exam.duration : 60
    setStartedAt(new Date().toISOString())
    setRemaining(minutes * 60)
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

    const matched = groupStudents.find(s => s.name.trim() === studentName.trim())
    const attempt: ExamAttempt = {
      id: `${exam.id}-${Date.now()}`,
      examId: exam.id,
      studentId: matched?.id,
      studentName: studentName.trim(),
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
      studentId: matched?.id,
      score: graded.score,
      totalMarks: graded.autoTotal,
    })
    if (honoree) {
      setHonored(true)
      submitPublicHonoree(honoree).catch(() => {})
    }
    setStep("result")
  }

  const unanswered = useMemo(() => {
    if (!exam) return 0
    let n = 0
    for (const q of exam.questions || []) {
      for (const sq of q.subQuestions || []) {
        const a = answers[sq.id]
        if (q.questionType === 1 && !a?.choiceId) n++
        else if (q.questionType === 2 && !(a?.text || "").trim()) n++
        else if (q.questionType === 3 && typeof a?.isTrue !== "boolean") n++
        else if ((q.questionType === 4 || q.questionType === 5 || q.questionType === 6 || q.questionType === 7 || q.questionType === 8) && !(a?.text || "").trim()) n++
      }
    }
    return n
  }, [exam, answers])

  if (step === "load") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500" />
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
        {step === "identify" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <h2 className="text-xl font-bold">بيانات الطالب</h2>
            <p className="text-sm text-gray-500">
              بعد البدء يبدأ العدّ التنازلي ({exam.duration || 60} دقيقة) ولا يمكن إيقافه.
            </p>
            <div>
              <Label>الاسم *</Label>
              <Input
                className="mt-1"
                value={studentName}
                onChange={e => setStudentName(e.target.value)}
                placeholder="اكتب اسمك ثلاثياً"
              />
            </div>
            {groupStudents.length > 0 && (
              <div>
                <Label>أو اختر اسمك من قائمة المجموعة</Label>
                <Select onValueChange={val => {
                  const s = groupStudents.find(x => x.id === val)
                  if (s) setStudentName(s.name)
                }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر من الطلاب" /></SelectTrigger>
                  <SelectContent>
                    {groupStudents.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>الصف *</Label>
              <Select
                value={gradeId || undefined}
                disabled={Boolean(exam.gradeId)}
                onValueChange={val => {
                  setGradeId(val)
                  if (!exam.groupId) setGroupId("")
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الصف" /></SelectTrigger>
                <SelectContent>
                  {grades.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>المجموعة *</Label>
              <Select
                value={groupId || undefined}
                disabled={!gradeId || Boolean(exam.groupId)}
                onValueChange={setGroupId}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={gradeId ? "اختر المجموعة" : "اختر الصف أولاً"} />
                </SelectTrigger>
                <SelectContent>
                  {!gradeId ? (
                    <SelectItem value="__none" disabled>اختر الصف أولاً</SelectItem>
                  ) : groups.length === 0 ? (
                    <SelectItem value="__none" disabled>لا توجد مجموعات في هذا الصف</SelectItem>
                  ) : (
                    groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={startExam} className="w-full bg-gradient-to-r from-indigo-500 to-purple-600">
              بدء الاختبار
            </Button>
          </div>
        )}

        {step === "exam" && (
          <div className="space-y-5">
            {exam.questions.map((question, qi) => {
              const meta = getQuestionTypeMeta(question.questionType)
              return (
                <section key={question.id} className="bg-white dark:bg-gray-900 rounded-2xl border p-5 space-y-4">
                  <h3 className="font-extrabold flex items-center gap-2">
                    <span className="text-white text-xs px-2 py-1 rounded" style={{ background: meta.accent }}>
                      {meta.paperMark}
                    </span>
                    السؤال {ARABIC_ORDINALS[qi] || qi + 1}: {getQuestionHeader(question)}
                  </h3>
                  {question.subQuestions.map((sq, si) => (
                    <div key={sq.id} className="border-t border-dashed pt-3 space-y-2">
                      <p className="font-semibold">{si + 1} – {sq.questionText}</p>

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
                    </div>
                  ))}
                </section>
              )
            })}

            <div className="sticky bottom-4 bg-white/90 dark:bg-gray-900/90 backdrop-blur rounded-2xl border p-4 flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                {unanswered > 0 ? `تبقّى ${unanswered} سؤال بدون إجابة` : "تمت الإجابة على كل الأسئلة"}
              </p>
              <Button onClick={finishExam} className="bg-gradient-to-r from-emerald-500 to-teal-600">
                إنهاء الاختبار وإظهار النتيجة
              </Button>
            </div>
          </div>
        )}

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
            <p className="text-sm text-gray-400">إعداد {TEACHER_NAME}</p>
            <Link href="/"><Button variant="outline">العودة للصفحة الرئيسية</Button></Link>
          </div>
        )}

        <TeacherSignature />
      </main>
    </div>
  )
}
