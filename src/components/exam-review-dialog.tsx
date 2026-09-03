"use client"

/**
 * حوار مراجعة الاختبار — يظهر للطالب بعد أن يفتح المعلم «المراجعة للجميع»
 * يرى الطالب: أسئلة الاختبار، إجابته، الإجابة الصحيحة، ودرجته بشكل واضح
 */

import { useMemo, useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, Eye, Loader2, Award } from "lucide-react"
import type { Exam, ExamAttempt, Question, SubQuestion } from "@/lib/data-storage"
import { getExams } from "@/lib/data-storage"
import { fetchPublicData } from "@/lib/supabase/sync"
import { effectiveAttemptScore } from "@/lib/portal-content"

interface ExamReviewDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  exam: Exam
  attempts: ExamAttempt[]
  studentName: string
}

const norm = (s: string) => (s || "").trim().replace(/\s+/g, " ").toLowerCase()

/** لون شارة الدرجة حسب النسبة */
export function scoreColor(pct: number): string {
  if (pct >= 85) return "text-green-600 dark:text-green-400"
  if (pct >= 50) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

export function ExamReviewDialog({ open, onOpenChange, exam, attempts, studentName }: ExamReviewDialogProps) {
  const [fullExam, setFullExam] = useState<Exam | null>(null)
  const [loading, setLoading] = useState(false)

  // جلب الاختبار كاملاً (بمفاتيح الإجابات) — من Supabase أولاً ثم ذاكرة الجلسة
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    ;(async () => {
      let found: Exam | undefined
      try {
        const pub = await fetchPublicData()
        found = pub?.exams.find(e => e.id === exam.id)
      } catch { /* تجاهل — نجرب الكاش */ }
      if (!found) found = getExams().find(e => e.id === exam.id)
      if (alive) {
        setFullExam(found || exam)
        setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [open, exam])

  const theExam = fullExam || exam

  // أفضل محاولة (الأعلى درجة بعد التعديل اليدوي إن وجد)
  const best = useMemo(() => {
    if (!attempts.length) return null
    return attempts.reduce((a, b) => (effectiveAttemptScore(b) >= effectiveAttemptScore(a) ? b : a))
  }, [attempts])

  const totalMarks =
    theExam.totalMarks ||
    theExam.questions.reduce((s, q) => s + q.subQuestions.reduce((x, sq) => x + (sq.marks || 0), 0), 0) ||
    1
  const score = best ? effectiveAttemptScore(best) : null
  const pct = score !== null ? Math.round((score / totalMarks) * 100) : null
  const answers = best?.answers || {}

  // عرض إجابة الطالب والصحيحة لسؤال فرعي
  const answerRows = (q: Question, sq: SubQuestion) => {
    const his = answers[sq.id] || {}
    const rows: { label: string; value: string; correct: boolean | null }[] = []

    if (q.questionType === 1) {
      const correct = sq.choices?.find(c => c.isCorrect)
      const hisChoice = sq.choices?.find(c => c.id === his.choiceId)
      rows.push({ label: "إجابتك", value: hisChoice ? hisChoice.choiceText : "لم تُجب", correct: hisChoice ? !!correct && hisChoice.id === correct.id : false })
      rows.push({ label: "الإجابة الصحيحة", value: correct ? correct.choiceText : "—", correct: true })
    } else if (q.questionType === 2) {
      const hisText = (his.text || "").trim()
      rows.push({ label: "إجابتك", value: hisText || "لم تُجب", correct: hisText ? norm(hisText) === norm(sq.correctAnswer || "") : false })
      rows.push({ label: "الإجابة الصحيحة", value: sq.correctAnswer || "—", correct: true })
    } else if (q.questionType === 3) {
      const hisVal = his.isTrue
      rows.push({ label: "إجابتك", value: hisVal === true ? "صواب ✓" : hisVal === false ? "خطأ ✗" : "لم تُجب", correct: hisVal === undefined || hisVal === null ? false : hisVal === !!sq.isTrue })
      rows.push({ label: "الإجابة الصحيحة", value: sq.isTrue ? "صواب ✓" : "خطأ ✗", correct: true })
    } else {
      // تصحيح الخطأ / مقالي — مرجع التصحيح
      if (sq.corrections && sq.corrections.length > 0) {
        for (const c of sq.corrections) {
          rows.push({ label: `التصحيح: «${c.wrongWord}»`, value: c.correctAnswer, correct: null })
        }
      } else {
        rows.push({ label: "مرجع الإجابة", value: sq.correctAnswer || "يُصحح يدوياً من المعلم", correct: null })
      }
      const hisText4 = (his.text || "").trim()
      if (hisText4) rows.push({ label: "إجابتك", value: hisText4, correct: null })
    }
    return rows
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Eye className="w-5 h-5 text-indigo-600" />
            مراجعة الاختبار: {theExam.title}
          </DialogTitle>
          <DialogDescription>
            فُتحت المراجعة للجميع بقرار من المعلم — يمكنك الاطلاع على الأسئلة والإجابات الصحيحة في أي وقت
          </DialogDescription>
        </DialogHeader>

        {/* الدرجة — واضحة وكبيرة */}
        {score !== null ? (
          <div className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-gradient-to-l from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 p-5 text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-bold text-indigo-500 mb-1">
              <Award className="w-4 h-4" />
              درجتك في هذا الاختبار
            </div>
            <div className={`text-5xl font-black ${scoreColor(pct ?? 0)}`} dir="ltr">
              {score} <span className="text-2xl text-gray-400">/ {totalMarks}</span>
            </div>
            <div className="mt-1 space-y-0.5">
              <p className={`text-xl font-extrabold ${scoreColor(pct ?? 0)}`}>{pct}%</p>
              <p className="text-xs text-gray-500">
                {attempts.length > 1 ? `أفضل محاولة من ${attempts.length} محاولات — ${studentName}` : studentName}
                {best?.manualOverride ? " • درجة معدلة من المعلم" : ""}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-300 text-center font-bold">
            لم تؤدِ هذا الاختبار — هذه الأجوبة الصحيحة للمراجعة
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin ml-2" />
            جاري تحميل الأسئلة...
          </div>
        ) : (
          <div className="space-y-4">
            {theExam.questions.map((q, qi) => (
              <div key={q.id} className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800/70 px-4 py-2.5 flex items-start gap-2">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">{qi + 1}</span>
                  <p className="font-bold text-sm text-gray-900 dark:text-white leading-relaxed">{q.headerText}</p>
                  <span className="shrink-0 text-[11px] text-gray-400 font-bold">
                    {q.subQuestions.reduce((x, sq) => x + (sq.marks || 0), 0)} درجة
                  </span>
                </div>
                <div className="p-3 space-y-2.5">
                  {q.subQuestions.map(sq => (
                    <div key={sq.id} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2.5 space-y-1.5">
                      {(q.questionType !== 1 && (sq.questionText || sq.parts)) && (
                        <p className="text-xs font-bold text-gray-600 dark:text-gray-300">{sq.questionText || "(أكمل / صواب وخطأ)"}</p>
                      )}
                      {answerRows(q, sq).map((r, ri) => (
                        <div key={ri} className="flex items-start justify-between gap-2 text-xs">
                          <span className={`font-bold shrink-0 ${r.correct === true ? "text-green-600 dark:text-green-400" : r.correct === false ? "text-red-600 dark:text-red-400" : "text-gray-500"}`}>
                            {r.correct === true ? <CheckCircle2 className="w-3.5 h-3.5 inline ml-1 -mt-0.5" /> : r.correct === false ? <XCircle className="w-3.5 h-3.5 inline ml-1 -mt-0.5" /> : ""}
                            {r.label}:
                          </span>
                          <span className={`text-left ${r.correct === false ? "text-red-600 dark:text-red-400 line-through" : "text-gray-700 dark:text-gray-200"}`}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-start pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق المراجعة</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
