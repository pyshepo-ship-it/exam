/** أيام الأسبوع كما تُحفظ في المجموعات */
export const ARABIC_WEEKDAYS = [
  "السبت",
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
] as const

/** Date.getDay(): 0 = الأحد … 6 = السبت */
export const JS_DAY_TO_AR: Record<number, string> = {
  0: "الأحد",
  1: "الاثنين",
  2: "الثلاثاء",
  3: "الأربعاء",
  4: "الخميس",
  5: "الجمعة",
  6: "السبت",
}

export function arabicWeekday(date: Date | string = new Date()): string {
  const d = typeof date === "string" ? new Date(date + (date.length === 10 ? "T12:00:00" : "")) : date
  return JS_DAY_TO_AR[d.getDay()] || ""
}

export function toISODate(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function isGroupDay(days: string[], date: Date | string = new Date()): boolean {
  const name = arabicWeekday(date)
  return days.includes(name)
}

/** معرّف ثابت لسجل حضور يوم/مجموعة (بدون حاجة لإنشاء حصة يدوياً) */
export function attendanceDayId(groupId: string, isoDate: string): string {
  return `att-${groupId}-${isoDate}`
}
