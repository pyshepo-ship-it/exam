import type {
  Grade,
  Survey,
  SurveyAnswer,
  SurveyGuestIdentity,
  SurveyNameMode,
  SurveyQuestion,
  SurveyResponse,
} from "./data-storage"

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

// ------------------------------------------------------------
// النسخة (version) ومنع التكرار
// ------------------------------------------------------------
// كل استبيان له رقم نسخة يبدأ من ١. تعديل الأسئلة يرفع النسخة (في قاعدة
// البيانات وفي الواجهة معًا)، فتُفتح الإجابة لمن سبق أن أجاب — لأن أسئلته
// صارت مختلفة. الرد المكرر لنفس النسخة يُحدّث ردّه هو ولا يُنشئ صفًّا ثانيًا.

/** رقم نسخة الاستبيان (السجلات القديمة = ١) */
export function surveyVersion(survey: Pick<Survey, "version">): number {
  const v = Math.round(Number(survey.version) || 1)
  return v >= 1 ? v : 1
}

/** مفتاح «أجبت»: استبيان + نسخة */
export function answeredKey(surveyId: string, version: number): string {
  return `${surveyId}:${version}`
}

/** بصمة أسئلة الاستبيان — أي تغيير فيها يعني نسخة جديدة */
export function questionsFingerprint(questions: SurveyQuestion[]): string {
  return (questions || [])
    .map(q =>
      [
        q.id,
        q.type,
        (q.title || "").trim(),
        q.required ? "1" : "0",
        (q.options || []).map(o => String(o).trim()).join("|"),
        q.type === "rating" ? String(q.maxRating || 5) : "",
        q.type === "text" ? (q.placeholder || "").trim() : "",
      ].join("\u0001")
    )
    .join("\u0002")
}

/**
 * النسخة التي يجب حفظها بعد تعديل الاستبيان:
 * تغيّرت الأسئلة ⇒ نسخة أعلى بواحد، وإلا نفس النسخة (حذف استبيان سابق لا يعيد
 * الترقيم، والسجلات بلا نسخة تُعامل كـ ١).
 */
export function nextVersionAfterEdit(
  prev: Pick<Survey, "version" | "questions"> | undefined,
  nextQuestions: SurveyQuestion[]
): number {
  const prevVersion = surveyVersion(prev || {})
  if (!prev) return 1
  return questionsFingerprint(prev.questions || []) === questionsFingerprint(nextQuestions)
    ? prevVersion
    : prevVersion + 1
}

/** هل أجاب هذا الشخص على النسخة الحالية؟ */
export function hasAnsweredCurrent(
  survey: Pick<Survey, "id" | "version">,
  answeredKeys: string[] | undefined
): boolean {
  return (answeredKeys || []).includes(answeredKey(survey.id, surveyVersion(survey)))
}

/** هل أجاب على نسخة أقدم؟ (يُستخدم لشرح سبب إعادة فتح الاستبيان) */
export function hasAnsweredOlderVersion(
  survey: Pick<Survey, "id" | "version">,
  answeredKeys: string[] | undefined
): boolean {
  const keys = answeredKeys || []
  return (
    !hasAnsweredCurrent(survey, keys) &&
    keys.some(k => {
      const i = k.lastIndexOf(":")
      return i > 0 && k.slice(0, i) === survey.id
    })
  )
}

/** هل يمكنه تعديل إجابته؟ (مفتوح ولم يُقفل بالاستبيان) */
export function canEditAnswer(
  survey: Pick<Survey, "published" | "deadline" | "lockAfterSubmit">,
  answered: boolean
): boolean {
  if (!answered) return true
  if (survey.lockAfterSubmit === true) return false
  return isSurveyOpen(survey as Survey)
}

// ------------------------------------------------------------
// هوية من يجيب بلا تسجيل — بلا رقم هاتف إجباري
// ------------------------------------------------------------
// القاعدة العملية: لا نطلب من الزائر بيانات لا نحتاجها فعلًا. الجهاز نفسه
// يحمل بطاقة عشوائية (survey-device.ts) يهشّرها الخادم بملح الاستبيان، ومن
// فتح نافذة تخفٍّ يُكشف من بصمة الشبكة والمتصفح في الخادم. الرقم صار خيارًا
// للمعلم حين يريد ربط الردود بحسابات الطلاب لا شرطًا للإجابة.

export const GUEST_IDENTITY_MODES: SurveyGuestIdentity[] = ["device", "strict", "phone", "open"]

/** طريقة التحقق الفعلية للاستبيان (الافتراضي: بطاقة الجهاز) */
export function guestIdentityOf(survey: Pick<Survey, "guestIdentity">): SurveyGuestIdentity {
  const v = survey.guestIdentity
  return GUEST_IDENTITY_MODES.includes(v as SurveyGuestIdentity) ? (v as SurveyGuestIdentity) : "device"
}

/** وضع حقل الاسم (المجهول لا يعرض اسمًا مهما كان الإعداد) */
export function nameModeOf(survey: Pick<Survey, "nameMode" | "anonymous">): SurveyNameMode {
  if (survey.anonymous === true) return "off"
  const v = survey.nameMode
  return v === "off" || v === "required" || v === "optional" ? v : "optional"
}

export const GUEST_IDENTITY_LABELS: Record<SurveyGuestIdentity, { title: string; hint: string }> = {
  device: {
    title: "بلا بيانات (موصى به)",
    hint: "يجيب الزائر مباشرة. الموقع يميّز المتصفح تلقائيًا فلا يُقبل ردّ ثانٍ منه، والردود التي تأتي من نفس الشبكة والمتصفح تُعلَّم لك كتكرار مُرجَّح.",
  },
  strict: {
    title: "مشدَّد — ردّ واحد لكل شبكة ومتصفح",
    hint: "يمنع وضع التخفي والنوافذ الجديدة. انتبه: طالبان على نفس الواي-فاي وبنفس المتصفح قد يُحسبان شخصًا واحدًا.",
  },
  phone: {
    title: "برقم الهاتف",
    hint: "يُطلب الرقم ويُربط الرد بحساب الطالب إن كان مسجّلًا عندك. لا يمنع الأرقام الوهمية وحده.",
  },
  open: {
    title: "تصويت حر",
    hint: "بلا أي منع للتكرار — للتصويت السريع فقط.",
  },
}

export interface GuestFields {
  /** يظهر حقل الاسم؟ */
  showName: boolean
  /** الاسم مطلوب؟ */
  requireName: boolean
  /** يظهر حقل رقم الهاتف؟ */
  showPhone: boolean
  /** الرقم مطلوب؟ */
  requirePhone: boolean
}

/** الحقول التي يراها الزائر فعلًا (مصدر واحد للواجهة وللتحقق) */
export function guestFields(survey: Pick<Survey, "guestIdentity" | "nameMode" | "anonymous">): GuestFields {
  const mode = guestIdentityOf(survey)
  const names = nameModeOf(survey)
  return {
    showName: names !== "off",
    requireName: names === "required",
    showPhone: mode === "phone",
    requirePhone: mode === "phone",
  }
}

/** تحقق مدخلات الزائر قبل الإرسال — نفس قواعد الخادم (ترحيل 023) */
export function validateGuestInput(
  survey: Pick<Survey, "guestIdentity" | "nameMode" | "anonymous">,
  input: { name?: string; phone?: string }
): string | null {
  const fields = guestFields(survey)
  if (fields.requireName && (input.name || "").trim().length < 2) return "اكتب اسمك من فضلك"
  if (fields.requirePhone && !normalizeSurveyPhone(input.phone || "")) {
    return "اكتب رقم هاتف صحيح (11 رقمًا)"
  }
  return null
}

// ------------------------------------------------------------
// خطة الحفظ المحلي (تطوير/معاينة بلا Supabase) — نفس قاعدة الخادم:
// ردّ واحد لكل هوية في كل نسخة، بلا صف ثانٍ أبدًا.
// ------------------------------------------------------------

export interface SurveyResponseLike {
  id: string
  surveyId: string
  version?: number
  /** بصمة محلية (تطوير فقط): sid:… أو ph:… */
  identityKey?: string
}

export interface SurveyLike {
  id: string
  version?: number
  lockAfterSubmit?: boolean
  guestIdentity?: SurveyGuestIdentity
}

export interface LocalSubmitPlan {
  action: "insert" | "update" | "reject"
  /** معرّف الصف الموجود عند التحديث */
  id?: string
  version: number
  error?: string
}

/**
 * يقرر: إدراج رد جديد، أم تحديث ردّ هذا الشخص على نفس النسخة، أم رفض.
 * `identityKey` مطلوب إلا في وضع «التصويت الحر» — بلا هوية لا يمكن ضمان عدم
 * التكرار (نرفض بدل تلويث النتائج)، وهو نفس سلوك submit_survey_response.
 */
export function planLocalSurveySubmit(
  responses: Array<SurveyResponseLike & { version?: number } >,
  survey: SurveyLike | undefined,
  identityKey: string
): LocalSubmitPlan {
  const key = (identityKey || "").trim()
  if (!survey) return { action: "reject", version: 1, error: "لم يعد هذا الاستبيان متاحًا — حدِّث الصفحة" }
  const version = surveyVersion(survey)
  // تصويت حر: كل ضغطة ردّ مستقل (اختيار صريح من المعلم)
  if (guestIdentityOf(survey) === "open" && !key.startsWith("sid:")) {
    return { action: "insert", version }
  }
  if (!key) {
    return {
      action: "reject",
      version,
      error: "تعذّر فتح الاستبيان في هذا المتصفح — فعّل تخزين المواقع أو جرّب متصفحًا آخر",
    }
  }
  // نفس الشخص + نفس النسخة = ردّه الحالي (يُحدَّث). ردود النسخ الأقدم تُترك
  // كما هي — وإلا محي تاريخ إجاباتهم السابقة عند كل تعديل للأسئلة.
  const mine = responses.find(
    r => r.surveyId === survey.id && r.identityKey === key && surveyVersion(r) === version
  )
  if (!mine) return { action: "insert", version }
  if (survey.lockAfterSubmit === true) {
    return {
      action: "reject",
      version,
      id: mine.id,
      error: "أُرسلت إجابتك ولا يمكن تعديلها — إن احتجت تعديلًا تواصل مع المعلم",
    }
  }
  return { action: "update", id: mine.id, version }
}

/**
 * توحيد الأرقام العربية-الهندية إلى لاتينية (٠١٠ → 010) قبل أي مقارنة.
 * نسخة محلية صغيرة عمدًا: الدالة الأصلية `normalizeDigits` في student-accounts،
 * واستيرادها هنا يُنشئ دورة استيراد (student-accounts ← data-storage ← sync ← surveys).
 */
export function normalizeSurveyDigits(value: string): string {
  return String(value || "")
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
}

/**
 * رقم هاتف نظيف بنفس قاعدة الخادم (`survey_phone_key` في ترحيل 022):
 * أرقام فقط، ثم آخر ١١ رقمًا — فيكتب الطالب 010… أو 2010… أو ‎+20 101 …
 * وتُحسب بصمته دائمًا من نفس المفتاح، فلا يفلت من منع التكرار بتغيير الصيغة.
 * يُعيد "" إن كان الرقم أقصر من ١٠ خانات.
 */
export function normalizeSurveyPhone(value: string): string {
  const d = normalizeSurveyDigits(value).replace(/[^0-9]/g, "")
  return d.length >= 10 ? d.slice(-11) : ""
}

/**
 * بصمة محلية لردّ (تُستخدم في التطوير فقط؛ في الإنتاج يحسبها الخادم بملح سرّي).
 * الترتيب نفسه المستعمل في submit_survey_response: حساب الطالب، ثم رقم الهاتف
 * إن طُلب، ثم بطاقة المتصفح — فلا يحتاج الزائر رقمًا ليُمنع من الرد مرتين.
 */
export function localIdentityKey(input: { token?: string; phone?: string; deviceId?: string }): string {
  if (input.token) return "sid:" + input.token.slice(-16)
  const phone = normalizeSurveyPhone(input.phone || "")
  if (phone) return "ph:" + phone
  const device = String(input.deviceId || "").trim()
  return device ? "dev:" + device : ""
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
  const head = ["الاسم", "الهاتف", "الصف", "المجموعة", "التاريخ", "النسخة", "تكرار مُرجَّح", ...survey.questions.map(q => q.title)]
  const rows = responses.map(r => [
    r.studentName || (survey.anonymous ? "مجهول" : ""),
    r.phone || "",
    gradeName(r.gradeId),
    groupName(r.groupId),
    r.createdAt ? new Date(r.createdAt).toLocaleString("ar-EG") : "",
    // نسخة الاستبيان التي أُجيب عنها — للتمييز عند عرض «كل النسخ»
    String(Number(r.version) || 1),
    r.duplicateSuspect === true ? "نعم" : "",
    ...survey.questions.map(q => answerToText(q, r.answers?.[q.id])),
  ])
  return [head, ...rows].map(row => row.map(esc).join(",")).join("\n")
}
