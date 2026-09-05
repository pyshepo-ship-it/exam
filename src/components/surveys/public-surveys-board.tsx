"use client"

import React, { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import toast from "react-hot-toast"
import { ClipboardList, Send, CalendarClock, CheckCircle2, EyeOff, Search, ListChecks, Lock } from "lucide-react"
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
  hasAnsweredCurrent,
  hasAnsweredOlderVersion,
  isSurveyOpen,
  normalizeSurveyPhone,
  surveyVersion,
} from "@/lib/surveys"

/**
 * لوحة الاستبيانات العامة في الصفحة الرئيسية.
 *
 * تظهر فقط الاستبيانات المنشورة والمفتوحة للزوار، ويجيب الزائر باسمه ورقم
 * هاتفه (بلا تسجيل دخول). إن أُدخل رقم هاتف مطابق لطالب مسجّل تظهر له أيضًا
 * الاستبيانات الموجّهة لصفه أو لمجموعته، وتُربط إجابته بحسابه تلقائيًا في
 * دالة السحابة.
 *
 * **ردّ واحد فقط لكل شخص في كل نسخة من الاستبيان** — لا يُقبل رد ثانٍ حتى في
 * الاستبيان المجهول: رقم الهاتف مطلوب دائمًا ويُستخدم لحساب «بصمة» تمنع
 * التكرار في قاعدة البيانات دون أن يُخزَّن مع الرد. ومن أجاب على نسخة أقدم
 * (عدّل المعلم الأسئلة) تُفتح له الإجابة من جديد.
 */
export function PublicSurveysBoard() {
  const [surveys, setSurveys] = useState<Survey[]>([])
  /** مفاتيح «أجبت»: معرّف الاستبيان + رقم نسخته */
  const [answeredKeys, setAnsweredKeys] = useState<string[]>([])
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
    setAnsweredKeys(res.answeredKeys || [])
  }, [])

  useEffect(() => {
    load("")
  }, [load])

  const searchByPhone = async () => {
    const phone = normalizeSurveyPhone(lookupPhone)
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
    // الرقم مطلوب في كل الحالات (حتى المجهول): هو ما يمنع الرد المكرر
    setGuestPhone(lookupPhone.trim())
  }

  const send = async () => {
    if (!active) return
    const missing = firstUnanswered(active, answers)
    if (missing) {
      toast.error(`أجب أولًا على السؤال: ${missing.title}`)
      return
    }
    const anonymous = active.anonymous === true
    // الرقم إلزامي دائمًا — بدونه لا يمكن ضمان عدم تكرار الرد (يرفضه الخادم كذلك)
    // تُوحَّد الأرقام العربية-الهندية قبل التحقق والإرسال، وإلا ضاعت البصمة
    // ومنعُ التكرار الذي يعتمد عليها
    const digits = normalizeSurveyPhone(guestPhone)
    if (!digits) {
      toast.error("اكتب رقم هاتف صحيح (11 رقمًا) — يُستخدم لمنع تكرار إجابتك فقط")
      return
    }
    if (!anonymous && guestName.trim().length < 2) {
      toast.error("اكتب اسمك كاملًا")
      return
    }
    if (hasAnsweredCurrent(active, answeredKeys)) {
      toast.error("أجبت على هذا الاستبيان بالفعل — لا يمكن إرسال رد آخر على نفس الأسئلة")
      return
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
      // الرقم يُرسل دائمًا: الخادم يحسب منه البصمة ثم يتخلص منه في المجهول
      guestPhone: digits,
    })
    setBusy(false)

    if (!res.ok) {
      toast.error(res.error || "تعذر إرسال الاستبيان")
      return
    }
    toast.success(
      res.code === "updated"
        ? "تم تحديث إجابتك — ردّك ما زال واحدًا ولا يُحسب مرتين"
        : "وصلت إجابتك للمعلم — شكرًا لك 🌟"
    )
    setAnsweredKeys(prev => {
      const k = `${active.id}:${res.version ?? surveyVersion(active)}`
      return prev.includes(k) ? prev : [...prev, k]
    })
    // الزائر لا يرى ردّه القديم: التحديث يستبدل كل الإجابات، فنعيد تحميل اللوحة
    load(lookupPhone.trim())
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
          <Label className="text-xs text-gray-500">رقم هاتفك (لاسترجاع إجاباتك)</Label>
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
                  {answered ? "تمت الإجابة — ردّ واحد" : answeredOlder ? "نسخة جديدة من الأسئلة" : open ? "مفتوح" : "منتهٍ"}
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
                    بلا اسم — رقمك لمنع التكرار فقط
                  </span>
                )}
                <span className="flex items-center gap-1 text-gray-400">
                  <Lock className="h-3.5 w-3.5" />
                  رد واحد لكل رقم • نسخة {surveyVersion(survey)}
                </span>
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
                {open && answered && editable && !survey.lockAfterSubmit && (
                  <Button size="sm" variant="outline" onClick={() => openSurvey(survey)}>
                    تصحيح إجابتي (يبقى ردًّا واحدًا)
                    <Send className="h-3.5 w-3.5 mr-1" />
                  </Button>
                )}
                {!open && (
                  <p className="text-xs text-gray-500">انتهى موعد هذا الاستبيان</p>
                )}
                {answered && (
                  <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    وصلنا ردّك بهذا الرقم ولا يُقبل رد آخر
                  </span>
                )}
                {answeredOlder && !answered && (
                  <span className="text-[11px] text-indigo-600">
                    تغيّرت أسئلة الاستبيان — إجابتك السابقة محفوظة على النسخة {Math.max(1, surveyVersion(survey) - 1)}
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

              <div className={`grid grid-cols-1 ${active.anonymous ? "sm:grid-cols-1" : "sm:grid-cols-2"} gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3`}>
                {!active.anonymous && (
                  <div>
                    <Label className="text-xs">الاسم *</Label>
                    <Input
                      placeholder="الاسم كما في كشف الحضور"
                      value={guestName}
                      onChange={e => setGuestName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                )}
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
                  {active.anonymous
                    ? "الاستبيان مجهول: لا يُحفظ اسمك ولا رقمك مع الإجابات — يُحسب من رقمك «بصمة» تمنع تكرار ردّك مرة أخرى فقط."
                    : "يُستخدم رقمك لربط إجابتك بحسابك إن كنت مسجلًا، ولمنع الرد المكرر على نفس الأسئلة."}
                </p>
              </div>

              <div className="py-2">
                <SurveyFillForm survey={active} answers={answers} onChange={setAnswers} disabled={busy} />
              </div>

              {active.anonymous && (
                <p className="text-[11px] text-amber-600 flex items-center gap-1">
                  <EyeOff className="h-3.5 w-3.5" />
                  استبيان مجهول: رقمك لا يُخزَّن مع الإجابات، ويُستخدم لمنع ردّ ثانٍ باسمك
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
