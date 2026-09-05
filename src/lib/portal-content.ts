// ============================================================
// محتوى الطالب: عزل تام حسب الصف/المجموعة
//  • الإعلانات والأسئلة المهمة: تظهر فقط لصفوفها المستهدفة
//  • الاختبارات الإلكترونية: لصفه ومجموعاته المستهدفة وضمن الإتاحة الزمنية
// ============================================================

import { Announcement, Exam, ExamAccessMode, ExamAttempt, Grade, Group, isOnlineExam } from "./data-storage"
import { isValidPhone, isValidStudentName, normalizeDigits } from "./student-accounts"
import { readSetting, writeSetting } from "./memory-store"

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
  /** انتهى الاختبار وفُتحت المراجعة — يظل ظاهراً للطالب للمراجعة فقط */
  reviewPhase?: boolean
}

/** إتاحة الاختبار الزمنية: دائماً مفتوح أو خلال فترة يحددها المعلم */
export function examAvailability(exam: Exam, now: Date = new Date()): ExamAvailability {
  if (!isOnlineExam(exam) || !exam.allowOnline) return { open: false, reason: "هذا الاختبار غير منشور للطلاب" }
  // «تم الامتحان — فتح المراجعة للجميع» يعني انتهاء الاختبار: يبقى ظاهراً
  // للمراجعة فقط، ولا يُقبل بعده أي دخول أو إعادة محاولة.
  if (exam.reviewOpen) {
    return { open: false, reason: "انتهى هذا الاختبار — المراجعة متاحة الآن فقط", reviewPhase: true }
  }
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
  if (!isOnlineExam(exam) || !exam.allowOnline) return false
  // showInPortal = false ⇒ لا يظهر في «اختباراتي»، ويُفتح بالرابط فقط
  if (exam.showInPortal === false) return false
  if (exam.gradeId && exam.gradeId !== gradeId) return false
  const targets = exam.targetGroupIds || []
  if (targets.length > 0 && groupId && !targets.includes(groupId)) return false
  return true
}

// ============================================================
// من يفتح الاختبار: للأعضاء المسجلين فقط أم مفتوح للجميع بلا تسجيل
//  • members (الافتراضي): يظهر للطالب في بوابته حسب صفه، وبياناته
//    (الاسم/الصف/المجموعة) تُعبأ تلقائياً من حسابه — يجيب فقط
//  • public: يظهر في لوحة الإعلانات (الصفحة الرئيسية) أو برابط مباشر،
//    ويُدخل الزائر اسمه ورقم هاتفه ويختار مجموعته من مجموعات صف الاختبار
// ============================================================

/** وضع الدخول للاختبار — غير المحدد = للأعضاء فقط (سلوك آمن افتراضياً) */
export function examAccessMode(exam: Exam): ExamAccessMode {
  return exam.accessMode === "public" ? "public" : "members"
}

/** هل يقبل الاختبار زواراً بلا حساب ولا تسجيل دخول؟ */
export function isExamOpenToGuests(exam: Exam): boolean {
  return isOnlineExam(exam) && !!exam.allowOnline && examAccessMode(exam) === "public"
}

/**
 * اختبارات لوحة الإعلانات في الصفحة الرئيسية:
 * المفتوحة للجميع فقط (اختبارات الأعضاء تظهر في بوابة الطالب لا في الصفحة العامة)
 * والمتاحة الآن زمنياً.
 */
export function publicBoardExams(exams: Exam[], now: Date = new Date()): Exam[] {
  // listedOnBoard = false ⇒ «بالرابط فقط»: يفتحه من يملك الرابط ولا يراه أحد هنا
  return (exams || []).filter(e =>
    isExamOpenToGuests(e) && e.listedOnBoard !== false && examAvailability(e, now).open
  )
}

/** هل يختار الزائر صفه؟ — فقط إذا كان الاختبار عاماً (بلا صف محدد) */
export function isExamGradeSelectable(exam: Exam): boolean {
  return !exam.gradeId
}

/** صف الاختبار من جهة الزائر: ثابت من إعداد المعلم، والاختبار العام يأخذ صف الزائر */
export function examGradeIdForGuest(exam: Exam, chosenGradeId?: string): string {
  return exam.gradeId || (chosenGradeId || "")
}

/** المجموعات المتاحة للزائر في هذا الاختبار: مجموعات صفه، والمستهدفة فقط إن حُدِّدت */
export function guestGroupsForGrade(exam: Exam, grades: Grade[], gradeId: string): Group[] {
  const grade = (grades || []).find(g => g.id === gradeId)
  const groups = grade?.groups || []
  const targets = exam.targetGroupIds || []
  return targets.length > 0 ? groups.filter(g => targets.includes(g.id)) : groups
}

export interface GuestIdentityInput {
  name: string
  phone: string
  /** يُستخدم فقط مع الاختبار العام (بلا صف محدد) */
  gradeId?: string
  groupId?: string
}

export interface GuestIdentity {
  name: string
  phone: string
  gradeId: string
  groupId: string
}

/**
 * التحقق من بيانات الزائر قبل بدء الاختبار المفتوح للجميع:
 * الاسم ورقم الهاتف إجباريان، والصف محدد مسبقاً من الاختبار نفسه،
 * والمجموعة من قائمة مجموعات صفه المتاحة لهذا الاختبار فقط.
 */
export function validateGuestIdentity(
  exam: Exam,
  grades: Grade[],
  input: GuestIdentityInput
): { ok: true; identity: GuestIdentity } | { ok: false; error: string } {
  const name = (input.name || "").trim().replace(/\s+/g, " ")
  const phone = normalizeDigits(input.phone || "").replace(/[\s-]/g, "")

  if (!isValidStudentName(name)) {
    return { ok: false, error: "اكتب اسمك كاملاً بالحروف — ٥ أحرف على الأقل وبدون أرقام أو رموز" }
  }
  if (!isValidPhone(phone)) {
    return { ok: false, error: "رقم الهاتف غير صحيح — أرقام فقط بدون حروف (10-15 رقماً)" }
  }

  const gradeId = examGradeIdForGuest(exam, input.gradeId)
  if (!gradeId) return { ok: false, error: "اختر صفك للبدء" }

  const knownGrades = (grades || []).filter(g => !!g?.id)
  if (knownGrades.length === 0) {
    // تعذر جلب الصفوف (انقطاع السحابة مثلاً) — لا نمنع الطالب من الاختبار
    return { ok: true, identity: { name, phone, gradeId, groupId: input.groupId || exam.groupId || "" } }
  }
  if (!knownGrades.some(g => g.id === gradeId)) {
    return { ok: false, error: "الصف المختار غير متاح في هذا الاختبار" }
  }

  const allowed = guestGroupsForGrade(exam, grades, gradeId)
  if (allowed.length === 0) {
    if ((exam.targetGroupIds || []).length > 0) {
      return { ok: false, error: "لا توجد مجموعات متاحة لهذا الاختبار حالياً — راجع المعلم" }
    }
    // الصف بلا مجموعات معرَّفة: الاختبار يُؤدى بلا مجموعة
    return { ok: true, identity: { name, phone, gradeId, groupId: exam.groupId || "" } }
  }

  const groupId = input.groupId || ""
  if (!groupId) return { ok: false, error: "اختر مجموعتك من القائمة للبدء" }
  if (!allowed.some(g => g.id === groupId)) {
    return { ok: false, error: "هذه المجموعة غير متاحة في هذا الاختبار — اختر مجموعة من القائمة" }
  }
  return { ok: true, identity: { name, phone, gradeId, groupId } }
}

/** حالة محاولات الطالب في اختبار: متاح / استُنفدت */
export interface AttemptsStatus {
  allowed: boolean
  reason?: string
  used: number
  max: number
  /**
   * المتبقي من المحاولات — لا يقل عن صفر أبداً.
   * مع الحد غير المحدود يكون -1، ولا يُعرض للطالب رقماً إطلاقاً.
   */
  remaining: number
  /** الاختبار بلا حد للمحاولات (maxAttempts = 0 أو غير محدد) */
  unlimited: boolean
}

/**
 * عدد مرات الاجتياز المتبقية للطالب — يُحسب من محاولاته المسجلة
 * (بالربط بالحساب أولاً، وبالاسم+المجموعة للزوار قبل الحفظ)
 */
export function attemptsStatus(
  exam: Exam,
  attempts: { examId: string; studentId?: string; studentName?: string; groupId?: string }[],
  studentId?: string,
  studentName?: string,
  groupId?: string,
  /** المحاولات المسجلة سحابياً (عبر الأجهزة) — تُحتسب مع المحلية بأخذ الأكبر */
  remoteUsed: number = 0
): AttemptsStatus {
  const max = exam.maxAttempts && exam.maxAttempts > 0 ? exam.maxAttempts : 0
  const mine = (attempts || []).filter(a => {
    if (a.examId !== exam.id) return false
    if (studentId) return a.studentId === studentId
    // زائر بلا حساب: نقارن بالاسم والمجموعة
    return !!studentName && (a.studentName || "").trim() === studentName.trim() && (!groupId || a.groupId === groupId)
  })
  const used = Math.max(mine.length, remoteUsed || 0)
  if (max > 0 && used >= max) {
    return {
      allowed: false,
      reason: `استُنفدت محاولاتك (${used} من ${max}) — راجع المعلم إن كنت تحتاج محاولة أخرى`,
      used,
      max,
      remaining: 0,
      unlimited: false,
    }
  }
  // الرقم المعروض للطالب لا يكون سالباً في أي حال؛ -1 تعني «بلا حد» فقط.
  return {
    allowed: true,
    used,
    max,
    remaining: max > 0 ? Math.max(0, max - used) : -1,
    unlimited: max <= 0,
  }
}

/** الدرجة الفعلية للمحاولة (تُراعي التعديل اليدوي من المعلم) */
export function effectiveAttemptScore(attempt: {
  score: number
  autoScore?: number
  manualScore?: number
  manualOverride?: { score: number }
}): number {
  if (attempt.manualOverride && typeof attempt.manualOverride.score === "number") {
    return attempt.manualOverride.score
  }
  // المحاولات القديمة تحمل score فقط؛ الجديدة تجمع الجزء التلقائي والجزء المقالي المراجع.
  const automatic = typeof attempt.autoScore === "number" ? attempt.autoScore : attempt.score
  const manual = typeof attempt.manualScore === "number" ? attempt.manualScore : 0
  return Math.round((automatic + manual) * 100) / 100
}

/**
 * لا تُعدّ نتيجة المقال/المختلط نهائية أو مرئية للطالب قبل إطلاقها صراحةً.
 * السجلات القديمة (بلا manualTotal) تبقى مرئية حفاظاً على توافق النتائج المنشورة.
 */
export function attemptNeedsResultRelease(attempt: Pick<ExamAttempt, "manualTotal" | "gradingStatus" | "resultReleasedAt">): boolean {
  if (attempt.resultReleasedAt) return false
  if (typeof attempt.manualTotal === "number") return attempt.manualTotal > 0
  // عند سجلات انتقالية لا تحمل total يدوي، نعامل حالات المراجعة الصريحة كغير معلنة.
  return attempt.gradingStatus === "pending_review" || attempt.gradingStatus === "partially_reviewed" || attempt.gradingStatus === "reviewed"
}

/** هل يستطيع الطالب رؤية الدرجة النهائية والتعليقات الخاصة بهذه المحاولة؟ */
export function isAttemptResultReleased(attempt: Pick<ExamAttempt, "manualTotal" | "gradingStatus" | "resultReleasedAt">): boolean {
  return !attemptNeedsResultRelease(attempt)
}

/**
 * مفتاح آخر ظهور للإعلانات (لشارة «جديد» في بوابة الطالب).
 * حالة واجهة داخل ذاكرة الجلسة فقط — لا تُكتب على الجهاز ولا تُعدّ بيانات.
 */
export const ANNOUNCEMENTS_SEEN_KEY = "studentSeenAnnouncementsAt"

export function markAnnouncementsSeen(): void {
  writeSetting(ANNOUNCEMENTS_SEEN_KEY, new Date().toISOString())
}

export function lastAnnouncementsSeenAt(): string {
  return readSetting(ANNOUNCEMENTS_SEEN_KEY, "")
}
