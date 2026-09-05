"use client"

import React, { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import {
  Plus,
  Pencil,
  Trash2,
  ClipboardList,
  BarChart3,
  Download,
  ArrowUp,
  ArrowDown,
  X,
  Users,
  Globe2,
  EyeOff,
  CalendarClock,
  ListChecks,
  Star,
  MessageSquareText,
  ToggleLeft,
  CheckSquare,
  ShieldCheck,
  History,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Grade,
  Student,
  Survey,
  SurveyQuestion,
  SurveyQuestionType,
  getSurveys,
  saveSurveys,
  getSurveyResponses,
} from "@/lib/data-storage"
import { onStoreUpdate } from "@/lib/memory-store"
import {
  audienceLabel,
  audienceStudentsCount,
  deadlineLabel,
  isSurveyOpen,
  nextVersionAfterEdit,
  questionTypeLabel,
  surveyCsv,
  surveyStats,
  surveyVersion,
  answerToText,
} from "@/lib/surveys"

/**
 * إدارة الاستبيانات من لوحة المعلم — تبويب داخل صفحة الإعلانات.
 * كل الحفظ يمرّ عبر saveSurveys (يُرفع إلى Supabase أولًا ثم ذاكرة الجلسة).
 */

interface QuestionDraft {
  id: string
  type: SurveyQuestionType
  title: string
  required: boolean
  options: string[]
  maxRating: number
  placeholder: string
}

interface SurveyDraft {
  title: string
  description: string
  audience: Survey["audience"]
  gradeId: string
  groupIds: string[]
  questions: QuestionDraft[]
  published: boolean
  allowGuests: boolean
  anonymous: boolean
  /** قفل الإجابة بعد الإرسال: لا تصحيح ولا تعديل (يبقى ردّ واحد دائمًا) */
  lockAfterSubmit: boolean
  /** قيمة حقل datetime-local (فارغ = بلا موعد نهائي) */
  deadlineLocal: string
}

const QUESTION_TYPES: { type: SurveyQuestionType; label: string; icon: React.ElementType; hint: string }[] = [
  { type: "single", label: "اختيار واحد", icon: CheckSquare, hint: "الطالب يختار إجابة واحدة" },
  { type: "multi", label: "اختيار متعدد", icon: ListChecks, hint: "يمكن اختيار أكثر من إجابة" },
  { type: "rating", label: "تقييم", icon: Star, hint: "من 1 إلى 5 (أو 10)" },
  { type: "yesno", label: "نعم / لا", icon: ToggleLeft, hint: "سؤال مغلق سريع" },
  { type: "text", label: "إجابة نصية", icon: MessageSquareText, hint: "اقتراح أو ملاحظة حرة" },
]

const emptyDraft = (): SurveyDraft => ({
  title: "",
  description: "",
  audience: "all",
  gradeId: "",
  groupIds: [],
  questions: [],
  published: false,
  allowGuests: false,
  anonymous: false,
  lockAfterSubmit: false,
  deadlineLocal: "",
})

const newQuestionId = () => `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

const newQuestion = (type: SurveyQuestionType): QuestionDraft => ({
  id: newQuestionId(),
  type,
  title: "",
  required: true,
  options: type === "single" || type === "multi" ? ["", ""] : [],
  maxRating: 5,
  placeholder: "",
})

/** تحويل حقل datetime-local إلى ISO (بافتراض توقيت الجهاز) */
function localToIso(v: string): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  if (isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/** تحويل ISO إلى قيمة حقل datetime-local */
function isoToLocal(v?: string): string {
  if (!v) return ""
  const d = new Date(v)
  if (isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SurveysManager({ grades, students }: { grades: Grade[]; students: Student[] }) {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [responses, setResponses] = useState<ReturnType<typeof getSurveyResponses>>([])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<SurveyDraft>(emptyDraft())

  const [resultsId, setResultsId] = useState<string | null>(null)

  const refresh = () => {
    setSurveys(getSurveys())
    setResponses(getSurveyResponses())
  }

  useEffect(() => {
    refresh()
    // تصل بيانات السحابة بعد تركيب الصفحة أحياناً — نحدِّث العرض عند كل تحديث للذاكرة
    const off = onStoreUpdate(() => refresh())
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allGroups = useMemo(
    () => grades.flatMap(g => g.groups.map(gr => ({ ...gr, gradeName: g.name }))),
    [grades]
  )

  const resultsSurvey = surveys.find(s => s.id === resultsId) || null
  const resultsVersion = resultsSurvey ? surveyVersion(resultsSurvey) : 1
  /** النتائج افتراضيًا على النسخة الحالية (حتى لا تختلط إجابات أسئلة قديمة جديدة) */
  const [resultsAllVersions, setResultsAllVersions] = useState(false)
  const allSurveyResponses = useMemo(
    () => responses.filter(r => r.surveyId === resultsId),
    [responses, resultsId]
  )
  const resultsResponses = useMemo(
    () =>
      resultsAllVersions
        ? allSurveyResponses
        : allSurveyResponses.filter(r => (Number(r.version) || 1) === resultsVersion),
    [allSurveyResponses, resultsAllVersions, resultsVersion]
  )
  const resultsOlderCount = allSurveyResponses.length - resultsResponses.length
  const resultsStats = useMemo(
    () => (resultsSurvey ? surveyStats(resultsSurvey, resultsResponses) : []),
    [resultsSurvey, resultsResponses]
  )

  // ---------------- المحرر ----------------

  const openNew = () => {
    setEditingId(null)
    setDraft(emptyDraft())
    setEditorOpen(true)
  }

  const openEdit = (survey: Survey) => {
    setEditingId(survey.id)
    setDraft({
      title: survey.title,
      description: survey.description || "",
      audience: survey.audience,
      gradeId: survey.gradeId || "",
      groupIds: survey.groupIds || [],
      questions: survey.questions.map(q => ({
        id: q.id || newQuestionId(),
        type: q.type,
        title: q.title,
        required: q.required !== false,
        options: q.options || [],
        maxRating: q.maxRating || 5,
        placeholder: q.placeholder || "",
      })),
      published: survey.published,
      allowGuests: survey.allowGuests === true,
      anonymous: survey.anonymous === true,
      lockAfterSubmit: survey.lockAfterSubmit === true,
      deadlineLocal: isoToLocal(survey.deadline),
    })
    setEditorOpen(true)
  }

  const patchQuestion = (qid: string, patch: Partial<QuestionDraft>) => {
    setDraft(prev => ({
      ...prev,
      questions: prev.questions.map(q => (q.id === qid ? { ...q, ...patch } : q)),
    }))
  }

  const moveQuestion = (index: number, dir: -1 | 1) => {
    setDraft(prev => {
      const next = [...prev.questions]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return { ...prev, questions: next }
    })
  }

  const saveSurvey = () => {
    const title = draft.title.trim()
    if (!title) {
      toast.error("اكتب عنوان الاستبيان")
      return
    }
    if (draft.audience === "grade" && !draft.gradeId) {
      toast.error("اختر الصف المستهدف")
      return
    }
    if (draft.audience === "group" && draft.groupIds.length === 0) {
      toast.error("اختر مجموعة واحدة على الأقل")
      return
    }

    const questions: SurveyQuestion[] = []
    for (const q of draft.questions) {
      if (!q.title.trim()) continue
      const options = (q.options || []).map(o => o.trim()).filter(Boolean)
      if ((q.type === "single" || q.type === "multi") && options.length < 2) {
        toast.error(`السؤال «${q.title.trim()}» يحتاج خيارين على الأقل`)
        return
      }
      questions.push({
        id: q.id,
        type: q.type,
        title: q.title.trim(),
        required: q.required,
        ...(q.type === "single" || q.type === "multi" ? { options } : {}),
        ...(q.type === "rating" ? { maxRating: q.maxRating } : {}),
        ...(q.type === "text" ? { placeholder: q.placeholder.trim() } : {}),
      })
    }

    if (questions.length === 0) {
      toast.error("أضف سؤالًا واحدًا على الأقل واكتب نصه")
      return
    }

    const now = new Date().toISOString()
    const existing = surveys.find(s => s.id === editingId)
    // تعديل الأسئلة = نسخة جديدة (نفس قاعدة المُشغِّل في قاعدة البيانات — ترحيل 022):
    // من أجابوا على الأسئلة القديمة يستطيعون الإجابة على الجديدة، بينما يبقى
    // «ردّ واحد لكل شخص» ممنوعًا داخل النسخة الواحدة.
    const nextVersion = nextVersionAfterEdit(existing, questions)
    const versionBumped = !!existing && nextVersion > surveyVersion(existing)
    const survey: Survey = {
      id: existing?.id || `sv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      description: draft.description.trim(),
      audience: draft.audience,
      ...(draft.audience === "grade" ? { gradeId: draft.gradeId } : {}),
      ...(draft.audience === "group" ? { groupIds: draft.groupIds } : {}),
      questions,
      published: draft.published,
      allowGuests: draft.allowGuests,
      anonymous: draft.anonymous,
      lockAfterSubmit: draft.lockAfterSubmit,
      version: nextVersion,
      ...(localToIso(draft.deadlineLocal) ? { deadline: localToIso(draft.deadlineLocal) } : {}),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }

    const next = existing ? surveys.map(s => (s.id === existing.id ? survey : s)) : [...surveys, survey]
    saveSurveys(next)
    refresh()
    setEditorOpen(false)
    toast.success(existing ? "تم تحديث الاستبيان" : "تم إنشاء الاستبيان")
    if (versionBumped) {
      toast.success(
        `نسختك صارت رقم ${nextVersion} — من أجابوا على الأسئلة السابقة يستطيعون الإجابة من جديد، والرد المكرر لنفس النسخة يظل ممنوعًا`,
        { duration: 8000 }
      )
    }
    if (survey.published) {
      toast.success(`الاستبيان منشور الآن — يصل إلى ${audienceStudentsCount(survey, grades, students)} طالب`)
    } else {
      toast("محفوظ كمسودة — لن يظهر لأحد قبل النشر", { icon: "📝" })
    }
  }

  const togglePublish = (survey: Survey) => {
    const now = new Date().toISOString()

    // النشر من قائمة الاستبيانات يمر بنفس تحققات المحرّر: لا يُنشر استبيان
    // بغير هدف صالح (مثلاً حُذف صفّه أو مجموعته وهو مسودة) — وإلا ظهر للمعلم
    // أنه نُشر بينما لا يراه أحد.
    if (!survey.published) {
      if (survey.audience === "grade" && !survey.gradeId) {
        toast.error("الصف المستهدف لم يعد موجودًا — افتح الاستبيان واختر صفًا جديدًا")
        return
      }
      if (survey.audience === "group" && (survey.groupIds?.length ?? 0) === 0) {
        toast.error("المجموعات المستهدفة لم تعد موجودة — افتح الاستبيان واختر مجموعة")
        return
      }
      const recipients = audienceStudentsCount(survey, grades, students)
      if (recipients === 0 && survey.allowGuests !== true) {
        toast.error("لا يوجد طالب واحد في هذه الفئة — لن يظهر الاستبيان لأحد")
        return
      }
    }

    saveSurveys(
      surveys.map(s => (s.id === survey.id ? { ...s, published: !s.published, updatedAt: now } : s))
    )
    refresh()
    const recipients = audienceStudentsCount(survey, grades, students)
    toast.success(
      survey.published
        ? "أُوقف نشر الاستبيان"
        : recipients > 0
          ? `تم نشر الاستبيان — يصل إلى ${recipients} طالب`
          : "تم نشر الاستبيان — متاح للزوار في لوحة الإعلانات"
    )
  }

  const removeSurvey = (survey: Survey) => {
    const count = responses.filter(r => r.surveyId === survey.id).length
    const msg = count > 0
      ? `سيُحذف الاستبيان «${survey.title}» مع ${count} ردًا نهائيًا. هل أنت متأكد؟`
      : `هل أنت متأكد من حذف الاستبيان «${survey.title}»؟`
    if (!confirm(msg)) return
    saveSurveys(surveys.filter(s => s.id !== survey.id))
    refresh()
    toast.success("تم حذف الاستبيان")
  }

  const exportCsv = () => {
    if (!resultsSurvey) return
    const csv = surveyCsv(resultsSurvey, resultsResponses, grades)
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `survey-${resultsSurvey.title.slice(0, 30)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("تم تصدير النتائج CSV")
  }

  /** عدد ردود النسخة الحالية (الردود المكررة غير ممكنة أصلًا في قاعدة البيانات) */
  const responseCount = (survey: Survey) => {
    const v = surveyVersion(survey)
    return responses.filter(r => r.surveyId === survey.id && (Number(r.version) || 1) === v).length
  }

  // ---------------- العرض ----------------

  return (
    <div className="space-y-4">
      {/* الرأس */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-indigo-600" />
            استبيانات الطلاب
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            استبيان موجّه للجميع أو لصف أو لمجموعات محددة — يظهر في حساب الطالب، وفي لوحة الإعلانات العامة إن فتحته للزوار
          </p>
        </div>
        <Button onClick={openNew} className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700">
          <Plus className="h-4 w-4 ml-1" />
          استبيان جديد
        </Button>
      </div>

      {/* ملخص */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "إجمالي الاستبيانات", value: surveys.length, icon: ClipboardList },
          { label: "منشورة", value: surveys.filter(s => s.published).length, icon: Globe2 },
          { label: "مسودات", value: surveys.filter(s => !s.published).length, icon: EyeOff },
          { label: "الردود", value: responses.length, icon: Users },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex items-center gap-2">
            <card.icon className="h-4 w-4 text-indigo-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100 leading-none">{card.value}</p>
              <p className="text-[10px] text-gray-500 truncate">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* القائمة */}
      {surveys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <ClipboardList className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm font-bold text-gray-600 dark:text-gray-300">لا توجد استبيانات بعد</p>
          <p className="mt-1 text-xs text-gray-500">
            ابدأ باستبيان «ما رأيك في مواعيد المجموعات؟» ووجّهه لمجموعة واحدة
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {surveys.map(survey => {
            const open = isSurveyOpen(survey)
            const count = responseCount(survey)
            return (
              <div
                key={survey.id}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{survey.title}</h3>
                    {survey.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{survey.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={survey.published} onCheckedChange={() => togglePublish(survey)} />
                    <Badge variant={survey.published ? "default" : "secondary"} className="text-[10px]">
                      {survey.published ? "منشور" : "مسودة"}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Users className="h-3 w-3" />
                    {audienceLabel(survey, grades)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <ListChecks className="h-3 w-3" />
                    {survey.questions.length} سؤال
                  </Badge>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <BarChart3 className="h-3 w-3" />
                    {count} رد • نسخة {surveyVersion(survey)}
                  </Badge>
                  {survey.lockAfterSubmit && (
                    <Badge variant="outline" className="text-[10px] gap-1 text-rose-600 border-rose-300">
                      <Lock className="h-3 w-3" />
                      مقفولة بعد الإرسال
                    </Badge>
                  )}
                  {survey.allowGuests && (
                    <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-300">
                      <Globe2 className="h-3 w-3" />
                      مفتوح للزوار
                    </Badge>
                  )}
                  {survey.anonymous && (
                    <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-300">
                      <EyeOff className="h-3 w-3" />
                      إجابات مجهولة
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={`text-[10px] gap-1 ${open ? "text-indigo-600 border-indigo-300" : "text-gray-500"}`}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {deadlineLabel(survey)}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 mt-auto">
                  <Button size="sm" variant="outline" onClick={() => openEdit(survey)}>
                    <Pencil className="h-3.5 w-3.5 ml-1" />
                    تعديل
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setResultsId(survey.id)}>
                    <BarChart3 className="h-3.5 w-3.5 ml-1" />
                    النتائج
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-rose-600 border-rose-200 hover:bg-rose-50 mr-auto"
                    onClick={() => removeSurvey(survey)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ============ نافذة: إنشاء/تعديل ============ */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل الاستبيان" : "استبيان جديد"}</DialogTitle>
            <DialogDescription>
              حدّد الجمهور والأسئلة، ثم انشره — يظهر فورًا في حساب الطالب المستهدف
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* العنوان */}
            <div className="space-y-3">
              <div>
                <Label>عنوان الاستبيان *</Label>
                <Input
                  placeholder="مثال: رأيك في مواعيد مجموعات الصف الثالث"
                  value={draft.title}
                  onChange={e => setDraft(prev => ({ ...prev, title: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>وصف مختصر (اختياري)</Label>
                <textarea
                  rows={2}
                  placeholder="اكتب للطلاب سبب الاستبيان وكم يستغرق من الوقت..."
                  value={draft.description}
                  onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>
            </div>

            {/* الجمهور */}
            <div>
              <Label>لمن يوجَّه الاستبيان؟ *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                {([
                  { key: "all", label: "الجميع", hint: "كل الطلاب في كل الصفوف" },
                  { key: "grade", label: "صف محدد", hint: "طلاب صف واحد فقط" },
                  { key: "group", label: "مجموعات محددة", hint: "اختر مجموعات بعينها" },
                ] as const).map(opt => {
                  const active = draft.audience === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setDraft(prev => ({ ...prev, audience: opt.key }))}
                      className={`rounded-xl border p-3 text-right transition-all ${
                        active
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 shadow-sm"
                          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-indigo-300"
                      }`}
                    >
                      <p className={`text-xs font-bold ${active ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-200"}`}>
                        {active ? "✓ " : ""}{opt.label}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{opt.hint}</p>
                    </button>
                  )
                })}
              </div>

              {draft.audience === "grade" && (
                <div className="mt-3">
                  <Label>الصف المستهدف</Label>
                  <Select
                    value={draft.gradeId}
                    onValueChange={val => setDraft(prev => ({ ...prev, gradeId: val }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="اختر الصف" />
                    </SelectTrigger>
                    <SelectContent>
                      {grades.length === 0 ? (
                        <SelectItem value="__none" disabled>لا توجد صفوف</SelectItem>
                      ) : (
                        grades.map(g => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name} — {g.groups.reduce((n, gr) => n + gr.studentsCount, 0)} طالب
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {draft.audience === "group" && (
                <div className="mt-3 space-y-2">
                  <Label>المجموعات المستهدفة</Label>
                  {allGroups.length === 0 ? (
                    <p className="text-xs text-amber-600">لا توجد مجموعات — أنشئ مجموعات أولًا</p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 p-2 space-y-2">
                      {grades.map(g => {
                        const groups = g.groups
                        if (groups.length === 0) return null
                        return (
                          <div key={g.id}>
                            <p className="text-[10px] font-bold text-gray-500 mb-1">{g.name}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {groups.map(gr => {
                                const active = draft.groupIds.includes(gr.id)
                                return (
                                  <button
                                    key={gr.id}
                                    type="button"
                                    onClick={() =>
                                      setDraft(prev => ({
                                        ...prev,
                                        groupIds: active
                                          ? prev.groupIds.filter(id => id !== gr.id)
                                          : [...prev.groupIds, gr.id],
                                      }))
                                    }
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                                      active
                                        ? "bg-indigo-600 text-white border-indigo-600"
                                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-300"
                                    }`}
                                  >
                                    {active ? "✓ " : ""}{gr.name} ({gr.studentsCount})
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              <p className="mt-2 text-[11px] text-gray-500">
                يصل الاستبيان إلى{" "}
                <span className="font-bold text-indigo-600">
                  {audienceStudentsCount(
                    { audience: draft.audience, gradeId: draft.gradeId, groupIds: draft.groupIds } as Survey,
                    grades,
                    students
                  )}
                </span>{" "}
                طالبًا
              </p>
            </div>

            {/* الأسئلة */}
            <div>
              <div className="flex items-center justify-between">
                <Label>الأسئلة *</Label>
                <span className="text-[11px] text-gray-500">{draft.questions.length} سؤال</span>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">
                {QUESTION_TYPES.map(t => (
                  <button
                    key={t.type}
                    type="button"
                    title={t.hint}
                    onClick={() => setDraft(prev => ({ ...prev, questions: [...prev.questions, newQuestion(t.type)] }))}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 flex items-center gap-1"
                  >
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3 mt-3">
                {draft.questions.map((q, index) => (
                  <div key={q.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {index + 1}. {questionTypeLabel(q.type)}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => moveQuestion(index, -1)} disabled={index === 0}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => moveQuestion(index, 1)}
                          disabled={index === draft.questions.length - 1}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-600 hover:bg-rose-50"
                          onClick={() =>
                            setDraft(prev => ({ ...prev, questions: prev.questions.filter(x => x.id !== q.id) }))
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <Input
                      placeholder="نص السؤال..."
                      value={q.title}
                      onChange={e => patchQuestion(q.id, { title: e.target.value })}
                      className="mt-2 bg-white dark:bg-gray-900"
                    />

                    {(q.type === "single" || q.type === "multi") && (
                      <div className="mt-2 space-y-1.5">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-400 w-4">{oi + 1}</span>
                            <Input
                              placeholder={`الخيار ${oi + 1}`}
                              value={opt}
                              onChange={e => {
                                const next = [...q.options]
                                next[oi] = e.target.value
                                patchQuestion(q.id, { options: next })
                              }}
                              className="h-8 text-xs bg-white dark:bg-gray-900"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-500 h-8 w-8 p-0"
                              onClick={() => patchQuestion(q.id, { options: q.options.filter((_, i) => i !== oi) })}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => patchQuestion(q.id, { options: [...q.options, ""] })}
                        >
                          <Plus className="h-3 w-3 ml-1" />
                          إضافة خيار
                        </Button>
                      </div>
                    )}

                    {q.type === "rating" && (
                      <div className="mt-2 flex items-center gap-2">
                        <Label className="text-[11px] text-gray-500">أقصى تقييم</Label>
                        <Select
                          value={String(q.maxRating)}
                          onValueChange={val => patchQuestion(q.id, { maxRating: Number(val) || 5 })}
                        >
                          <SelectTrigger className="h-8 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[3, 5, 10].map(n => (
                              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {q.type === "text" && (
                      <Input
                        placeholder="نص إرشادي داخل مربع الكتابة (اختياري)"
                        value={q.placeholder}
                        onChange={e => patchQuestion(q.id, { placeholder: e.target.value })}
                        className="mt-2 h-8 text-xs bg-white dark:bg-gray-900"
                      />
                    )}

                    <div className="mt-2 flex items-center gap-2">
                      <Switch
                        checked={q.required}
                        onCheckedChange={val => patchQuestion(q.id, { required: val })}
                      />
                      <span className="text-[11px] text-gray-600 dark:text-gray-300">
                        سؤال إجباري — لا يُرسل الاستبيان بدون إجابته
                      </span>
                    </div>
                  </div>
                ))}

                {draft.questions.length === 0 && (
                  <p className="text-xs text-amber-600 py-2">
                    لم تُضف أسئلة بعد — اختر نوع السؤال من الأزرار أعلاه
                  </p>
                )}
              </div>
            </div>

            {/* الإعدادات */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-3">
              <Label>إعدادات النشر</Label>

              <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 p-2 text-[10px] text-indigo-800 dark:text-indigo-200 flex items-start gap-2">
                <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  يُحفظ **ردّ واحد فقط لكل طالب أو رقم هاتف** في كل نسخة من هذا الاستبيان —
                  التكرار يُحدِّث ردّه هو ولا يُضيف صفًّا جديدًا، والاستبيان المجهول يُمنع
                  تكراره ببصمة رقم الحساب (بلا تخزين الاسم أو الرقم).
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-200">نشر الاستبيان</p>
                  <p className="text-[10px] text-gray-500">بدون النشر يبقى مسودة لا يراها أحد</p>
                </div>
                <Switch checked={draft.published} onCheckedChange={val => setDraft(prev => ({ ...prev, published: val }))} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-200">مفتوح للزوار في الصفحة الرئيسية</p>
                  <p className="text-[10px] text-gray-500">
                    يجيب الزائر برقم هاتفه (بلا تسجيل دخول) — الرقم مطلوب حتى في الاستبيان المجهول
                    لأنه البصمة التي تمنع الرد المكرر
                  </p>
                </div>
                <Switch
                  checked={draft.allowGuests}
                  onCheckedChange={val => setDraft(prev => ({ ...prev, allowGuests: val }))}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5 text-rose-500" />
                    قفل الإجابة بعد الإرسال
                  </p>
                  <p className="text-[10px] text-gray-500">
                    لا يُسمح حتى بتصحيح الإجابة. في الحالتين لا يُقبل ردّ ثانٍ على نفس الأسئلة.
                  </p>
                </div>
                <Switch
                  checked={draft.lockAfterSubmit}
                  onCheckedChange={val => setDraft(prev => ({ ...prev, lockAfterSubmit: val }))}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-200">إجابات مجهولة</p>
                  <p className="text-[10px] text-gray-500">لا يُسجَّل اسم الطالب مع إجابته — صدق أكبر في الرأي</p>
                </div>
                <Switch
                  checked={draft.anonymous}
                  onCheckedChange={val => setDraft(prev => ({ ...prev, anonymous: val }))}
                />
              </div>

              <div>
                <Label className="text-[11px]">آخر موعد للإجابة (اختياري)</Label>
                <Input
                  type="datetime-local"
                  value={draft.deadlineLocal}
                  onChange={e => setDraft(prev => ({ ...prev, deadlineLocal: e.target.value }))}
                  className="mt-1"
                />
                {draft.deadlineLocal && (
                  <button
                    type="button"
                    className="mt-1 text-[10px] text-rose-500 hover:underline"
                    onClick={() => setDraft(prev => ({ ...prev, deadlineLocal: "" }))}
                  >
                    إلغاء الموعد — يبقى الاستبيان مفتوحًا
                  </button>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>إلغاء</Button>
            <Button
              onClick={saveSurvey}
              className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
            >
              {editingId ? "حفظ التعديلات" : draft.published ? "إنشاء ونشر" : "حفظ كمسودة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ نافذة: النتائج ============ */}
      <Dialog open={resultsId !== null} onOpenChange={open => !open && setResultsId(null)}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          {resultsSurvey && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-600" />
                  نتائج: {resultsSurvey.title}
                </DialogTitle>
                <DialogDescription>
                  {resultsResponses.length} رد على النسخة {resultsVersion} • {audienceLabel(resultsSurvey, grades)} •{" "}
                  {resultsSurvey.anonymous ? "إجابات مجهولة" : "بأسماء الطلاب"}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={exportCsv} disabled={resultsResponses.length === 0}>
                  <Download className="h-3.5 w-3.5 ml-1" />
                  تصدير CSV
                </Button>
                <Badge variant="outline" className="text-[10px]">
                  {resultsSurvey.questions.length} سؤال
                </Badge>
                <Badge variant="outline" className="text-[10px]">{deadlineLabel(resultsSurvey)}</Badge>
                <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                  <History className="h-3 w-3" />
                  نسخة {resultsVersion}
                </Badge>
                {resultsOlderCount > 0 && (
                  <Button
                    size="sm"
                    variant={resultsAllVersions ? "default" : "ghost"}
                    onClick={() => setResultsAllVersions(v => !v)}
                    className="text-[10px] h-7"
                  >
                    {resultsAllVersions
                      ? `عرض النسخة ${resultsVersion} فقط`
                      : `إضافة ${resultsOlderCount} ردّ من نسخ أقدم`}
                  </Button>
                )}
                {resultsSurvey.lockAfterSubmit && (
                  <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-300 flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    الإجابة مقفولة بعد الإرسال
                  </Badge>
                )}
              </div>

              {resultsResponses.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-8">لا توجد ردود بعد على هذا الاستبيان</p>
              ) : (
                <div className="space-y-4 py-2">
                  {resultsStats.map((stat, si) => {
                    const total = Math.max(1, stat.answered)
                    return (
                      <div key={stat.question.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
                          {si + 1}. {stat.question.title}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {questionTypeLabel(stat.question.type)} • أجاب {stat.answered} من {resultsResponses.length}
                          {stat.average !== null && (
                            <span className="font-bold text-amber-600"> • المتوسط {stat.average}</span>
                          )}
                        </p>

                        {stat.counts.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {stat.counts.map(c => {
                              const pct = Math.round((c.count / total) * 100)
                              return (
                                <div key={c.label} className="flex items-center gap-2">
                                  <span className="text-[11px] text-gray-600 dark:text-gray-300 w-40 shrink-0 truncate">
                                    {c.label}
                                  </span>
                                  <div className="flex-1 h-4 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-l from-indigo-500 to-violet-500"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 w-20 shrink-0 text-left">
                                    {c.count} ({pct}%)
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {stat.texts.length > 0 && (
                          <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                            {stat.texts.map((t, ti) => (
                              <p key={ti} className="text-[11px] text-gray-600 dark:text-gray-300 rounded-lg bg-gray-50 dark:bg-gray-800 px-2 py-1.5">
                                “{t}”
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {!resultsSurvey.anonymous && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <p className="text-xs font-bold text-gray-700 dark:text-gray-200 px-3 py-2 bg-gray-50 dark:bg-gray-900">
                        من أجاب ({resultsResponses.length})
                      </p>
                      <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                        {resultsResponses.map(r => (
                          <div key={r.id} className="px-3 py-2 flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="font-bold text-gray-700 dark:text-gray-200">
                              {r.studentName || "بلا اسم"}
                            </span>
                            {r.gradeId && (
                              <Badge variant="outline" className="text-[9px]">
                                {grades.find(g => g.id === r.gradeId)?.name || ""}
                              </Badge>
                            )}
                            {r.groupId && (
                              <Badge variant="outline" className="text-[9px]">
                                {grades.flatMap(g => g.groups).find(gr => gr.id === r.groupId)?.name || ""}
                              </Badge>
                            )}
                            <span className="text-gray-400 mr-auto">
                              {r.createdAt ? new Date(r.createdAt).toLocaleDateString("ar-EG") : ""}
                            </span>
                            {resultsSurvey.questions.slice(0, 3).map(q => (
                              <span key={q.id} className="text-gray-500 truncate max-w-[10rem]">
                                {q.title.slice(0, 18)}: {answerToText(q, r.answers?.[q.id])}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setResultsId(null)}>إغلاق</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
