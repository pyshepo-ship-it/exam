"use client"

import React, { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { ClipboardList, CalendarClock, Send, CheckCircle2, EyeOff, RefreshCw, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Survey, SurveyAnswer, SurveyResponse } from "@/lib/data-storage"
import { fetchStudentSurveys, submitSurveyResponse } from "@/lib/supabase/sync"
import { SurveyFillForm } from "./survey-fill-form"
import { deadlineLabel, firstUnanswered, isSurveyOpen } from "@/lib/surveys"

/**
 * قسم الاستبيانات في حساب الطالب.
 *
 * القراءة والإرسال عبر دوال Supabase الآمنة بسرّ الجلسة فقط — لا تُقرأ جداول
 * الردود الخام، ولا يُخزَّن شيء محليًا (الإدراج في السحابة أولًا ثم ذاكرة الجلسة).
 */
export function StudentSurveysPanel({ token }: { token: string }) {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [responses, setResponses] = useState<SurveyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null)
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false)
      setUnavailable(true)
      return
    }
    setLoading(true)
    const res = await fetchStudentSurveys(token)
    if (!res) {
      setUnavailable(true)
      setLoading(false)
      return
    }
    setSurveys(res.surveys as Survey[])
    setResponses(res.responses as SurveyResponse[])
    setUnavailable(false)
    setLoading(false)
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const myResponse = (surveyId: string) => responses.find(r => r.surveyId === surveyId)

  const openSurvey = (survey: Survey) => {
    setActiveSurvey(survey)
    const existing = myResponse(survey.id)
    setAnswers(existing ? { ...(existing.answers || {}) } : {})
  }

  const send = async () => {
    if (!activeSurvey) return
    const missing = firstUnanswered(activeSurvey, answers)
    if (missing) {
      toast.error(`أجب أولًا على السؤال: ${missing.title}`)
      return
    }
    // تُرسل الإجابات المُجابة فقط — لا تُرسل مفاتيح فارغة
    const payload: Record<string, SurveyAnswer> = {}
    for (const q of activeSurvey.questions) {
      const a = answers[q.id]
      if (a) payload[q.id] = a
    }

    setBusy(true)
    const res = await submitSurveyResponse({ surveyId: activeSurvey.id, answers: payload, token })
    setBusy(false)

    if (!res.ok) {
      toast.error(res.error || "تعذر إرسال الاستبيان")
      return
    }
    toast.success("وصلت إجابتك للمعلم — شكرًا لك 🌟")
    setActiveSurvey(null)
    setAnswers({})
    load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-500">
        <RefreshCw className="h-4 w-4 animate-spin" />
        جارٍ تحميل الاستبيانات...
      </div>
    )
  }

  if (unavailable) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-6 text-center">
        <AlertCircle className="h-8 w-8 mx-auto text-amber-500" />
        <p className="mt-2 text-sm font-bold text-amber-700 dark:text-amber-300">تعذر تحميل الاستبيانات</p>
        <p className="mt-1 text-xs text-amber-600/80">
          تحقق من اتصالك بالإنترنت ثم أعد المحاولة — وإن استمرّت المشكلة أخبر المعلم
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5 ml-1" />
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  if (surveys.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
        <ClipboardList className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600" />
        <p className="mt-3 text-sm font-bold text-gray-600 dark:text-gray-300">لا توجد استبيانات موجّهة إليك الآن</p>
        <p className="mt-1 text-xs text-gray-500">سيصلك استبيان هنا حين ينشره المعلم لصفك أو لمجموعتك</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          رأيك يهمنا — الإجابات تصل المعلم مباشرة {surveys.some(s => s.anonymous) && "(بعضها مجهول الاسم)"}
        </p>
        <Button size="sm" variant="ghost" onClick={load} className="text-gray-500">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {surveys.map(survey => {
        const mine = myResponse(survey.id)
        const open = isSurveyOpen(survey)
        const answered = !!mine
        return (
          <div
            key={survey.id}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span className="truncate">{survey.title}</span>
                </h3>
                {survey.description && (
                  <p className="text-xs text-gray-500 mt-1">{survey.description}</p>
                )}
              </div>
              <Badge
                variant={answered ? "default" : open ? "secondary" : "outline"}
                className={`text-[10px] shrink-0 ${answered ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
              >
                {answered ? "تمت الإجابة" : open ? "بانتظار ردك" : "منتهٍ"}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] text-gray-500">
              <span className="flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                {deadlineLabel(survey)}
              </span>
              <span>•</span>
              <span>{survey.questions.length} سؤال</span>
              {survey.anonymous && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-amber-600">
                    <EyeOff className="h-3 w-3" />
                    إجابات مجهولة
                  </span>
                </>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              {!open && !answered && (
                <p className="text-[11px] text-gray-500">انتهى موعد هذا الاستبيان</p>
              )}
              {open && (
                <Button
                  size="sm"
                  onClick={() => openSurvey(survey)}
                  className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
                >
                  {answered && !survey.anonymous ? "تعديل إجابتي" : "الإجابة الآن"}
                  <Send className="h-3.5 w-3.5 mr-1" />
                </Button>
              )}
              {answered && !survey.anonymous && (
                <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  وصلت إجابتك
                </span>
              )}
            </div>
          </div>
        )
      })}

      {/* نافذة الإجابة */}
      <Dialog open={activeSurvey !== null} onOpenChange={open => !open && setActiveSurvey(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          {activeSurvey && (
            <>
              <DialogHeader>
                <DialogTitle>{activeSurvey.title}</DialogTitle>
                <DialogDescription>
                  {activeSurvey.description || "أجب على الأسئلة ثم اضغط إرسال"} •{" "}
                  {activeSurvey.questions.length} سؤال • {deadlineLabel(activeSurvey)}
                </DialogDescription>
              </DialogHeader>

              <div className="py-2">
                <SurveyFillForm survey={activeSurvey} answers={answers} onChange={setAnswers} disabled={busy} />
              </div>

              {activeSurvey.anonymous && (
                <p className="text-[11px] text-amber-600 flex items-center gap-1">
                  <EyeOff className="h-3.5 w-3.5" />
                  استبيان مجهول: لا يُسجَّل اسمك مع الإجابات
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setActiveSurvey(null)} disabled={busy}>
                  إغلاق
                </Button>
                <Button
                  onClick={send}
                  disabled={busy}
                  className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
                >
                  {busy ? "جارٍ الإرسال..." : "إرسال الإجابات"}
                  {!busy && <Send className="h-3.5 w-3.5 mr-1" />}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
