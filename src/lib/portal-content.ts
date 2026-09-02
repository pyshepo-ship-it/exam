// ============================================================
// محتوى الطالب: عزل تام حسب الصف/المجموعة
//  • الإعلانات والأسئلة المهمة: تظهر فقط لصفوفها المستهدفة
//  • الاختبارات الإلكترونية: لصفه ومجموعاته المستهدفة وضمن الإتاحة الزمنية
// ============================================================

import { Announcement, Exam } from "./data-storage"

/** إعلانات تخص هذا الصف فقط — المستهدف فارغ = إعلان عام للجميع */
export function announcementsForGrade(announcements: Announcement[], gradeId: string): Announcement[] {
  return (announcements || []).filter(a => {
    const targets = a.targetGradeIds || []
    return targets.length === 0 || targets.includes(gradeId)
  })
}

export interface ExamAvailability {
  /** هل الاختبار متاح الآن للأداء؟ */
  open: boolean
  /** لم بلغ الطالب */
  reason?: string
  from?: string
  until?: string
}

/** إتاحة الاختبار الزمنية: دائماً مفتوح أو خلال فترة يحددها المعلم */
export function examAvailability(exam: Exam, now: Date = new Date()): ExamAvailability {
  if (!exam.allowOnline) return { open: false, reason: "هذا الاختبار غير منشور للطلاب" }
  if (exam.availabilityMode !== "scheduled") return { open: true }
  const from = exam.availableFrom ? new Date(exam.availableFrom) : null
  const until = exam.availableUntil ? new Date(exam.availableUntil) : null
  if (from && now < from) {
    return {
      open: false,
      reason: `سيُفتح الاختبار في ${from.toLocaleString("ar-EG", { dateStyle: "long", timeStyle: "short" })}`,
      from: exam.availableFrom,
      until: exam.availableUntil,
    }
  }
  if (until && now > until) {
    return {
      open: false,
      reason: `انتهى موعد الاختبار في ${until.toLocaleString("ar-EG", { dateStyle: "long", timeStyle: "short" })}`,
      from: exam.availableFrom,
      until: exam.availableUntil,
    }
  }
  return { open: true, from: exam.availableFrom, until: exam.availableUntil }
}

/** هل الاختبار مخصص لهذا الطالب (صفه ومجموعته)؟ — العزل التام حسب الصف */
export function isExamForStudent(exam: Exam, gradeId: string, groupId: string): boolean {
  if (!exam.allowOnline) return false
  if (exam.gradeId && exam.gradeId !== gradeId) return false
  const targets = exam.targetGroupIds || []
  if (targets.length > 0 && groupId && !targets.includes(groupId)) return false
  return true
}

/** الدرجة الفعلية للمحاولة (تُراعي التعديل اليدوي من المعلم) */
export function effectiveAttemptScore(attempt: { score: number; manualOverride?: { score: number } }): number {
  return attempt.manualOverride && typeof attempt.manualOverride.score === "number"
    ? attempt.manualOverride.score
    : attempt.score
}

/** مفتاح آخر ظهور للإعلانات (لشارة «جديد» في بوابة الطالب) */
export const ANNOUNCEMENTS_SEEN_KEY = "studentSeenAnnouncementsAt"

export function markAnnouncementsSeen(): void {
  if (typeof window === "undefined") return
  localStorage.setItem(ANNOUNCEMENTS_SEEN_KEY, new Date().toISOString())
}

export function lastAnnouncementsSeenAt(): string {
  if (typeof window === "undefined") return ""
  return localStorage.getItem(ANNOUNCEMENTS_SEEN_KEY) || ""
}
