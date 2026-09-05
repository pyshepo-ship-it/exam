"use client"

/**
 * مراجعة الطالب للاختبار الإلكتروني.
 * - فتح المراجعة العام يسمح بعرض مفاتيح الأسئلة الموضوعية فقط.
 * - نتيجة المقال والتعليقات والتصحيح لا تظهر إطلاقاً قبل إطلاق المعلم لنتيجة المحاولة.
 */

import { useMemo, useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Eye, Loader2, Award, Hourglass, MessageSquare, BookOpenCheck } from "lucide-react"
import type { Exam, ExamAttempt, Question, SubQuestion } from "@/lib/data-storage"
import { getExams, isEssayQuestionForMode } from "@/lib/data-storage"
import { fetchPublicData } from "@/lib/supabase/sync"
import { isSupabaseConfigured } from "@/lib/supabase/client"
import { attemptNeedsResultRelease, effectiveAttemptScore } from "@/lib/portal-content"
import { gradeExam } from "@/lib/exam-grade"

interface ExamReviewDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  exam: Exam
  attempts: ExamAttempt[]
  studentName: string
}

/** لون شارة الدرجة حسب النسبة */
export function scoreColor(pct: number): string {
  if (pct >= 85) return "text-green-600 dark:text-green-400"
  if (pct >= 50) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

function answerLabel(question: Question, sq: SubQuestion, answer: ExamAttempt["answers"][string] | undefined): string {
  if (question.questionType === 1) {
    return sq.choices?.find(choice => choice.id === answer?.choiceId)?.choiceText || "لم تُجب"
  }
  if (question.questionType === 3) {
    return answer?.isTrue === true ? "صواب" : answer?.isTrue === false ? "خطأ" : "لم تُجب"
  }
  return answer?.text?.trim() || "لم تُجب"
}

type AnswerFeedback = NonNullable<ExamAttempt["answerFeedback"]>[string]

function correctAnswerLabel(question: Question, sq: SubQuestion, feedback?: AnswerFeedback): string {
  if (question.questionType === 1) {
    return sq.choices?.find(choice => choice.id === feedback?.choiceId || choice.isCorrect)?.choiceText || "—"
  }
  if (question.questionType === 3) {
    const value = typeof feedback?.isTrue === "boolean" ? feedback.isTrue : sq.isTrue
    return value === true ? "صواب" : value === false ? "خطأ" : "—"
  }
  if (question.questionType === 5) return feedback?.text || sq.corrections?.map(c => c.correctAnswer).filter(Boolean).join("، ") || "—"
  return feedback?.text || sq.correctAnswer?.trim() || "—"
}

/** يضيف فقط مفاتيحاً أصدرها RPC للجلسة ذاتها إلى نسخة المراجعة المحلية. */
function withServerFeedback(exam: Exam, feedback: NonNullable<ExamAttempt["answerFeedback"]>): Exam {
  if (Object.keys(feedback).length === 0) return exam
  return {
    ...exam,
    questions: exam.questions.map(question => ({
      ...question,
      subQuestions: question.subQuestions.map(sq => {
        const item = feedback[sq.id]
        if (!item) return sq
        if (question.questionType === 1) {
          return { ...sq, choices: sq.choices?.map(choice => ({ ...choice, isCorrect: choice.id === item.choiceId })) }
        }
        if (question.questionType === 3) return { ...sq, isTrue: item.isTrue }
        if (question.questionType === 5) {
          return {
            ...sq,
            corrections: (sq.corrections || []).map((correction, index) =>
              index === 0 ? { ...correction, correctAnswer: item.text || "" } : correction
            ),
          }
        }
        return { ...sq, correctAnswer: item.text }
      }),
    })),
  }
}

export function ExamReviewDialog({ open, onOpenChange, exam, attempts, studentName }: ExamReviewDialogProps) {
  const [fullExam, setFullExam] = useState<Exam | null>(null)
  const [loading, setLoading] = useState(false)

  // جلب الاختبار كاملاً عند الحاجة إلى مفتاح المراجعة فقط. النسخة المحلية تخدم كبديل.
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    ;(async () => {
      let found: Exam | undefined
      try {
        const publicData = await fetchPublicData()
        found = publicData?.exams.find(item => item.id === exam.id)
      } catch {
        // نتابع بالنسخة المتاحة داخل ذاكرة الجلسة.
      }
      // في الموقع المهيأ لا نرجع إلى نسخة ذاكرة خام، إذ قد تحمل مفاتيح
      // التصحيح. البديل المحلي مخصص للمعاينة بلا Supabase فقط.
      if (!found && !isSupabaseConfigured()) found = getExams().find(item => item.id === exam.id)
      if (alive) {
        setFullExam(found || exam)
        setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [open, exam])

  const theExam = fullExam || exam

  // إن وُجدت نتيجة معلنة نفضّلها دائماً؛ لا تختار محاولة مقالية معلّقة لمجرد أن جزأها الآلي أعلى.
  const best = useMemo(() => {
    if (!attempts.length) return null
    const visible = attempts.filter(attempt => !attemptNeedsResultRelease(attempt))
    const pool = visible.length > 0 ? visible : attempts
    return pool.reduce((currentBest, attempt) =>
      effectiveAttemptScore(attempt) >= effectiveAttemptScore(currentBest) ? attempt : currentBest
    )
  }, [attempts])

  const pendingResult = !!best && attemptNeedsResultRelease(best)
  const explicitlyReleased = !!best?.resultReleasedAt
  const score = best ? effectiveAttemptScore(best) : null
  const totalMarks = best?.totalMarks || theExam.totalMarks || 0
  const pct = score !== null && totalMarks > 0 ? Math.round((score / totalMarks) * 100) : null
  const answerFeedback = best?.answerFeedback || {}
  const gradedExam = useMemo(() => withServerFeedback(theExam, answerFeedback), [theExam, answerFeedback])
  const grade = useMemo(() => best ? gradeExam(gradedExam, best.answers) : null, [gradedExam, best])
  const detailById = useMemo(() => new Map(grade?.details.map(item => [item.subQuestionId, item]) || []), [grade])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-3xl max-h-[92vh] overflow-y-auto p-4 sm:p-6" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Eye className="w-5 h-5 text-indigo-600" />
            نتيجة ومراجعة: {theExam.title}
          </DialogTitle>
          <DialogDescription>
            {pendingResult
              ? "إجابتك المقالية بانتظار مراجعة المعلم. لا تظهر الدرجة النهائية أو تعليق المعلم قبل الإطلاق."
              : theExam.reviewOpen
              ? "تستطيع الآن مراجعة إجاباتك والتغذية الراجعة المتاحة وفق إعدادات الاختبار."
              : "هذه هي النتيجة والتغذية الراجعة التي أطلقها المعلم لهذه المحاولة."}
          </DialogDescription>
        </DialogHeader>

        {best ? (
          pendingResult ? (
            <div className="rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5 text-center text-amber-800 dark:text-amber-200">
              <Hourglass className="mx-auto mb-2 h-8 w-8" />
              <p className="font-extrabold">النتيجة النهائية قيد المراجعة</p>
              {best.autoTotal && best.autoTotal > 0 ? (
                <p className="mt-1 text-sm">الجزء المصحح تلقائياً: {typeof best.autoScore === "number" ? best.autoScore : best.score} / {best.autoTotal}</p>
              ) : (
                <p className="mt-1 text-sm">سيعلن المعلم الدرجة مع التعليقات والتصحيح بعد الانتهاء من المراجعة.</p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-gradient-to-l from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 p-5 text-center">
              <div className="flex items-center justify-center gap-2 text-sm font-bold text-indigo-500 mb-1">
                <Award className="w-4 h-4" />
                درجتك {explicitlyReleased ? "المُعلنة" : "في هذا الاختبار"}
              </div>
              <div className={`text-5xl font-black ${scoreColor(pct ?? 0)}`} dir="ltr">
                {score} <span className="text-2xl text-gray-400">/ {totalMarks || "—"}</span>
              </div>
              <div className="mt-1 space-y-0.5">
                {pct !== null && <p className={`text-xl font-extrabold ${scoreColor(pct)}`}>{pct}%</p>}
                <p className="text-xs text-gray-500">
                  {attempts.length > 1 ? `أفضل محاولة معلنة من ${attempts.filter(attempt => !attemptNeedsResultRelease(attempt)).length || 1} محاولات — ${studentName}` : studentName}
                  {best.manualOverride ? " • درجة معدلة من المعلم" : ""}
                </p>
              </div>
            </div>
          )
        ) : (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-300 text-center font-bold">
            لم تؤدِ هذا الاختبار بعد.
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin ml-2" />
            جاري تحميل أسئلة المراجعة...
          </div>
        ) : (
          <div className="space-y-4">
            {theExam.questions.map((question, questionIndex) => {
              const isManualQuestion = question.questionType === 4 || (
                !!theExam.onlineExamMode && isEssayQuestionForMode(question, theExam.onlineExamMode)
              )
              return (
                <section key={question.id} className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800/70 px-3 sm:px-4 py-2.5 flex items-start gap-2">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">{questionIndex + 1}</span>
                    <p className="min-w-0 flex-1 font-bold text-sm text-gray-900 dark:text-white leading-relaxed">{question.headerText}</p>
                    <span className="shrink-0 text-[11px] text-gray-400 font-bold">
                      {question.subQuestions.reduce((sum, sq) => sum + (sq.marks || 0), 0)} درجة
                    </span>
                  </div>
                  <div className="p-3 space-y-3">
                    {question.subQuestions.map((sq, subIndex) => {
                      const answer = best?.answers[sq.id]
                      const review = answer?.review
                      const detail = detailById.get(sq.id)
                      const feedback = answerFeedback[sq.id]
                      // المفتاح لا يظهر إلا إذا أصدره الخادم لهذه الجلسة وفق
                      // afterEach / atEnd. المعاينة المحلية فقط تحفظ التوافق القديم.
                      const showCorrectKey = !isManualQuestion && (
                        !!feedback || (!isSupabaseConfigured() && !!theExam.reviewOpen && correctAnswerLabel(question, sq) !== "—")
                      )
                      const showTeacherFeedback = explicitlyReleased && !!review
                      const showModelAnswer = explicitlyReleased && isManualQuestion && !!(review?.correction || sq.correctAnswer)
                      const myAnswer = answerLabel(question, sq, answer)
                      const answered = myAnswer !== "لم تُجب"
                      // لا نلوّن إجابة إلا حين يكون مفتاح تصحيحها متاحاً فعلاً:
                      // صحيحة = أخضر، خاطئة = أحمر مع عرض الإجابة الصحيحة تحتها.
                      const verdict: "correct" | "wrong" | "unknown" =
                        showCorrectKey && detail?.auto ? (detail.correct ? "correct" : "wrong") : "unknown"
                      return (
                        <article key={sq.id} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3 space-y-2">
                          {(sq.questionText || question.subQuestions.length > 1) && (
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
                              {question.subQuestions.length > 1 ? `${subIndex + 1}. ` : ""}{sq.questionText || "السؤال"}
                            </p>
                          )}
                          {best && (
                            <div className={`rounded-lg border px-3 py-2 text-sm ${
                              verdict === "correct"
                                ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100"
                                : verdict === "wrong"
                                ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-100"
                                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                            }`}>
                              <div className="flex items-start gap-2">
                                {verdict === "correct" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                                {verdict === "wrong" && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />}
                                <p className="min-w-0 flex-1">
                                  <span className="font-bold">إجابتك: </span>
                                  <span className="whitespace-pre-wrap">{myAnswer}</span>
                                </p>
                                {verdict !== "unknown" && (
                                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white ${
                                    verdict === "correct" ? "bg-emerald-600" : "bg-red-600"
                                  }`}>
                                    {verdict === "correct" ? "إجابة صحيحة" : answered ? "إجابة خاطئة" : "بدون إجابة"}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* المفتاح يظهر تحت الإجابة الخاطئة مباشرة، ولا نكرره حين تكون صحيحة */}
                          {showCorrectKey && verdict !== "correct" && (
                            <div className="flex items-start gap-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                              <span><strong>الإجابة الصحيحة:</strong> {correctAnswerLabel(question, sq, feedback)}</span>
                            </div>
                          )}

                          {isManualQuestion && pendingResult && (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">بانتظار تصحيح المعلم</Badge>
                          )}

                          {explicitlyReleased && isManualQuestion && (
                            <div className="flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-indigo-300">
                              <Award className="h-4 w-4" />
                              درجتك في هذه الإجابة: {typeof review?.awardedMarks === "number" ? review.awardedMarks : 0} / {detail?.marks || sq.marks || 0}
                            </div>
                          )}

                          {showTeacherFeedback && review.comment && (
                            <div className="flex items-start gap-2 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-sm text-sky-900 dark:text-sky-100">
                              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
                              <div><strong>تعليق المعلم:</strong><p className="mt-0.5 whitespace-pre-wrap">{review.comment}</p></div>
                            </div>
                          )}

                          {showModelAnswer && (
                            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
                              <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0" />
                              <div><strong>التصحيح أو الإجابة النموذجية:</strong><p className="mt-0.5 whitespace-pre-wrap">{review?.correction || sq.correctAnswer}</p></div>
                            </div>
                          )}
                        </article>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        <div className="flex justify-start pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
