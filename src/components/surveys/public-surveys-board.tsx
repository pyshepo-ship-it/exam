"use client"

import React, { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import toast from "react-hot-toast"
import { ClipboardList, Send, CalendarClock, CheckCircle2, EyeOff, ListChecks } from "lucide-react"
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
import {
  canEditAnswer,
  deadlineLabel,
  firstUnanswered,
  guestFields,
  hasAnsweredCurrent,
  hasAnsweredOlderVersion,
  isSurveyOpen,
  surveyVersion,
  validateGuestInput,
} from "@/lib/surveys"

/**
 * لوحة الاستبيانات العامة في الصفحة الرئيسية.
 *
 * تجربة الزائر مثل استبيانات Google: يفتح الاستبيان ويجيب — بلا تسجيل دخول
 * وبلا رقم هاتف. الاسم حقل اختياري (يخفيه المعلم أو يجعله مطلوبًا)، ورقم
 * الهاتف لا يظهر إلا إن اختار المعلم صراحةً طريقة «برقم الهاتف».
 *
 * منع الرد المكرر يتم في الخلفية بلا أي عبء على الطالب: بطاقة عشوائية لهذا
 * المتصفح + كشف من الخادم للردود القادمة من نفس الشبكة والمتصفح (ترحيل 023).
 * لا تُعرض للطالب أي تفاصيل عن هذه الآلية — لا يعنيه منها شيء.
 */
export function PublicSurveysBoard() {
  const [surveys, setSurveys] = useState<Survey[]>([])
  /** مفاتيح «أجبت»: معرّف الاستبيان + رقم نسخته */
  const [answeredKeys, setAnsweredKeys] = useState<string[]>([])
  const [available, setAvailable] = useState(false)

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
    setAnsweredKeys(res.answeredKeys || [])
  }, [])

  useEffect(() => {
    load("")
  }, [load])

  const openSurvey = (survey: Survey) => {
    setActive(survey)
    setAnswers({})
    setGuestName("")
    setGuestPhone("")
  }

  const send = async () => {
    if (!active) return
    const missing = firstUnanswered(active, answers)
    if (missing) {
      toast.error(`أجب أولًا على السؤال: ${missing.title}`)
      return
    }
    // نفس قواعد الخادم: لا يُطلب إلا ما اختاره المعلم فعلًا
    const invalid = validateGuestInput(active, { name: guestName, phone: guestPhone })
    if (invalid) {
      toast.error(invalid)
      return
    }
    if (hasAnsweredCurrent(active, answeredKeys) && !canEditAnswer(active, true)) {
      toast.error("أجبت على هذا الاستبيان من قبل")
      return
    }

    const payload: Record<string, SurveyAnswer> = {}
    for (const q of active.questions) {
      const a = answers[q.id]
      if (a) payload[q.id] = a
    }

    const fields = guestFields(active)
    setBusy(true)
    const res = await submitSurveyResponse({
      surveyId: active.id,
      answers: payload,
      guestName: fields.showName ? guestName.trim() : "",
      guestPhone: fields.showPhone ? guestPhone.trim() : "",
    })
    setBusy(false)

    if (!res.ok) {
      toast.error(res.error || "تعذر إرسال الاستبيان")
      return
    }
    toast.success(res.code === "updated" ? "تم تحديث إجابتك" : "وصلت إجابتك — شكرًا لك 🌟")
    setAnsweredKeys(prev => {
      const k = `${active.id}:${res.version ?? surveyVersion(active)}`
      return prev.includes(k) ? prev : [...prev, k]
    })
    load()
    setActive(null)
    setAnswers({})
    setGuestName("")
    setGuestPhone("")
  }

  // بلا Supabase أو بلا استبيانات منشورة للزوار: لا يظهر القسم إطلاقًا
  if (!available || surveys.length === 0) return null

  const activeFields = active ? guestFields(active) : null

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
          <ClipboardList className="w-5 h-5 text-white" />
        </div>
        استبيانات
      </h2>

      <p className="text-sm text-gray-600 dark:text-gray-300">رأيك يهمنا — الإجابة تأخذ دقيقة بلا تسجيل</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {surveys.map((survey, index) => {
          // «تمت الإجابة» مربوط بالنسخة الحالية من الأسئلة لا بالاستبيان نفسه
          const answered = hasAnsweredCurrent(survey, answeredKeys)
          const answeredOlder = !answered && hasAnsweredOlderVersion(survey, answeredKeys)
          const editable = answered && canEditAnswer(survey, true)
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
                  {answered ? "تمت الإجابة" : answeredOlder ? "أسئلة جديدة" : open ? "مفتوح" : "منتهٍ"}
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

              <div className="mt-auto flex flex-wrap items-center gap-2">
                {open && !answered && (
                  <Button
                    size="sm"
                    onClick={() => openSurvey(survey)}
                    className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
                  >
                    {answeredOlder ? "الإجابة على الأسئلة الجديدة" : "الإجابة الآن"}
                    <Send className="h-3.5 w-3.5 mr-1" />
                  </Button>
                )}
                {open && answered && editable && (
                  <Button size="sm" variant="outline" onClick={() => openSurvey(survey)}>
                    تعديل إجابتي
                    <Send className="h-3.5 w-3.5 mr-1" />
                  </Button>
                )}
                {!open && <p className="text-xs text-gray-500">انتهى موعد هذا الاستبيان</p>}
                {answered && (
                  <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    وصلت إجابتك
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
          {active && activeFields && (
            <>
              <DialogHeader>
                <DialogTitle>{active.title}</DialogTitle>
                <DialogDescription>
                  {active.description || "أجب على الأسئلة ثم اضغط إرسال"} • {active.questions.length} سؤال
                </DialogDescription>
              </DialogHeader>

              {(activeFields.showName || activeFields.showPhone) && (
                <div
                  className={`grid grid-cols-1 ${
                    activeFields.showName && activeFields.showPhone ? "sm:grid-cols-2" : ""
                  } gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3`}
                >
                  {activeFields.showName && (
                    <div>
                      <Label className="text-xs">{activeFields.requireName ? "اسمك" : "اسمك (اختياري)"}</Label>
                      <Input
                        placeholder="اكتب اسمك"
                        value={guestName}
                        onChange={e => setGuestName(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  )}
                  {activeFields.showPhone && (
                    <div>
                      <Label className="text-xs">رقم الهاتف</Label>
                      <Input
                        inputMode="tel"
                        dir="ltr"
                        placeholder="01xxxxxxxxx"
                        value={guestPhone}
                        onChange={e => setGuestPhone(e.target.value)}
                        className="mt-1 text-left"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="py-2">
                <SurveyFillForm survey={active} answers={answers} onChange={setAnswers} disabled={busy} />
              </div>

              {active.anonymous && (
                <p className="text-[11px] text-gray-500 flex items-center gap-1">
                  <EyeOff className="h-3.5 w-3.5" />
                  إجاباتك بلا اسم
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
