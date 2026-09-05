import type { Grade, Survey, SurveyAnswer, SurveyQuestion, SurveyResponse } from "./data-storage"

/**
 * أدوات الاستبيانات المشتركة بين:
 *  - لوحة تحكم المعلم (إنشاء/تعديل/نتائج)
 *  - حساب الطالب (الإجابة)
 *  - لوحة الإعلانات العامة (إجابة الزائر بالاسم والرقم)
 */

const QUESTION_TYPE_LABELS: Record<SurveyQuestion["type"], string> = {
  single: "اختيار من قائمة",
  multi: "اختيار متعدد",
  rating: "تقييم",
  yesno: "نعم / لا",
  text: "إجابة نصية",
}

export function questionTypeLabel(type: SurveyQuestion["type"]): string {
  return QUESTION_TYPE_LABELS[type] || type
}

export const YES = "نعم"
export const NO = "لا"

/** إجابة فارغة بحسب نوع السؤال */
export function emptyAnswer(q: SurveyQuestion): SurveyAnswer {
  switch (q.type) {
    case "multi":
    case "single":
      return { choice: [] }
    case "rating":
      return { rating: 0 }
    case "text":
      return { text: "" }
    case "yesno":
    default:
      return { choice: [] }
  }
}

/** هل أُجيب على السؤال فعلًا؟ (يُستخدم مع الأسئلة الإجبارية) */
export function isAnswered(a?: SurveyAnswer): boolean {
  if (!a) return false
  if (Array.isArray(a.choice)) return a.choice.length > 0
  if (typeof a.text === "string") return a.text.trim().length > 0
  if (typeof a.rating === "number") return a.rating > 0
  return false
}

/** نص الإجابة للعرض والطباعة */
export function answerToText(q: SurveyQuestion, a?: SurveyAnswer): string {
  if (!isAnswered(a)) return "—"
  if (typeof a!.text === "string" && a!.text.trim()) return a!.text.trim()
  if (typeof a!.rating === "number" && a!.rating > 0) {
    const max = q.maxRating || 5
    return `${a!.rating} / ${max}`
  }
  if (Array.isArray(a!.choice) && a!.choice.length) return a!.choice.join(" • ")
  return "—"
}

/** أول سؤال بلا إجابة (لرسالة التنبيه قبل الإرسال) */
export function firstUnanswered(survey: Survey, answers: Record<string, SurveyAnswer>): SurveyQuestion | null {
  for (const q of survey.questions) {
    if (q.required && !isAnswered(answers[q.id])) return q
  }
  return null
}

export function isSurveyOpen(survey: Survey): boolean {
  if (!survey.published) return false
  if (survey.deadline) {
    const d = new Date(survey.deadline)
    if (!isNaN(d.getTime()) && d.getTime() < Date.now()) return false
  }
  return true
}

export function deadlineLabel(survey: Survey): string {
  if (!survey.deadline) return "بلا موعد نهائي"
  const d = new Date(survey.deadline)
  if (isNaN(d.getTime())) return "بلا موعد نهائي"
  return `حتى ${d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}`
}

/** وصف جمهور الاستبيان بالعربية */
export function audienceLabel(survey: Survey, grades: Grade[]): string {
  if (survey.audience === "grade") {
    const g = grades.find(x => x.id === survey.gradeId)
    return g ? `صف ${g.name}` : "صف محدد"
  }
  if (survey.audience === "group") {
    const names: string[] = []
    for (const g of grades) {
      for (const grp of g.groups) {
        if ((survey.groupIds || []).includes(grp.id)) names.push(grp.name)
      }
    }
    if (names.length === 0) return "مجموعات محددة"
    if (names.length <= 3) return names.join(" • ")
    return `${names.length} مجموعات`
  }
  return "الجميع"
}

/** عدد الطلاب المستهدفين تقريبيًا (للعرض قبل النشر) */
export function audienceStudentsCount(survey: Survey, grades: Grade[], students: { id: string; gradeId?: string; groupId?: string }[]): number {
  if (survey.audience === "all") return students.length
  if (survey.audience === "grade") return students.filter(s => s.gradeId === survey.gradeId).length
  const ids = survey.groupIds || []
  return students.filter(s => s.groupId && ids.includes(s.groupId)).length
}

export interface QuestionStat {
  question: SurveyQuestion
  /** عدد من أجابوا */
  answered: number
  /** خيارات/قيم ← العدد (للأسئلة المغلقة) */
  counts: { label: string; count: number }[]
  /** متوسط التقييم */
  average: number | null
  /** إجابات نصية للعرض */
  texts: string[]
}

/** تجميع نتائج استبيان من ردوده */
export function surveyStats(survey: Survey, responses: SurveyResponse[]): QuestionStat[] {
  return survey.questions.map(q => {
    const answered: SurveyAnswer[] = []
    for (const r of responses) {
      const a = r.answers?.[q.id]
      if (isAnswered(a)) answered.push(a!)
    }
    const counts: { label: string; count: number }[] = []
    const texts: string[] = []
    let sum = 0
    let rated = 0

    if (q.type === "single" || q.type === "multi" || q.type === "yesno") {
      const options = q.type === "yesno" ? [YES, NO] : q.options || []
      const map = new Map<string, number>(options.map(o => [o, 0]))
      for (const a of answered) {
        for (const c of a.choice || []) {
          map.set(c, (map.get(c) || 0) + 1)
        }
      }
      for (const [label, count] of map) counts.push({ label, count })
      counts.sort((x, y) => y.count - x.count)
    } else if (q.type === "rating") {
      const max = q.maxRating || 5
      const map = new Map<number, number>()
      for (let i = 1; i <= max; i++) map.set(i, 0)
      for (const a of answered) {
        const v = Math.round(a.rating || 0)
        if (v >= 1 && v <= max) {
          map.set(v, (map.get(v) || 0) + 1)
          sum += v
          rated++
        }
      }
      for (let i = max; i >= 1; i--) counts.push({ label: `${i} / ${max}`, count: map.get(i) || 0 })
    } else {
      for (const a of answered) {
        const t = (a.text || "").trim()
        if (t) texts.push(t)
      }
    }

    return {
      question: q,
      answered: answered.length,
      counts,
      average: rated > 0 ? Math.round((sum / rated) * 10) / 10 : null,
      texts,
    }
  })
}

/** تصدير الردود CSV (يفتح في Excel مباشرة) */
export function surveyCsv(survey: Survey, responses: SurveyResponse[], grades: Grade[]): string {
  const groupName = (id?: string) => {
    if (!id) return ""
    for (const g of grades) {
      const grp = g.groups.find(x => x.id === id)
      if (grp) return grp.name
    }
    return ""
  }
  const gradeName = (id?: string) => grades.find(g => g.id === id)?.name || ""
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = ["الاسم", "الهاتف", "الصف", "المجموعة", "التاريخ", ...survey.questions.map(q => q.title)]
  const rows = responses.map(r => [
    r.studentName || (survey.anonymous ? "مجهول" : ""),
    r.phone || "",
    gradeName(r.gradeId),
    groupName(r.groupId),
    r.createdAt ? new Date(r.createdAt).toLocaleString("ar-EG") : "",
    ...survey.questions.map(q => answerToText(q, r.answers?.[q.id])),
  ])
  return [head, ...rows].map(row => row.map(esc).join(",")).join("\n")
}
