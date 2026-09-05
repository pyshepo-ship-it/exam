// ============================================================
// التسعير والتحصيل — سعر المجموعة ودورات الاستحقاق
// ============================================================
// المجموعة تُسعَّر بإحدى طريقتين:
//   1) سعر شهري ثابت
//   2) سعر للحصة × عدد الحصص في الشهر (حسب مواعيد المجموعة)
// وكل استحقاق له دورة: شهري / أسبوعي / بالحصّة / مبلغ مخصص.
// القواعد هنا واحدة تستخدمها صفحة المجموعات وصفحة التحصيل وتقارير الطالب
// حتى لا يختلف الحساب من شاشة لأخرى.
// ============================================================

import type { Due, DueCycle, Group, GroupPricingMode } from "./data-storage"

export const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]

export const money = (n: number): string => `${Number(n || 0).toLocaleString("ar-EG")} ج.م`

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return isFinite(n) && n > 0 ? n : 0
}

// ------------------------------------------------------------
// تسعير المجموعة
// ------------------------------------------------------------

/** طريقة تسعير المجموعة — السجلات القديمة بلا تحديد تُعامل كسعر شهري */
export function groupPricingMode(group: Pick<Group, "pricingMode" | "sessionFee">): GroupPricingMode {
  if (group.pricingMode === "session") return "session"
  if (group.pricingMode === "monthly") return "monthly"
  // سجل قديم بلا طريقة: إن حمل سعر حصة فهو تسعير بالحصّة
  return num(group.sessionFee) > 0 ? "session" : "monthly"
}

/** عدد الحصص في الشهر من أيام الأسبوع (الشهر ≈ 4.33 أسبوع) */
export function sessionsPerMonthFromDays(days: string[]): number {
  const count = (days || []).filter(Boolean).length
  if (count === 0) return 0
  return Math.round(count * 4.33)
}

/** عدد حصص المجموعة في الشهر (المحدد يدوياً أو المحسوب من المواعيد) */
export function groupSessionsPerMonth(group: Pick<Group, "days" | "sessionsPerMonth">): number {
  const manual = num(group.sessionsPerMonth)
  if (manual > 0) return manual
  return sessionsPerMonthFromDays(group.days || [])
}

/** سعر الحصة: المحدد يدوياً، أو المستنتج من السعر الشهري ÷ عدد الحصص */
export function groupSessionFee(group: Group): number {
  const explicit = num(group.sessionFee)
  if (explicit > 0) return explicit
  const perMonth = groupSessionsPerMonth(group)
  const monthly = num(group.monthlyFee)
  if (perMonth > 0 && monthly > 0) return Math.round((monthly / perMonth) * 100) / 100
  return 0
}

/** السعر الشهري الفعلي: سعر الحصة × عدد الحصص شهرياً، أو السعر الشهري نفسه */
export function groupMonthlyFee(group: Group): number {
  if (groupPricingMode(group) === "session") {
    const fee = num(group.sessionFee)
    const perMonth = groupSessionsPerMonth(group)
    if (fee > 0 && perMonth > 0) return Math.round(fee * perMonth * 100) / 100
  }
  return num(group.monthlyFee)
}

/**
 * سعر الأسبوع: المحدد يدوياً، أو سعر الحصة × عدد أيام المجموعة في الأسبوع،
 * أو السعر الشهري ÷ 4.33 أسبوع.
 */
export function groupWeeklyFee(group: Group): number {
  const explicit = num(group.weeklyFee)
  if (explicit > 0) return explicit
  const session = groupSessionFee(group)
  const daysPerWeek = (group.days || []).filter(Boolean).length
  if (session > 0 && daysPerWeek > 0) return Math.round(session * daysPerWeek * 100) / 100
  const monthly = groupMonthlyFee(group)
  if (monthly > 0) return Math.round((monthly / 4.33) * 100) / 100
  return 0
}

/** عدد الحصص في أسبوع واحد = عدد أيام المجموعة */
export function sessionsPerWeek(group: Pick<Group, "days">): number {
  return (group.days || []).filter(Boolean).length
}

/** وصف التسعير كما يظهر في البطاقات والقوائم */
export function pricingSummary(group: Group): string {
  if (groupPricingMode(group) === "session") {
    const fee = groupSessionFee(group)
    const perMonth = groupSessionsPerMonth(group)
    if (fee > 0 && perMonth > 0) {
      return `${money(fee)} للحصة × ${perMonth} حصة شهرياً = ${money(fee * perMonth)}/شهر`
    }
    if (fee > 0) return `${money(fee)} للحصة`
  }
  const monthly = groupMonthlyFee(group)
  return monthly > 0 ? `${money(monthly)}/شهر` : "بدون سعر محدد"
}

/** سطر مختصر للقوائم المنسدلة (يظهر للطالب/المعلم دون تفاصيل زائدة) */
export function pricingShort(group: Group): string {
  if (groupPricingMode(group) === "session" && num(group.sessionFee) > 0) {
    return `${money(num(group.sessionFee))}/حصة`
  }
  const monthly = groupMonthlyFee(group)
  return monthly > 0 ? `${money(monthly)}/شهر` : ""
}

/**
 * حساب الحقول المالية للمجموعة قبل حفظها:
 * في التسعير بالحصّة يُشتق السعر الشهري (ليبقى مرجعاً لكل الشاشات القديمة)،
 * وفي التسعير الشهري تُشتق سعر الحصة الاسترشادي.
 */
export function normalizeGroupPricing(input: {
  pricingMode?: GroupPricingMode
  monthlyFee?: number
  sessionFee?: number
  sessionsPerMonth?: number
  weeklyFee?: number
  days?: string[]
}): Pick<Group, "monthlyFee" | "sessionFee" | "sessionsPerMonth" | "pricingMode" | "weeklyFee"> {
  const mode: GroupPricingMode = input.pricingMode === "session" ? "session" : "monthly"
  const days = input.days || []
  if (mode === "session") {
    const sessionFee = Math.max(0, Math.round(num(input.sessionFee) * 100) / 100)
    const sessionsPerMonth = num(input.sessionsPerMonth) || sessionsPerMonthFromDays(days)
    const monthlyFee = Math.round(sessionFee * sessionsPerMonth * 100) / 100
    return {
      pricingMode: "session",
      sessionFee,
      sessionsPerMonth,
      monthlyFee,
      weeklyFee: num(input.weeklyFee) || (sessionFee * sessionsPerWeek({ days }) || undefined),
    }
  }
  const monthlyFee = Math.max(0, Math.round(num(input.monthlyFee) * 100) / 100)
  const sessionsPerMonth = num(input.sessionsPerMonth) || sessionsPerMonthFromDays(days)
  return {
    pricingMode: "monthly",
    monthlyFee,
    // سعر الحصة الاسترشادي (لا يُستخدم في الحساب ما لم يختر المعلم التسعير بالحصّة)
    sessionFee: num(input.sessionFee) || (sessionsPerMonth > 0 ? Math.round((monthlyFee / sessionsPerMonth) * 100) / 100 : undefined),
    sessionsPerMonth: sessionsPerMonth || undefined,
    weeklyFee: num(input.weeklyFee) || undefined,
  }
}

// ------------------------------------------------------------
// فترات الاستحقاق (شهري / أسبوعي / بالحصّة / مخصص)
// ------------------------------------------------------------

/** اسم طريقة التسعير في واجهة المجموعة (مرادف لنوع البيانات) */
export type GroupPricingModeUi = GroupPricingMode

export const PRICING_MODE_LABELS: Record<GroupPricingMode, string> = {
  monthly: "سعر شهري",
  session: "سعر بالحصّة",
}

export const DUE_CYCLE_LABELS: Record<DueCycle, string> = {
  monthly: "شهري",
  weekly: "أسبوعي",
  session: "بالحصّة",
  custom: "مبلغ مخصص",
}

export const DUE_CYCLE_ORDER: DueCycle[] = ["monthly", "weekly", "session", "custom"]

const pad = (n: number) => String(n).padStart(2, "0")
export const toDateKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** بداية الأسبوع الدراسي (السبت) لتاريخ معيّن */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = (d.getDay() + 1) % 7 // السبت = 0، الأحد = 1 …
  d.setDate(d.getDate() - diff)
  return d
}

export function endOfWeek(date: Date): Date {
  const d = startOfWeek(date)
  d.setDate(d.getDate() + 6)
  return d
}

/** رقم الأسبوع داخل السنة (يبدأ من 1) */
export function weekNumberOfYear(weekStart: Date): number {
  const firstDay = new Date(weekStart.getFullYear(), 0, 1)
  const firstWeekStart = startOfWeek(firstDay)
  const days = Math.round((weekStart.getTime() - firstWeekStart.getTime()) / 86400000)
  return Math.max(1, Math.floor(days / 7) + 1)
}

const arDate = (d: Date): string => `${d.getDate()} ${AR_MONTHS[d.getMonth()]}`

export interface PeriodInfo {
  key: string
  label: string
  /** أول يوم في الفترة */
  start: Date
  /** آخر يوم في الفترة */
  end: Date
  month: number
  year: number
}

/** فترة شهر كامل */
export function monthlyPeriod(month: number, year: number): PeriodInfo {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  return {
    key: `${year}-${pad(month)}`,
    label: `${AR_MONTHS[month - 1]} ${year}`,
    start,
    end,
    month,
    year,
  }
}

/** فترة أسبوع (السبت → الجمعة) */
export function weeklyPeriod(anyDayInWeek: Date): PeriodInfo {
  const start = startOfWeek(anyDayInWeek)
  const end = endOfWeek(anyDayInWeek)
  const weekNo = weekNumberOfYear(start)
  const sameMonth = start.getMonth() === end.getMonth()
  const span = sameMonth
    ? `${start.getDate()} – ${end.getDate()} ${AR_MONTHS[end.getMonth()]}`
    : `${arDate(start)} – ${arDate(end)}`
  return {
    key: `${start.getFullYear()}-W${pad(weekNo)}`,
    label: `أسبوع ${weekNo} (${span})`,
    start,
    end,
    month: start.getMonth() + 1,
    year: start.getFullYear(),
  }
}

/** فترة حصص في يوم معيّن (حصة واحدة أو أكثر) */
export function sessionPeriod(sessionDate: Date, sessionsCount = 1): PeriodInfo {
  const count = Math.max(1, Math.round(sessionsCount || 1))
  const word = count === 1 ? "حصة" : count === 2 ? "حصتان" : `${count} حصص`
  return {
    key: `${toDateKey(sessionDate)}#${count}`,
    label: `${word} يوم ${arDate(sessionDate)} ${sessionDate.getFullYear()}`,
    start: sessionDate,
    end: sessionDate,
    month: sessionDate.getMonth() + 1,
    year: sessionDate.getFullYear(),
  }
}

/** فترة مبلغ مخصص */
export function customPeriod(label: string, at: Date = new Date()): PeriodInfo {
  const text = (label || "").trim()
  return {
    key: `custom-${toDateKey(at)}-${Math.random().toString(36).slice(2, 8)}`,
    label: text || `مبلغ مخصص — ${arDate(at)} ${at.getFullYear()}`,
    start: at,
    end: at,
    month: at.getMonth() + 1,
    year: at.getFullYear(),
  }
}

/** المبلغ المستحق لمجموعة في دورة معيّنة */
export function amountForCycle(
  group: Group,
  cycle: DueCycle,
  opts?: { sessionsCount?: number; customAmount?: number }
): { amount: number; unitPrice: number; sessionsCount?: number } {
  const custom = num(opts?.customAmount)
  if (cycle === "custom") {
    return { amount: custom, unitPrice: custom }
  }
  if (custom > 0) {
    // المعلم حدّد مبلغاً يدوياً — يُعتمد مهما كانت الدورة
    const count = cycle === "session" ? Math.max(1, Math.round(opts?.sessionsCount || 1)) : undefined
    return { amount: custom, unitPrice: custom, sessionsCount: count }
  }
  if (cycle === "weekly") {
    const unit = groupWeeklyFee(group)
    return { amount: unit, unitPrice: unit }
  }
  if (cycle === "session") {
    const unit = groupSessionFee(group)
    const count = Math.max(1, Math.round(opts?.sessionsCount || 1))
    return { amount: Math.round(unit * count * 100) / 100, unitPrice: unit, sessionsCount: count }
  }
  const unit = groupMonthlyFee(group)
  return { amount: unit, unitPrice: unit }
}

/**
 * مفتاح فترة الاستحقاق — يُستخدم لمنع إنشاء استحقاق مكرر لنفس الفترة.
 * السجلات القديمة (بلا periodKey) تُحسب من الشهر/السنة حتى تبقى محمية من التكرار.
 */
export function duePeriodKey(due: Pick<Due, "cycle" | "periodKey" | "month" | "year" | "dueDate">): string {
  if (due.periodKey) return due.periodKey
  if ((due.cycle || "monthly") === "monthly") return `${due.year}-${pad(due.month)}`
  return due.dueDate || `${due.year}-${pad(due.month)}`
}

/** وصف الفترة المعروض في الجداول والتقارير */
export function duePeriodLabel(due: Due): string {
  if (due.periodLabel) return due.periodLabel
  if ((due.cycle || "monthly") === "monthly") return `${AR_MONTHS[(due.month || 1) - 1]} ${due.year}`
  if (due.dueDate) {
    const d = new Date(`${due.dueDate}T00:00:00`)
    if (!isNaN(d.getTime())) return `${DUE_CYCLE_LABELS[due.cycle || "monthly"]} — ${arDate(d)}`
  }
  return `${AR_MONTHS[(due.month || 1) - 1]} ${due.year}`
}

/** دورة الاستحقاق مع توافق السجلات القديمة */
export function dueCycle(due: Pick<Due, "cycle">): DueCycle {
  const c = due.cycle
  return c === "weekly" || c === "session" || c === "custom" ? c : "monthly"
}

/** نص اليوم بالعربية (لعرض مواعيد المجموعة) */
export function arabicDayName(day: string): string {
  return AR_DAYS.find(d => d === day) || day
}
