"use client"

import React, { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import toast from "react-hot-toast"
import { ClipboardList, Send, CalendarClock, CheckCircle2, EyeOff, Search, ListChecks } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Survey, SurveyAnswer } from "@/lib/data-storage"
import { fetchPublicSurveys, submitSurveyResponse } from "@/lib/supabase/sync"
import { SurveyFillForm } from "./survey-fill-form"
import { deadlineLabel, firstUnanswered, isSurveyOpen } from "@/lib/surveys"

/**
 * لوحة الاستبيانات العامة في الصفحة الرئيسية.
 *
 * تظهر فقط الاستبيانات المنشورة والمفتوحة للزوار، ويجيب الزائر باسمه ورقم
 * هاتفه (بلا تسجيل دخول). إن أُدخل رقم هاتف مطابق لطالب مسجّل تظهر له أيضًا
 * الاستبيانات الموجّهة لصفه أو لمجموعته، وتُربط إجابته بحسابه تلقائيًا في
 * دالة السحابة. الاستبيانات المجهولة لا تطلب اسمًا ولا رقمًا.
 */
export function PublicSurveysBoard() {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [answeredIds, setAnsweredIds] = useState<string[]>([])
  const [available, setAvailable] = useState(false)

  const [lookupPhone, setLookupPhone] = useState("")
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupNote, setLookupNote] = useState("")

  const [active, setActive] = useState<Survey | null>(null)
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>({})
  const [guestName, setGuestName] = useState("")
  const [guestPhone, setGuestPhone] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (phone?: string) => {
    const res = await fetchPublicSurveys(phone || "")
    setAvailable(res.available)
    if (!res.available) return
    setSurveys(res.surveys as Survey[])
    setAnsweredIds(res.answeredSurveyIds || [])
  }, [])

  useEffect(() => {
    load("")
  }, [load])

  const searchByPhone = async () => {
    const phone = lookupPhone.trim()
    setLookupBusy(true)
    await load(phone)
    setLookupBusy(false)
    if (!phone) {
      setLookupNote("")
      return
    }
    setLookupNote("إن كان رقمك مسجلًا عندنا فستظهر لك استبيانات صفك ومجموعتك أيضًا")
  }

  const openSurvey = (survey: Survey) => {
    setActive(survey)
    setAnswers({})
    setGuestPhone(survey.anonymous ? "" : lookupPhone.trim())
  }

  const send = async () => {
    if (!active) return
    const missing = firstUnanswered(active, answers)
    if (missing) {
      toast.error(`أجب أولًا على السؤال: ${missing.title}`)
      return
    }
    const anonymous = active.anonymous === true
    if (!anonymous) {
      if (guestName.trim().length < 2) {
        toast.error("اكتب اسمك كاملًا")
        return
      }
      const digits = guestPhone.replace(/\D/g, "")
      if (digits.length < 10) {
        toast.error("اكتب رقم هاتف صحيح (11 رقمًا)")
        return
      }
    }

    const payload: Record<string, SurveyAnswer> = {}
    for (const q of active.questions) {
      const a = answers[q.id]
      if (a) payload[q.id] = a
    }

    setBusy(true)
    const res = await submitSurveyResponse({
      surveyId: active.id,
      answers: payload,
      guestName: anonymous ? "" : guestName.trim(),
      guestPhone: anonymous ? "" : guestPhone.trim(),
    })
    setBusy(false)

    if (!res.ok) {
      toast.error(res.error || "تعذر إرسال الاستبيان")
      return
    }
    toast.success("وصلت إجابتك للمعلم — شكرًا لك 🌟")
    setAnsweredIds(prev => (prev.includes(active.id) ? prev : [...prev, active.id]))
    setActive(null)
    setAnswers({})
    setGuestName("")
  }

  // بلا Supabase أو بلا استبيانات منشورة للزوار: لا يظهر القسم إطلاقًا
  if (!available || surveys.length === 0) return null

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
          <ClipboardList className="w-5 h-5 text-white" />
        </div>
        استبيانات
      </h2>

      <p className="text-sm text-gray-600 dark:text-gray-300">
        رأيك يهمنا — أجب باسمك ورقم هاتفك بدون تسجيل دخول
      </p>

      {/* البحث برقم الهاتف (اختياري) */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-3 flex flex-col sm:flex-row sm:items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs text-gray-500">رقم هاتفك (اختياري)</Label>
          <Input
            inputMode="tel"
            dir="ltr"
            placeholder="01xxxxxxxxx"
            value={lookupPhone}
            onChange={e => setLookupPhone(e.target.value)}
            className="mt-1 text-left"
          />
        </div>
        <Button variant="outline" onClick={searchByPhone} disabled={lookupBusy} className="shrink-0">
          <Search className="w-4 h-4 ml-1" />
          {lookupBusy ? "جارٍ البحث..." : "استبياناتي"}
        </Button>
        {lookupNote && <p className="text-[11px] text-gray-500 sm:max-w-[16rem]">{lookupNote}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {surveys.map((survey, index) => {
          const answered = answeredIds.includes(survey.id)
          const open = isSurveyOpen(survey)
          return (
            <motion.div
              key={survey.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-snug">{survey.title}</h3>
                <Badge
                  variant={answered ? "default" : "secondary"}
                  className={`text-[10px] shrink-0 ${answered ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
                >
                  {answered ? "تمت الإجابة" : open ? "مفتوح" : "منتهٍ"}
                </Badge>
              </div>

              {survey.description && (
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{survey.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                <span className="flex items-center gap-1">
                  <ListChecks className="h-3.5 w-3.5" />
                  {survey.questions.length} سؤال
                </span>
                <span className="flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {deadlineLabel(survey)}
                </span>
                {survey.anonymous && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <EyeOff className="h-3.5 w-3.5" />
                    بلا اسم
                  </span>
                )}
              </div>

              <div className="mt-auto flex items-center gap-2">
                {open ? (
                  <Button
                    size="sm"
                    onClick={() => openSurvey(survey)}
                    className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
                  >
                    {answered ? "شكراً — إجابة أخرى" : "الإجابة الآن"}
                    <Send className="h-3.5 w-3.5 mr-1" />
                  </Button>
                ) : (
                  <p className="text-xs text-gray-500">انتهى موعد هذا الاستبيان</p>
                )}
                {answered && open && (
                  <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    وصلنا ردك بهذا الرقم
                  </span>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* نافذة إجابة الزائر */}
      <Dialog open={active !== null} onOpenChange={open => !open && setActive(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>{active.title}</DialogTitle>
                <DialogDescription>
                  {active.description || "أجب على الأسئلة ثم اضغط إرسال"} • {active.questions.length} سؤال
                </DialogDescription>
              </DialogHeader>

              {!active.anonymous && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                  <div>
                    <Label className="text-xs">الاسم *</Label>
                    <Input
                      placeholder="الاسم كما في كشف الحضور"
                      value={guestName}
                      onChange={e => setGuestName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">رقم الهاتف *</Label>
                    <Input
                      inputMode="tel"
                      dir="ltr"
                      placeholder="01xxxxxxxxx"
                      value={guestPhone}
                      onChange={e => setGuestPhone(e.target.value)}
                      className="mt-1 text-left"
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 sm:col-span-2">
                    يُستخدم رقمك مرة واحدة لربط إجابتك بحسابك إن كنت مسجلًا، ولمنع الرد المكرر
                  </p>
                </div>
              )}

              <div className="py-2">
                <SurveyFillForm survey={active} answers={answers} onChange={setAnswers} disabled={busy} />
              </div>

              {active.anonymous && (
                <p className="text-[11px] text-amber-600 flex items-center gap-1">
                  <EyeOff className="h-3.5 w-3.5" />
                  استبيان مجهول: لا يُطلب اسمك ولا رقمك ولا يُسجَّلان مع الإجابات
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setActive(null)} disabled={busy}>
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
    </motion.section>
  )
}
