// ============================================================
// منطق مواعيد المجموعات:
//  1) منع تسجيل مجموعتين في نفس الموعد (حتى لو يوم واحد متعارض)
//  2) بناء الجدول الآمن للطلاب (المواعيد فقط — بدون بيانات حساسة)
//  3) نشر الجدول في الصفحة الرئيسية (الإعلانات ولوحة الشرف) وكإعلان
// ============================================================

import { Grade, Group, Announcement, getAnnouncements, saveAnnouncements, getSetting, saveSetting, getStoredAcademicYear } from "./data-storage"
import { formatTime12 } from "./utils"

// ------------------------------------------------------------
// 1) كشف تعارض المواعيد
// ------------------------------------------------------------

export interface ScheduleConflict {
  /** اليوم المتعارض */
  day: string
  /** المجموعة التي يحتل هذا الموعد */
  group: Group
  gradeId: string
  gradeName: string
}

/**
 * توحيد صيغة الوقت إلى HH:mm (ساعة برقومين) قبل أي مقارنة نصية،
 * حمايةً من بيانات قديمة بصيغة "9:00" حيث المقارنة النصية تخفق.
 */
export function normalizeTime(t: string): string {
  if (!t || !t.includes(":")) return t || ""
  const [hStr, mStr] = t.split(":")
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr || "0", 10)
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return t
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** هل الوقت الثاني بعد الأول فعلاً؟ (للتحقق أن النهاية بعد البداية) */
export function isTimeAfter(start: string, end: string): boolean {
  const s = normalizeTime(start)
  const e = normalizeTime(end)
  if (!s || !e || !s.includes(":") || !e.includes(":")) return false
  return e > s
}

/** هل يتقاطع مجالان زمنيان بصيغة HH:mm (24 ساعة)؟ */
export function timesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false
  const as = normalizeTime(aStart)
  const ae = normalizeTime(aEnd)
  const bs = normalizeTime(bStart)
  const be = normalizeTime(bEnd)
  if (!as || !ae || !bs || !be) return false
  return as < be && bs < ae
}

/**
 * إيجاد كل تعارضات موعد مجموعة جديدة/معدَّلة مع بقية المجموعات
 * في جميع الصفوف — يكفي أن يتطابق يوم واحد مع تقاطع في الوقت
 * حتى تُعتبر المجموعتان متعارضتين (لا يجوز موعد واحد لمجموعتين).
 *
 * exclude: استبعاد المجموعة التي يتم تعديلها من المقارنة مع نفسها.
 */
export function findScheduleConflicts(
  grades: Grade[],
  candidate: { days: string[]; startTime: string; endTime: string },
  exclude?: { gradeId?: string; groupId?: string }
): ScheduleConflict[] {
  if (!candidate || candidate.days.length === 0) return []
  if (!candidate.startTime || !candidate.endTime) return []

  const conflicts: ScheduleConflict[] = []
  for (const grade of grades) {
    for (const group of grade.groups) {
      // استبعاد المجموعة نفسها عند التعديل (حتى لا تتعارض مع ذاتها)
      if (exclude?.groupId && group.id === exclude.groupId) continue

      const sharedDays = candidate.days.filter(d => group.days?.includes(d))
      if (sharedDays.length === 0) continue
      if (!group.startTime || !group.endTime) continue
      if (!timesOverlap(candidate.startTime, candidate.endTime, group.startTime, group.endTime)) continue

      for (const day of sharedDays) {
        conflicts.push({ day, group, gradeId: grade.id, gradeName: grade.name })
      }
    }
  }
  return conflicts
}

/** وصف عربي واضح لتعارض واحد (يُخبر المعلم لمن يحتل الموعد) */
export function describeConflict(c: ScheduleConflict): string {
  return (
    `يوم «${c.day}» من ${formatTime12(c.group.startTime)} إلى ${formatTime12(c.group.endTime)} ` +
    `مسجَّل بالفعل لمجموعة «${c.group.name}» في ${c.gradeName} ` +
    `(مواعيدها: ${c.group.days.join(" و")} — ${formatTime12(c.group.startTime)} إلى ${formatTime12(c.group.endTime)})`
  )
}

/** رسالة جاهزة للعرض عند محاولة حفظ مجموعة متعارضة */
export function buildConflictMessage(conflicts: ScheduleConflict[]): string {
  if (conflicts.length === 0) return ""
  const list = conflicts.slice(0, 4).map(describeConflict)
  const extra = conflicts.length > 4 ? `\nو ${conflicts.length - 4} تعارضات أخرى...` : ""
  return `لا يمكن حفظ المجموعة — الموعد محجوز لمجموعة أخرى:\n${list.join("\n")}${extra}`
}

// ------------------------------------------------------------
// 2) الجدول الآمن للطلاب (بدون أسعار / أسماء طلاب / أرقام هواتف)
// ------------------------------------------------------------

export interface PublicScheduleGroup {
  id: string
  name: string
  days: string[]
  startTime: string
  endTime: string
}

export interface PublicScheduleGrade {
  gradeId: string
  gradeName: string
  groups: PublicScheduleGroup[]
}

/** بناء نسخة الطالب من الجدول: المواعيد فقط */
export function buildPublicSchedule(grades: Grade[]): PublicScheduleGrade[] {
  return grades
    .map(g => ({
      gradeId: g.id,
      gradeName: g.name,
      groups: g.groups.map(gr => ({
        id: gr.id,
        name: gr.name,
        days: gr.days || [],
        startTime: gr.startTime || "",
        endTime: gr.endTime || "",
      })),
    }))
    .filter(s => s.groups.length > 0)
}

// ------------------------------------------------------------
// 3) نشر الجدول للطلاب
// ------------------------------------------------------------

/** مفتاح الإعدادات: هل الجدول منشور في الصفحة الرئيسية؟ */
export const SCHEDULE_PUBLISHED_KEY = "schedulePublished"
/** المعرّف الثابت لإعلان الجدول (يُحدَّث ولا يتكرر) */
export const SCHEDULE_ANNOUNCEMENT_ID = "schedule-announcement"
export const SCHEDULE_ANNOUNCEMENT_TITLE = "📅 جدول مواعيد المجموعات"

export function isSchedulePublished(): boolean {
  return getSetting(SCHEDULE_PUBLISHED_KEY) === "1"
}

export function setSchedulePublished(published: boolean): void {
  saveSetting(SCHEDULE_PUBLISHED_KEY, published ? "1" : "")
}

/** هل إعلان الجدول منشور حالياً في صفحة الإعلانات؟ */
export function hasScheduleAnnouncement(): boolean {
  return getAnnouncements().some(a => a.id === SCHEDULE_ANNOUNCEMENT_ID)
}

/** نص إعلان الجدول (نسخة الطالب — مواعيد فقط) */
export function buildScheduleAnnouncementBody(grades: Grade[]): string {
  const schedule = buildPublicSchedule(grades)
  const lines: string[] = []
  lines.push(`مواعيد المجموعات للعام الدراسي ${getStoredAcademicYear()}`)
  lines.push("")
  for (const g of schedule) {
    lines.push(`📘 ${g.gradeName}`)
    for (const gr of g.groups) {
      const time =
        gr.startTime && gr.endTime
          ? ` — من ${formatTime12(gr.startTime)} إلى ${formatTime12(gr.endTime)}`
          : ""
      lines.push(`• ${gr.name}: ${gr.days.join(" و")}${time}`)
    }
    lines.push("")
  }
  lines.push("يرجى الالتزام بالمواعيد والحضور في وقتها. مع تمنياتنا لكم بالتوفيق والنجاح 🌟")
  return lines.join("\n")
}

/**
 * نشر/تحديث إعلان الجدول في صفحة الإعلانات.
 * يستخدم معرّفاً ثابتاً حتى لا تتكرر الإعلانات عند كل تحديث للجدول.
 */
export function publishScheduleAnnouncement(
  grades: Grade[],
  pinned = true
): Announcement[] {
  const announcements = getAnnouncements()
  const body = buildScheduleAnnouncementBody(grades)
  const existing = announcements.find(a => a.id === SCHEDULE_ANNOUNCEMENT_ID)

  let updated: Announcement[]
  if (existing) {
    updated = announcements.map(a =>
      a.id === SCHEDULE_ANNOUNCEMENT_ID
        ? { ...a, title: SCHEDULE_ANNOUNCEMENT_TITLE, body, pinned }
        : a
    )
  } else {
    updated = [
      ...announcements,
      {
        id: SCHEDULE_ANNOUNCEMENT_ID,
        title: SCHEDULE_ANNOUNCEMENT_TITLE,
        body,
        pinned,
        createdAt: new Date().toISOString(),
      },
    ]
  }
  saveAnnouncements(updated)
  return updated
}

/** إزالة إعلان الجدول من صفحة الإعلانات */
export function removeScheduleAnnouncement(): Announcement[] {
  const updated = getAnnouncements().filter(a => a.id !== SCHEDULE_ANNOUNCEMENT_ID)
  saveAnnouncements(updated)
  return updated
}

