// Types
export interface Grade {
  id: string
  name: string
  academicYear: string
  groups: Group[]
  createdAt: string
}

export interface Group {
  id: string
  name: string
  days: string[]
  startTime: string
  endTime: string
  monthlyFee: number
  studentsCount: number
}

export interface Student {
  id: string
  name: string
  phone?: string
  /** البريد الإلكتروني (يُحدث تلقائياً عند الموافقة على طلب تسجيل من بوابة الطالب) */
  email?: string
  gradeId: string
  groupId: string
  status: 'active' | 'inactive'
  notes?: string
  /** إغلاق قناة الاستفسار لهذا الطالب تماماً — قرار المعلم */
  inquiryBlocked?: boolean
  createdAt: string
  updatedAt: string
}

/** درجة يدوية يسجلها المعلم للطالب (قسم الدرجات اليدوية) */
export interface ManualGrade {
  id: string
  studentId: string
  gradeId: string
  groupId: string
  /** عنوان التقييم مثل: اختبار الشهر الأول / مشاركة صفية */
  title: string
  score: number
  /** الدرجة الكلية */
  maxScore: number
  month: number
  year: number
  notes?: string
  createdAt: string
}

/**
 * طلب تسجيل من بوابة الطالب.
 * لا يستطيع الطالب تسجيل الدخول إلا بعد موافقة المعلم على طلبه،
 * وعند الموافقة يُربط ببيانات الطالب اليدوية (أو يُنشأ طالب جديد).
 */
export interface RegistrationRequest {
  id: string
  name: string
  phone: string
  /** هاتف ولي الأمر (إجباري عند التسجيل) */
  guardianPhone: string
  email: string
  /** بصمة كلمة المرور SHA-256 (لا تُخزَّن كلمة المرور نفسها أبداً) */
  passwordHash: string
  gradeId: string
  groupId: string
  status: 'pending' | 'approved' | 'rejected'
  reviewNote?: string
  /** معرف الطالب الذي رُبط به الطلب بعد الموافقة */
  linkedStudentId?: string
  createdAt: string
  reviewedAt?: string
}

/** طلب انضمام طالب إلى مجموعة أخرى (بنفس صفه) */
export interface GroupTransferRequest {
  id: string
  studentId: string
  studentName: string
  fromGroupId: string
  toGradeId: string
  toGroupId: string
  status: 'pending' | 'approved' | 'rejected'
  reviewNote?: string
  createdAt: string
  reviewedAt?: string
}

export type StudentHistoryType = 'account' | 'transfer' | 'honor' | 'payment' | 'grade' | 'exam' | 'attendance'

/** سجل نشاط الطالب — يظهر في تقريره وسجل حسابه */
export interface StudentHistoryEvent {
  id: string
  studentId: string
  type: StudentHistoryType
  title: string
  detail?: string
  date: string
  createdAt: string
}

/** حساب بوابة الطالب (ربط البريد بالطالب + حالة تفعيل الدخول) */
export interface StudentAccount {
  id: string // = email
  email: string
  studentId: string
  /** منع الطالب من تسجيل الدخول دون حذف بياناته */
  active: boolean
  /** بصمة كلمة المرور الحالية — تُحدَّث عند إعادة التعيين من المعلم */
  passwordHash?: string
  createdAt: string
}

export interface Due {
  id: string
  studentId: string
  groupId: string
  month: number
  year: number
  amount: number
  status: 'pending' | 'paid' | 'partial'
  createdAt: string
}

export interface Payment {
  id: string
  studentId: string
  dueId?: string
  amount: number
  paymentDate: string
  month: number
  year: number
  notes?: string
  createdAt: string
}

export type ExamTemplateId = "classic" | "lab" | "life" | "cosmos" | "explorer"

/** نوع الاختبار عند إنشائه: ورقة أوف لاين، أو اختبار يؤديه الطلاب على الموقع. */
export type ExamDeliveryMode = "offline" | "online"

/** أنماط الاختبار الإلكتروني المعتمدة. */
export type OnlineExamMode = "objective" | "essay" | "mixed"

/** حالة المراجعة وإطلاق النتيجة لمحاولة الطالب. */
export type ExamAttemptGradingStatus =
  | "submitted"
  | "pending_review"
  | "partially_reviewed"
  | "reviewed"
  | "released"

/** حكم المعلم على إجابة واحدة أثناء التصحيح اليدوي. */
export type AnswerReviewVerdict = "correct" | "half" | "incorrect" | "custom"

/**
 * من يستطيع فتح الاختبار الإلكتروني:
 *  - members: الأعضاء المسجلون فقط — يظهر للطالب في بوابته حسب صفه،
 *             وبياناته (الاسم/الصف/المجموعة) تُعبأ تلقائياً من حسابه
 *  - public : مفتوح لأي أحد بدون تسجيل — يظهر في لوحة الإعلانات (الصفحة الرئيسية)
 *             أو برابط مباشر، ويُدخل الزائر اسمه ورقم هاتفه ويختار مجموعته
 */
export type ExamAccessMode = "members" | "public"

export interface Exam {
  id: string
  gradeId: string
  groupId?: string
  title: string
  month?: number
  unit?: string
  academicYear: string
  duration?: number
  totalMarks?: number
  questions: Question[]
  /** قالب ورقة الامتحان (5 قوالب احترافية) */
  templateId?: ExamTemplateId
  /** إظهار زخارف علمية حول الأسئلة حسب الصف */
  showDecorations?: boolean
  teacherName?: string
  schoolName?: string
  /**
   * مسار الاختبار الذي اختاره المعلم عند الإنشاء.
   * السجلات القديمة بلا هذا الحقل تظل متوافقة: allowOnline=true يعني اختبار أونلاين.
   */
  deliveryMode?: ExamDeliveryMode
  /**
   * نمط الاختبار الإلكتروني: تلقائي (اختياري/صح وخطأ)، مقالي، أو مختلط.
   * لا يؤثر في الاختبار الورقي.
   */
  onlineExamMode?: OnlineExamMode
  /** نشر الاختبار الأونلاين للطلاب على الموقع ليؤدوه خلال المدة المحددة */
  allowOnline?: boolean
  /** من يفتحه: الأعضاء المسجلون فقط (افتراضي) أو أي زائر بدون تسجيل */
  accessMode?: ExamAccessMode
  /** إضافة المتفوقين تلقائياً إلى لوحة الشرف */
  autoHonorBoard?: boolean
  /** الحد الأدنى للنسبة المئوية للترشيح (100 = الدرجة الكاملة) */
  honorMinPercent?: number
  /** إتاحة الاختبار للطلاب: دائماً مفتوح أو خلال فترة يحددها المعلم */
  availabilityMode?: 'always' | 'scheduled'
  /** بداية الإتاحة (ISO) — عند الوضع المجدول */
  availableFrom?: string
  /** نهاية الإتاحة (ISO) — عند الوضع المجدول */
  availableUntil?: string
  /** المجموعات المستهدفة من الاختبار — فارغ = كل مجموعات الصف */
  targetGroupIds?: string[]
  /** أقصى عدد مرات اجتياز لكل طالب — 0 أو غير محدد = بلا حد */
  maxAttempts?: number
  /** إظهار الإجابة الصحيحة للطالب: لا أبداً / بعد كل سؤال / في نهاية الاختبار */
  answerVisibility?: 'never' | 'afterEach' | 'atEnd'
  /** المراجعة مفتوحة للجميع — بعد امتحان جميع الطلاب: يرى الطالب أسئلة الاختبار وأجوبته والأجوبة الصحيحة ودرجته في أي وقت */
  reviewOpen?: boolean
  createdAt: string
  updatedAt: string
}

export interface Question {
  id: string
  questionType: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  questionNumber: number
  orderNumber: number
  headerText: string
  reasoningType?: "علل" | "بم تفسر" | "اذكر أهمية" // للنوع 4
  /** وسم توجيهي اختياري للسؤال المقالي الإلكتروني، مثل: علل / فسر / قارن. */
  essayLabel?: string
  subQuestions: SubQuestion[]
}

export interface SubQuestion {
  id: string
  orderNumber: number
  questionText: string
  marks: number
  choices?: Choice[]
  parts?: QuestionPart[]
  corrections?: Correction[]
  answerLines?: number // عدد أسطر الإجابة (النوع 4)
  /** الإجابة النموذجية لسؤال أكمل (النوع 2) */
  correctAnswer?: string
  /** العبارة صحيحة؟ (النوع 3 — صح وخطأ) */
  isTrue?: boolean
}

/**
 * يعيد نوع الاختبار مع الحفاظ على توافق الاختبارات القديمة.
 * قبل إضافة خيار النوع كانت allowOnline هي الإشارة الوحيدة: true = أونلاين،
 * لذلك لا تتحول الاختبارات المنشورة سابقاً إلى أوف لاين عند التحديث.
 */
export function examDeliveryMode(exam: Pick<Exam, "deliveryMode" | "allowOnline">): ExamDeliveryMode {
  if (exam.deliveryMode === "online") return "online"
  if (exam.deliveryMode === "offline") return "offline"
  return exam.allowOnline ? "online" : "offline"
}

/** هل الاختبار من نوع أونلاين بصرف النظر عن كونه منشوراً أو مسودة؟ */
export function isOnlineExam(exam: Pick<Exam, "deliveryMode" | "allowOnline">): boolean {
  return examDeliveryMode(exam) === "online"
}

/**
 * النمط الإلكتروني المعتمد. الاختبارات القديمة تُصنّف بأمان من أسئلتها حتى
 * تستمر في العمل من دون تغيير مفاجئ في طريقة تصحيحها.
 */
export function getOnlineExamMode(
  exam: Pick<Exam, "onlineExamMode" | "questions">
): OnlineExamMode {
  if (exam.onlineExamMode === "objective" || exam.onlineExamMode === "essay" || exam.onlineExamMode === "mixed") {
    return exam.onlineExamMode
  }
  const questions = exam.questions || []
  const hasObjective = questions.some(q => q.questionType === 1 || q.questionType === 3)
  const hasEssay = questions.some(q => q.questionType !== 1 && q.questionType !== 3)
  if (hasObjective && hasEssay) return "mixed"
  if (hasEssay) return "essay"
  return "objective"
}

/** الأسئلة المعتمدة عند إنشاء اختبار إلكتروني جديد. */
export function allowedOnlineQuestionTypes(mode: OnlineExamMode): Array<Question["questionType"]> {
  if (mode === "objective") return [1, 3]
  if (mode === "essay") return [8]
  return [1, 3, 8]
}

export function isObjectiveQuestionType(questionType: Question["questionType"]): boolean {
  return questionType === 1 || questionType === 3
}

/** السؤال المقالي في الأنماط الجديدة هو السؤال الحر (8). */
export function isEssayQuestionForMode(
  question: Pick<Question, "questionType">,
  mode?: OnlineExamMode
): boolean {
  if (question.questionType === 4) return true
  if (question.questionType === 8) return true
  return mode === "essay" && !isObjectiveQuestionType(question.questionType)
}

export interface OnlineExamReadiness {
  /** صالح للنشر والأداء إلكترونياً، ولا توجد حقول أو مفاتيح تصحيح ناقصة */
  ready: boolean
  /** عناصر تمنع نشر الاختبار حتى تُستكمل */
  issues: string[]
  /** معلومات مفيدة لا تمنع النشر، مثل الدرجات التي تحتاج تصحيحاً يدوياً */
  notes: string[]
  /** درجات الأسئلة التي سيصححها النظام تلقائياً */
  autoMarks: number
  /** درجات الإجابات المقالية التي تحتاج مراجعة المعلم */
  manualMarks: number
  /** عدد الأسئلة الفرعية في الاختبار */
  questionCount: number
}

const onlineText = (value?: string): string => (value || "").trim()
const onlineMarks = (sq: SubQuestion): number => (sq.marks && sq.marks > 0 ? sq.marks : 1)

/**
 * مراجعة جاهزية اختبار أونلاين قبل النشر.
 * الأسئلة المقالية (علل، أو السؤال الحر بلا نموذج إجابة) مسموحة، لكنها تُحسب
 * كدرجات مراجعة يدوية كي لا يُنشر اختبار ناقص أو يحصل الطالب على درجة مضللة.
 */
export function getOnlineExamReadiness(
  exam: Pick<Exam, "questions" | "onlineExamMode">
): OnlineExamReadiness {
  const issues: string[] = []
  const notes: string[] = []
  const questions = exam.questions || []
  // لا نفرض قيود الأنماط الجديدة على السجلات القديمة التي لم تختر نمطاً صريحاً بعد.
  const selectedMode = exam.onlineExamMode
  const allowedTypes = selectedMode ? allowedOnlineQuestionTypes(selectedMode) : null
  let autoMarks = 0
  let manualMarks = 0
  let questionCount = 0

  if (questions.length === 0) {
    issues.push("أضف سؤالاً واحداً على الأقل قبل نشر الاختبار إلكترونياً")
  }

  questions.forEach((question, qIndex) => {
    const subs = question.subQuestions || []
    if (subs.length === 0) {
      issues.push(`السؤال ${qIndex + 1}: أضف سؤالاً فرعياً واحداً على الأقل`)
      return
    }
    if (allowedTypes && !allowedTypes.includes(question.questionType)) {
      issues.push(`السؤال ${qIndex + 1}: هذا النوع غير مسموح في نمط الاختبار الإلكتروني المختار`)
    }

    subs.forEach((sq, sqIndex) => {
      questionCount += 1
      const label = `السؤال ${qIndex + 1}، الفرعي ${sqIndex + 1}`
      const marks = onlineMarks(sq)
      const hasQuestionText = !!onlineText(sq.questionText)
      // المقال لا يُصحَّح تلقائياً حتى لو كتب المعلم نموذج إجابة؛ النموذج مرجع للمراجعة فقط.
      if (isEssayQuestionForMode(question, selectedMode)) {
        if (!hasQuestionText) issues.push(`${label}: اكتب نص السؤال`)
        manualMarks += marks
        return
      }

      if (question.questionType === 1) {
        if (!hasQuestionText) issues.push(`${label}: اكتب نص السؤال`)
        const choices = sq.choices || []
        if (choices.length < 2 || choices.some(choice => !onlineText(choice.choiceText))) {
          issues.push(`${label}: اكتب نص كل خيارات الإجابة`)
        }
        const correct = choices.filter(choice => choice.isCorrect)
        if (correct.length !== 1 || !onlineText(correct[0]?.choiceText)) {
          issues.push(`${label}: حدّد إجابة صحيحة واحدة للتصحيح الآلي`)
        } else {
          autoMarks += marks
        }
        return
      }

      if (question.questionType === 2) {
        const hasSentence = (sq.parts || []).some(part => !!onlineText(part.partText)) || hasQuestionText
        if (!hasSentence) issues.push(`${label}: اكتب العبارة المراد إكمالها`)
        if (!onlineText(sq.correctAnswer)) {
          issues.push(`${label}: اكتب الإجابة الصحيحة للفراغ`)
        } else {
          autoMarks += marks
        }
        return
      }

      if (question.questionType === 3) {
        if (!hasQuestionText) issues.push(`${label}: اكتب نص العبارة`)
        if (typeof sq.isTrue !== "boolean") {
          issues.push(`${label}: اختر صح أو خطأ للتصحيح الآلي`)
        } else {
          autoMarks += marks
        }
        return
      }

      if (question.questionType === 5) {
        if (!hasQuestionText) issues.push(`${label}: اكتب نص العبارة`)
        const correction = sq.corrections?.[0]
        if (!correction || !correction.wordPosition || correction.wordPosition < 1) {
          issues.push(`${label}: حدّد الكلمة أو الكلمات المطلوب تصويبها`)
        }
        if (!onlineText(correction?.correctAnswer)) {
          issues.push(`${label}: اكتب التصويب الصحيح`)
        } else {
          autoMarks += marks
        }
        return
      }

      if (question.questionType === 4) {
        if (!hasQuestionText) issues.push(`${label}: اكتب نص السؤال`)
        manualMarks += marks
        return
      }

      if (question.questionType === 6 || question.questionType === 7) {
        if (!hasQuestionText) issues.push(`${label}: اكتب نص السؤال`)
        if (!onlineText(sq.correctAnswer)) {
          issues.push(`${label}: اكتب مفتاح التصحيح`)
        } else {
          autoMarks += marks
        }
        return
      }

      // السؤال الحر: يمكن تركه للمراجعة اليدوية، أو إدخال نموذج مختصر ليصححه النظام.
      if (!hasQuestionText) issues.push(`${label}: اكتب نص السؤال`)
      if (onlineText(sq.correctAnswer)) autoMarks += marks
      else manualMarks += marks
    })
  })

  if (manualMarks > 0) {
    notes.push(`${manualMarks} درجة تحتاج مراجعة يدوية بعد التسليم`)
  }
  if (autoMarks > 0) {
    notes.push(`${autoMarks} درجة ستُصحَّح تلقائياً`)
  }

  return { ready: issues.length === 0, issues, notes, autoMarks, manualMarks, questionCount }
}

export interface Choice {
  id: string
  choiceKey: string
  choiceText: string
  isCorrect: boolean
}

export interface QuestionPart {
  id: string
  partOrder: number
  partText: string
  blankPosition: 'before' | 'after' | 'between'
}

export interface Correction {
  id: string
  wrongWord: string
  correctAnswer: string
  wordPosition: number // رقم الكلمة التي يبدأ منها الخط (تبدأ من 1)
  wordCount?: number // عدد الكلمات المتتالية تحتها خط
}

export interface Session {
  id: string
  groupId: string
  sessionDate: string
  startTime: string
  endTime: string
  notes?: string
  createdAt: string
}

export interface Attendance {
  id: string
  sessionId: string
  studentId: string
  /** مجموعة الطالب — للعرض اليومي بدون حصص */
  groupId?: string
  /** تاريخ الحضور YYYY-MM-DD */
  date?: string
  status: 'present' | 'absent' | 'late' | 'excused'
  lateMinutes?: number
  notes?: string
  createdAt: string
}

export interface ExamAttemptAnswerReview {
  /** قرار سريع للمعلم: كامل / نصف / صفر / درجة مخصصة */
  verdict?: AnswerReviewVerdict
  /** الدرجة المعتمدة لهذه الإجابة؛ وجودها يتغلب على التصحيح الآلي عند الحاجة */
  awardedMarks?: number
  /** تعليق يظهر للطالب فقط بعد إطلاق النتيجة */
  comment?: string
  /** تصحيح أو إجابة نموذجية اختيارية للطالب */
  correction?: string
  reviewedAt?: string
}

export interface ExamAttemptAnswer {
  choiceId?: string
  text?: string
  isTrue?: boolean
  review?: ExamAttemptAnswerReview
}

export interface ExamAttempt {
  id: string
  examId: string
  studentId?: string
  studentName: string
  /** رقم هاتف الزائر — يُطلب في الاختبارات المفتوحة للجميع (بلا تسجيل دخول) */
  phone?: string
  groupId: string
  gradeId: string
  answers: Record<string, ExamAttemptAnswer>
  /** مفاتيح موضوعية أصدرها الخادم لهذه الجلسة فقط وفق إعداد إظهار الإجابات. */
  answerFeedback?: Record<string, { choiceId?: string; text?: string; isTrue?: boolean }>
  /** الدرجة الآلية الأصلية (تُحفظ للتوافق ولمراجعة أي تعديل لاحق) */
  score: number
  /** مجموع درجات الاختبار كلها، بما فيها المقال */
  totalMarks: number
  autoScore?: number
  autoTotal?: number
  manualScore?: number
  manualTotal?: number
  gradingStatus?: ExamAttemptGradingStatus
  /** لا تُعرض التعليقات/الدرجات اليدوية للطالب قبل هذا الوقت */
  resultReleasedAt?: string
  reviewedAt?: string
  startedAt: string
  submittedAt: string
  durationSeconds: number
  /** انتهى الوقت وفق ساعة الخادم/المؤقت قبل تسليم المحاولة. */
  timedOut?: boolean
  /** تعديل يدوي من المعلم لتقدير الدرجة إذا شعر أن التصحيح الآلي غير عادل */
  manualOverride?: {
    score: number
    reason?: string
    at: string
  }
}

// ---- الإعلانات ولوحة الشرف والملفات والروابط ----

export interface Announcement {
  id: string
  title: string
  body: string
  pinned: boolean
  /** الصفوف المستهدفة — فارغ = إعلان عام للجميع */
  targetGradeIds?: string[]
  createdAt: string
}

/** رسالة داخل استفسار طالب (ليست محادثة مفتوحة — رسالة واحدة ورد عليها) */
export interface InquiryMessage {
  from: 'student' | 'teacher'
  text: string
  at: string
}

/** استفسار طالب: يرسل استفساراً واحداً ويرد المعلم، ويبقى مفتوحاً للرد التالي أو يُغلق */
export interface InquiryThread {
  id: string
  studentId: string
  studentName: string
  gradeId?: string
  groupId?: string
  messages: InquiryMessage[]
  status: 'open' | 'closed'
  createdAt: string
  updatedAt: string
}

export interface Honoree {
  id: string
  studentId?: string
  studentName: string
  groupId: string
  reason: string
  month: number // 1-12
  year: number
  /** مدة الظهور في لوحة الشرف بالأيام (الافتراضي 30) — إن تُرك فارغاً يُعرض طوال الشهر المحدد */
  days?: number
  examId?: string
  score?: number
  autoPromoted?: boolean
  createdAt: string
}

export interface SharedFile {
  id: string
  name: string
  description?: string
  source: 'upload' | 'link'
  dataUrl?: string // للملفات المرفوعة (base64)
  url?: string // للروابط الخارجية
  addedAt: string
}

export interface ImportantLink {
  id: string
  title: string
  url: string
  addedAt: string
}

// ---- أرشيف السنوات الدراسية المغلقة ----

export interface YearArchive {
  academicYear: string
  closedAt: string
  stats: {
    grades: number
    groups: number
    students: number
    dues: number
    payments: number
    exams: number
    sessions: number
    attendance: number
  }
  data: {
    grades: Grade[]
    students: Student[]
    dues: Due[]
    payments: Payment[]
    exams: Exam[]
    sessions: Session[]
    attendance: Attendance[]
  }
}

// Storage Keys (مفتاح المرآة المحلية — المصدر الحقيقي هو Supabase)
import { STORAGE_KEYS } from "./storage-keys"
import { readRows, writeRows, readSetting, writeSetting } from "./memory-store"
import { attendanceDayId } from "./weekdays"
import {
  queuePush,
  pushGrades,
  pushStudents,
  pushDues,
  pushPayments,
  pushExams,
  pushSessions,
  pushAttendance,
  pushAnnouncements,
  pushHonorees,
  pushSharedFiles,
  pushImportantLinks,
  pushYearArchives,
  pushSetting,
  pushExamAttempts,
  pushManualGrades,
  pushRegistrationRequests,
  pushGroupTransferRequests,
  pushStudentHistory,
  pushStudentAccounts,
  pushInquiries,
} from "./supabase/sync"

/**
 * ترتيب الصفوف حسب المرحلة الدراسية المستخرجة من الاسم العربي
 * (الأول، الثاني... العاشر) — ما لا يحمل اسماً ترتيبياً يبقى في آخر القائمة
 * بنفس ترتيبه النسبي. الترتيب ثابت (stable) ولا يعيد خلط المتساوين.
 */
export function sortGradesByLevel<T extends { name: string }>(grades: T[]): T[] {
  // أولاً المركبة (الحادي عشر...) ثم المفردة — لأن «الثاني» جزء من «الثاني عشر»
  const ORDINALS: [string, number][] = [
    ["الحادي عشر", 11],
    ["الثاني عشر", 12],
    ["الاول", 1], ["الثاني", 2], ["الثالث", 3], ["الرابع", 4], ["الخامس", 5],
    ["السادس", 6], ["السابع", 7], ["الثامن", 8], ["التاسع", 9], ["العاشر", 10],
  ]
  const levelOf = (name: string): number => {
    // طبّع الاسم: إزالة التطويل وتوحيد الهمزات والألف
    const n = (name || "").replace(/\u0640/g, "").replace(/[أإآ]/g, "ا")
    let ordinal = 0
    for (const [word, value] of ORDINALS) {
      const w = word.replace(/[أإآ]/g, "ا")
      if (n.includes(w)) {
        ordinal = value
        break
      }
    }
    if (ordinal === 0) return 999
    // المرحلة تحدد الإزاحة: الابتدائي 1-6، الإعدادي 7-9، الثانوي 10-12
    if (n.includes("الثانوي")) return 9 + ordinal
    if (n.includes("الاعدادي")) return 6 + ordinal
    return ordinal
  }
  return grades
    .map((g, i) => ({ g, i, level: levelOf(g.name) }))
    .sort((a, b) => (a.level - b.level) || (a.i - b.i))
    .map(x => x.g)
}

// ------------------------------------------------------------
// القراءة والكتابة — من ذاكرة الجلسة فقط (لا تخزين محلي على الجهاز)
// السحابة (Supabase) هي المكان الوحيد الذي تُسجَّل فيه البيانات:
//   • القراءة: مما جاء من السحابة عند فتح الصفحة (pullAllData / fetchPublicData)
//   • الكتابة: إلى السحابة (queuePush) ثم تحديث الذاكرة للعرض الفوري
// ------------------------------------------------------------
export const getFromStore = <T>(key: string): T[] => readRows<T>(key)
export const saveToStore = <T>(key: string, data: T[]): void => writeRows<T>(key, data)

// Grades
export const getGrades = (): Grade[] => getFromStore<Grade>(STORAGE_KEYS.GRADES)
export const saveGrades = (grades: Grade[]): void => {
  saveToStore(STORAGE_KEYS.GRADES, grades)
  queuePush(() => pushGrades(grades))
}

// Students
export const getStudents = (): Student[] => getFromStore<Student>(STORAGE_KEYS.STUDENTS)
export const saveStudents = (students: Student[]): void => {
  saveToStore(STORAGE_KEYS.STUDENTS, students)
  queuePush(() => pushStudents(students))
}

// Dues
export const getDues = (): Due[] => getFromStore<Due>(STORAGE_KEYS.DUES)
export const saveDues = (dues: Due[]): void => {
  saveToStore(STORAGE_KEYS.DUES, dues)
  queuePush(() => pushDues(dues))
}

// Payments
export const getPayments = (): Payment[] => getFromStore<Payment>(STORAGE_KEYS.PAYMENTS)
export const savePayments = (payments: Payment[]): void => {
  saveToStore(STORAGE_KEYS.PAYMENTS, payments)
  queuePush(() => pushPayments(payments))
}

// Exams
export const getExams = (): Exam[] => getFromStore<Exam>(STORAGE_KEYS.EXAMS)
export const saveExams = (exams: Exam[]): void => {
  saveToStore(STORAGE_KEYS.EXAMS, exams)
  queuePush(() => pushExams(exams))
}

// Sessions
export const getSessions = (): Session[] => getFromStore<Session>(STORAGE_KEYS.SESSIONS)
export const saveSessions = (sessions: Session[]): void => {
  saveToStore(STORAGE_KEYS.SESSIONS, sessions)
  queuePush(() => pushSessions(sessions))
}

// Attendance
export const getAttendance = (): Attendance[] => getFromStore<Attendance>(STORAGE_KEYS.ATTENDANCE)
export const saveAttendance = (attendance: Attendance[]): void => {
  saveToStore(STORAGE_KEYS.ATTENDANCE, attendance)
  queuePush(() => pushAttendance(attendance))
}

export const getExamAttempts = (): ExamAttempt[] => getFromStore<ExamAttempt>(STORAGE_KEYS.EXAM_ATTEMPTS)
export const saveExamAttempts = (attempts: ExamAttempt[], opts?: { sync?: boolean }): void => {
  saveToStore(STORAGE_KEYS.EXAM_ATTEMPTS, attempts)
  if (opts?.sync === false) return
  queuePush(() => pushExamAttempts(attempts))
}

// Announcements
export const getAnnouncements = (): Announcement[] => getFromStore<Announcement>(STORAGE_KEYS.ANNOUNCEMENTS)
export const saveAnnouncements = (items: Announcement[]): void => {
  saveToStore(STORAGE_KEYS.ANNOUNCEMENTS, items)
  queuePush(() => pushAnnouncements(items))
}

// Honorees (لوحة الشرف)
export const getHonorees = (): Honoree[] => getFromStore<Honoree>(STORAGE_KEYS.HONOREES)
export const saveHonorees = (items: Honoree[]): void => {
  saveToStore(STORAGE_KEYS.HONOREES, items)
  queuePush(() => pushHonorees(items))
}

// Shared files
export const getSharedFiles = (): SharedFile[] => getFromStore<SharedFile>(STORAGE_KEYS.SHARED_FILES)
export const saveSharedFiles = (items: SharedFile[]): void => {
  saveToStore(STORAGE_KEYS.SHARED_FILES, items)
  queuePush(() => pushSharedFiles(items))
}

// Important links
export const getImportantLinks = (): ImportantLink[] => getFromStore<ImportantLink>(STORAGE_KEYS.IMPORTANT_LINKS)
export const saveImportantLinks = (items: ImportantLink[]): void => {
  saveToStore(STORAGE_KEYS.IMPORTANT_LINKS, items)
  queuePush(() => pushImportantLinks(items))
}

// الدرجات اليدوية
export const getManualGrades = (): ManualGrade[] => getFromStore<ManualGrade>(STORAGE_KEYS.MANUAL_GRADES)
export const saveManualGrades = (items: ManualGrade[]): void => {
  saveToStore(STORAGE_KEYS.MANUAL_GRADES, items)
  queuePush(() => pushManualGrades(items))
}

// طلبات التسجيل
export const getRegistrationRequests = (): RegistrationRequest[] => getFromStore<RegistrationRequest>(STORAGE_KEYS.REGISTRATION_REQUESTS)
export const saveRegistrationRequests = (items: RegistrationRequest[]): void => {
  saveToStore(STORAGE_KEYS.REGISTRATION_REQUESTS, items)
  queuePush(() => pushRegistrationRequests(items))
}

// طلبات نقل المجموعة
export const getGroupTransferRequests = (): GroupTransferRequest[] => getFromStore<GroupTransferRequest>(STORAGE_KEYS.GROUP_TRANSFER_REQUESTS)
export const saveGroupTransferRequests = (items: GroupTransferRequest[]): void => {
  saveToStore(STORAGE_KEYS.GROUP_TRANSFER_REQUESTS, items)
  queuePush(() => pushGroupTransferRequests(items))
}

// سجل نشاط الطلاب
export const getStudentHistory = (): StudentHistoryEvent[] => getFromStore<StudentHistoryEvent>(STORAGE_KEYS.STUDENT_HISTORY)
export const saveStudentHistory = (items: StudentHistoryEvent[]): void => {
  saveToStore(STORAGE_KEYS.STUDENT_HISTORY, items)
  queuePush(() => pushStudentHistory(items))
}

/** إضافة حدث لسجل نشاط طالب (اختصار) */
export const addStudentHistoryEvent = (event: Omit<StudentHistoryEvent, 'id' | 'createdAt'>): StudentHistoryEvent => {
  const full: StudentHistoryEvent = {
    ...event,
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  }
  saveStudentHistory([...getStudentHistory(), full])
  return full
}

// حسابات بوابة الطلاب
export const getStudentAccounts = (): StudentAccount[] => getFromStore<StudentAccount>(STORAGE_KEYS.STUDENT_ACCOUNTS)

// ---------- الاستفسارات ----------
export const getInquiries = (): InquiryThread[] => getFromStore<InquiryThread>(STORAGE_KEYS.INQUIRIES)
export const saveInquiries = (items: InquiryThread[]): void => {
  saveToStore(STORAGE_KEYS.INQUIRIES, items)
  queuePush(() => pushInquiries(items))
}
export const saveStudentAccounts = (items: StudentAccount[]): void => {
  saveToStore(STORAGE_KEYS.STUDENT_ACCOUNTS, items)
  queuePush(() => pushStudentAccounts(items))
}

// ---- إدارة العام الدراسي ----

/**
 * السنة الدراسية الحالية محسوبة تلقائياً من التاريخ:
 * من سبتمبر حتى أغسطس تكون السنة الدراسية = (السنة الحالية) - (السنة التالية)
 * مثال: سبتمبر 2026 → 2026-2027
 */
export const getCurrentAcademicYear = (now: Date = new Date()): string => {
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-12
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

/** السنة التالية لأي سنة دراسية بصيغة 2026-2027 → 2027-2028 */
export const getNextAcademicYear = (academicYear: string): string => {
  const startYear = parseInt(academicYear, 10)
  if (isNaN(startYear)) return getCurrentAcademicYear()
  return `${startYear + 1}-${startYear + 2}`
}

/** السنة الدراسية من إعدادات السحابة (أو الحالية محسوباً تلقائياً إن لم تصل بعد) */
export const getStoredAcademicYear = (): string => {
  const stored = readSetting(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR, "")
  return stored && stored.trim() ? stored : getCurrentAcademicYear()
}

/** تُحفظ في Supabase (app_settings) وتُحدِّث ذاكرة الجلسة للعرض الفوري */
export const saveAcademicYear = (academicYear: string): void => {
  writeSetting(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR, academicYear)
  queuePush(() => pushSetting("currentAcademicYear", academicYear))
}

/** اقتراح السنة التي يجب فتحها بعد إغلاق سنة معينة */
export const suggestNextAcademicYear = (closedYear: string): string => {
  const current = getCurrentAcademicYear()
  const next = getNextAcademicYear(closedYear)
  const parseStart = (y: string) => parseInt(y, 10) || 0
  return parseStart(next) >= parseStart(current) ? next : current
}

export const getYearArchives = (): YearArchive[] => getFromStore<YearArchive>(STORAGE_KEYS.YEAR_ARCHIVES)

export const saveYearArchives = (archives: YearArchive[]): void => {
  saveToStore(STORAGE_KEYS.YEAR_ARCHIVES, archives)
  queuePush(() => pushYearArchives(archives))
}

// إعدادات عامة (مفتاح/قيمة) — مثل رقم واتساب التواصل.
// مكانها الدائم جدول app_settings في Supabase، والذاكرة للعرض الفوري فقط.
export const getSetting = (key: string, fallback = ""): string => readSetting(key, fallback)

export const saveSetting = (key: string, value: string): void => {
  writeSetting(key, value)
  queuePush(() => pushSetting(key, value))
}

/**
 * إغلاق السنة الدراسية الحالية:
 * - أرشفة جميع بياناتها (الصفوف، المجموعات، الطلاب، التحصيل، الاختبارات، الحضور)
 * - تفريغ البيانات النشطة للبدء من جديد
 * (الإعلانات ولوحة الشرف والملفات والروابط لا تتأثر لأنها محتوى عام)
 */
export const closeAcademicYear = (academicYear: string): YearArchive => {
  const data = {
    grades: getGrades(),
    students: getStudents(),
    dues: getDues(),
    payments: getPayments(),
    exams: getExams(),
    sessions: getSessions(),
    attendance: getAttendance(),
  }

  const archive: YearArchive = {
    academicYear,
    closedAt: new Date().toISOString(),
    stats: {
      grades: data.grades.length,
      groups: data.grades.reduce((sum, g) => sum + g.groups.length, 0),
      students: data.students.length,
      dues: data.dues.length,
      payments: data.payments.length,
      exams: data.exams.length,
      sessions: data.sessions.length,
      attendance: data.attendance.length,
    },
    data,
  }

  // إزالة أي أرشيف سابق بنفس السنة (للأمان) ثم إضافة الأرشيف الجديد
  const archives = getYearArchives().filter(a => a.academicYear !== academicYear)
  archives.push(archive)
  saveYearArchives(archives)

  // تفريغ البيانات النشطة
  saveGrades([])
  saveStudents([])
  saveDues([])
  savePayments([])
  saveExams([])
  saveSessions([])
  saveAttendance([])

  return archive
}

/** استعادة بيانات سنة مغلقة (تستبدل البيانات النشطة الحالية) */
export const restoreYearArchive = (academicYear: string): boolean => {
  const archives = getYearArchives()
  const archive = archives.find(a => a.academicYear === academicYear)
  if (!archive) return false

  saveGrades(archive.data.grades)
  saveStudents(archive.data.students)
  saveDues(archive.data.dues)
  savePayments(archive.data.payments)
  saveExams(archive.data.exams)
  saveSessions(archive.data.sessions)
  saveAttendance(archive.data.attendance)
  return true
}

export const deleteYearArchive = (academicYear: string): void => {
  const archives = getYearArchives().filter(a => a.academicYear !== academicYear)
  saveYearArchives(archives)
}

// ---- لوحة الشرف: helpers ----

/**
 * هل المكرَّم معروض حالياً في لوحة الشرف؟
 *  - إن حدد المعلم مدة بالأيام (الافتراضي عند الإضافة 30): يُعرض من لحظة الإضافة حتى انتهاء المدة.
 *  - السجلات القديمة (بدون مدة): تُعرض طوال الشهر والعام المحددين (السلوك السابق).
 */
export const isHonoreeActive = (honoree: Honoree, now: Date = new Date()): boolean => {
  if (honoree.days && honoree.days > 0 && honoree.createdAt) {
    const end = new Date(honoree.createdAt).getTime() + honoree.days * 24 * 60 * 60 * 1000
    return now.getTime() <= end
  }
  return honoree.month === now.getMonth() + 1 && honoree.year === now.getFullYear()
}

/** كل المجموعات في جميع الصفوف مع اسم الصف */
export const getAllGroups = (grades: Grade[]) =>
  grades.flatMap(g => g.groups.map(gr => ({ ...gr, gradeName: g.name, gradeId: g.id })))

/** مجموعات صف واحد فقط — للقوائم المنسدلة المتسلسلة (صف → مجموعة) */
export const getGroupsOfGrade = (grades: Grade[], gradeId?: string): Group[] => {
  if (!gradeId) return []
  return grades.find(g => g.id === gradeId)?.groups || []
}

/** معرّفات السجلات اليومية لمجموعة في تاريخ معيّن (الجديد + أي سجل قديم لنفس اليوم) */
export const getSessionIdsForGroupDay = (groupId: string, isoDate: string): Set<string> => {
  const ids = new Set<string>([attendanceDayId(groupId, isoDate)])
  getSessions()
    .filter(s => s.groupId === groupId && s.sessionDate === isoDate)
    .forEach(s => ids.add(s.id))
  return ids
}

function attendanceDayKey(row: Attendance): string {
  if (row.date) return row.date
  const dayMatch = /^att-.+-(\d{4}-\d{2}-\d{2})$/.exec(row.sessionId)
  if (dayMatch) return dayMatch[1]
  const session = getSessions().find(s => s.id === row.sessionId)
  return session?.sessionDate || row.sessionId
}

/**
 * حفظ حضور يوم كامل لمجموعة دون تسجيل حصة يدوياً.
 * يُنشأ سجل يومي داخلي ثابت (group+date) لربط الصفوف مع قاعدة البيانات.
 */
export const saveGroupDayAttendance = (
  groupId: string,
  isoDate: string,
  marks: { studentId: string; present: boolean }[],
  groupTimes?: { startTime: string; endTime: string }
): Attendance[] => {
  const sessionId = attendanceDayId(groupId, isoDate)
  const sessions = getSessions()
  if (!sessions.some(s => s.id === sessionId)) {
    saveSessions([
      ...sessions,
      {
        id: sessionId,
        groupId,
        sessionDate: isoDate,
        startTime: groupTimes?.startTime || "",
        endTime: groupTimes?.endTime || "",
        notes: "حضور يومي",
        createdAt: new Date().toISOString(),
      },
    ])
  }

  const sameDayIds = getSessionIdsForGroupDay(groupId, isoDate)
  const others = getAttendance().filter(
    a => !sameDayIds.has(a.sessionId) && !(a.groupId === groupId && a.date === isoDate)
  )
  const now = new Date().toISOString()
  const records: Attendance[] = marks.map(m => ({
    id: `${sessionId}-${m.studentId}`,
    sessionId,
    studentId: m.studentId,
    groupId,
    date: isoDate,
    status: m.present ? "present" : "absent",
    createdAt: now,
  }))
  saveAttendance([...others, ...records])
  return records
}

export const getGroupDayAttendance = (groupId: string, isoDate: string): Attendance[] => {
  const sessionIds = getSessionIdsForGroupDay(groupId, isoDate)
  const rows = getAttendance().filter(
    a => sessionIds.has(a.sessionId) || (a.groupId === groupId && a.date === isoDate)
  )
  // إن وُجد أكثر من سجل لنفس الطالب في نفس اليوم نأخذ الأحدث
  const byStudent = new Map<string, Attendance>()
  for (const row of rows) {
    const prev = byStudent.get(row.studentId)
    if (!prev || (row.createdAt || "") >= (prev.createdAt || "")) {
      byStudent.set(row.studentId, row)
    }
  }
  return [...byStudent.values()]
}

/** تواريخ الحضور المسجَّلة لمجموعة (الأحدث أولاً) */
export const getGroupAttendanceDates = (groupId: string): string[] => {
  const sessionDates = getSessions()
    .filter(s => s.groupId === groupId)
    .map(s => s.sessionDate)
  const attDates = getAttendance()
    .filter(a => a.groupId === groupId && a.date)
    .map(a => a.date as string)
  return [...new Set([...sessionDates, ...attDates].filter(Boolean))].sort((a, b) => (a < b ? 1 : -1))
}

export const getAttendanceForGroup = (groupId: string): Attendance[] => {
  const sessionIds = new Set(getSessions().filter(s => s.groupId === groupId).map(s => s.id))
  const rows = getAttendance().filter(
    a => a.groupId === groupId || sessionIds.has(a.sessionId) || a.sessionId.startsWith(`att-${groupId}-`)
  )
  const byStudentDay = new Map<string, Attendance>()
  for (const row of rows) {
    const key = `${row.studentId}|${attendanceDayKey(row)}`
    const prev = byStudentDay.get(key)
    if (!prev || (row.createdAt || "") >= (prev.createdAt || "")) {
      byStudentDay.set(key, row)
    }
  }
  return [...byStudentDay.values()]
}

/**
 * إضافة طالب متفوق تلقائياً إلى لوحة الشرف إن حقق نسبة الاختبار المطلوبة.
 * لا يكرر نفس الطالب لنفس الاختبار في نفس الشهر.
 */
export const maybeAutoHonor = (opts: {
  exam: Exam
  studentName: string
  groupId: string
  studentId?: string
  score: number
  totalMarks: number
  /** false = حفظ محلي فقط (صفحة الطالب العامة) */
  sync?: boolean
}): Honoree | null => {
  const { exam, studentName, groupId, studentId, score, totalMarks } = opts
  if (!exam.autoHonorBoard) return null
  if (totalMarks <= 0) return null
  const min = exam.honorMinPercent ?? 100
  const percent = (score / totalMarks) * 100
  if (percent + 1e-9 < min) return null

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const honorees = getHonorees()
  const honorId = `auto-${exam.id}-${studentId || studentName}-${month}-${year}`
  const already = honorees.some(h => {
    if (h.id === honorId) return true
    if (h.month !== month || h.year !== year) return false
    if (h.examId && h.examId === exam.id) {
      if (studentId && h.studentId === studentId) return true
      return h.studentName === studentName && h.groupId === groupId
    }
    return false
  })
  if (already) return null

  const honoree: Honoree = {
    id: honorId,
    studentId,
    studentName,
    groupId,
    reason: `متفوق هذا الشهر — ${score}/${totalMarks} في ${exam.title}`,
    month,
    year,
    examId: exam.id,
    score,
    autoPromoted: true,
    createdAt: now.toISOString(),
  }
  const next = [...honorees, honoree]
  if (opts.sync === false) {
    saveToStore(STORAGE_KEYS.HONOREES, next)
  } else {
    saveHonorees(next)
  }
  return honoree
}

/** Helper: Calculate student balance */
export const getStudentBalance = (studentId: string): { totalDues: number; totalPayments: number; balance: number } => {
  const dues = getDues().filter(d => d.studentId === studentId)
  const payments = getPayments().filter(p => p.studentId === studentId)
  
  const totalDues = dues.reduce((sum, d) => sum + d.amount, 0)
  const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0)
  
  return {
    totalDues,
    totalPayments,
    balance: totalDues - totalPayments,
  }
}

/** Helper: Get student with grade and group names */
export const getStudentWithDetails = (student: Student): Student & { gradeName: string; groupName: string } => {
  const grades = getGrades()
  const grade = grades.find(g => g.id === student.gradeId)
  const group = grade?.groups.find(gr => gr.id === student.groupId)
  
  return {
    ...student,
    gradeName: grade?.name || 'غير محدد',
    groupName: group?.name || 'غير محدد',
  }
}

// ------------------------------------------------------------
// الحذف المتسلسل (Cascade) — يعكس سلوك قاعدة البيانات (FK CASCADE/SET NULL)
// في ذاكرة الجلسة والدفع معاً حتى لا تبقى بيانات يتيمة داخل الجلسة.
// كل دالة تحفظ بالترتيب المعتمد (الصفوف ← الطلاب ← المال ← الحصص ← البوابة).
// ------------------------------------------------------------

/**
 * يُزيل/يُعلّق كل المراجع حسب مجموعات الحذف:
 *  gradeIds: صفوف محذوفة نهائياً (مجموعاتها + حصصها + حضورها تُحذف،
 *            وطلابها واختباراتها واستحقاقاتها تبقى لكن بلا صف/مجموعة — SET NULL)
 *  groupIds: مجموعات محذوفة (داخل الصفوف المحذوفة أو بمفردها)
 *  studentIds: طلاب محذوفون نهائياً (مع مالهم وحضورهم ودرجاتهم وحساباتهم — CASCADE)
 */
function applyCascadeDelete(opts: { gradeIds?: Set<string>; groupIds?: Set<string>; studentIds?: Set<string> }): void {
  const gradeIds = opts.gradeIds || new Set<string>()
  const groupIds = opts.groupIds || new Set<string>()
  const studentIds = opts.studentIds || new Set<string>()
  const now = new Date().toISOString()

  // المجموعات المحذوفة تشمل مجموعات الصفوف المحذوفة + المحددة مباشرة
  const droppedGroupIds = new Set<string>([
    ...groupIds,
    ...getGrades().filter(g => gradeIds.has(g.id)).flatMap(g => g.groups.map(gr => gr.id)),
  ])
  // الصفوف — تُحذف من قائمة الصفوف، والمجموعات المحذوفة تُحذف من صفوفها الباقية
  const grades = getGrades()
    .filter(g => !gradeIds.has(g.id))
    .map(g =>
      g.groups.some(gr => droppedGroupIds.has(gr.id))
        ? { ...g, groups: g.groups.filter(gr => !droppedGroupIds.has(gr.id)) }
        : g
    )
  // حصص المجموعات المحذوفة — تُحذف نهائياً (كما تفعل CASCADE في القاعدة)
  const droppedSessionIds = new Set(
    getSessions().filter(s => droppedGroupIds.has(s.groupId)).map(s => s.id)
  )

  // الطلاب: حذف (studentIds) أو تعليق مرجع الصف/المجموعة (SET NULL) — دون حذفهم
  const students = getStudents()
    .filter(s => !studentIds.has(s.id))
    .map(s => {
      if (gradeIds.has(s.gradeId)) return { ...s, gradeId: "", groupId: "", updatedAt: now }
      if (droppedGroupIds.has(s.groupId)) return { ...s, groupId: "", updatedAt: now }
      return s
    })
  const keptStudentIds = new Set(students.map(s => s.id))

  // الاستحقاقات: تُحذف مع طلابها (CASCADE) ويُفرَّغ مرجع مجموعتها المحذوفة
  const dues = getDues()
    .filter(d => !studentIds.has(d.studentId) && keptStudentIds.has(d.studentId))
    .map(d => (droppedGroupIds.has(d.groupId) ? { ...d, groupId: "" } : d))

  // المدفوعات: تُحذف مع طلابها فقط
  const payments = getPayments().filter(p => !studentIds.has(p.studentId) && keptStudentIds.has(p.studentId))

  // الاختبارات: تبقى لكن بلا صف/مجموعة محذوفة (SET NULL)
  const exams = getExams().map(e => {
    if (gradeIds.has(e.gradeId) || (e.groupId && droppedGroupIds.has(e.groupId))) {
      return { ...e, gradeId: "", groupId: "" }
    }
    return e
  })

  // الحصص والحضور: تُحذف حصص المجموعات المحذوفة + حضور الطلاب المحذوفين
  const sessions = getSessions().filter(s => !droppedSessionIds.has(s.id))
  const attendance = getAttendance().filter(
    a => !droppedSessionIds.has(a.sessionId) &&
      !droppedGroupIds.has(a.groupId as string) &&
      !studentIds.has(a.studentId)
  )

  // الدرجات اليدوية: تُحذف مع طلابها ويُفرَّغ مرجع صف/مجموعة محذوفة
  const manualGrades = getManualGrades()
    .filter(m => !studentIds.has(m.studentId) && keptStudentIds.has(m.studentId))
    .map(m => {
      let out: ManualGrade = m
      if (gradeIds.has(m.gradeId as string)) out = { ...out, gradeId: "" }
      if (droppedGroupIds.has(m.groupId as string)) out = { ...out, groupId: "" }
      return out
    })

  // بوابة الطلاب — طبقاً لقيود قاعدة البيانات:
  //   • student_accounts / student_history / manual_grades → CASCADE (تُحذف)
  //   • registration_requests.linked_student_id → SET NULL (يبقى الطلب لكن بلا ربط)
  const accounts = getStudentAccounts().filter(a => !studentIds.has(a.studentId))
  const history = getStudentHistory().filter(h => !studentIds.has(h.studentId))
  const registrationRequests = getRegistrationRequests().map(r =>
    r.linkedStudentId && studentIds.has(r.linkedStudentId)
      ? { ...r, linkedStudentId: undefined }
      : r
  )
  const transferRequests = getGroupTransferRequests()
    .filter(t => !studentIds.has(t.studentId))
    .map(t => {
      let out: GroupTransferRequest = t
      if (droppedGroupIds.has(t.fromGroupId as string)) out = { ...out, fromGroupId: "" }
      if (droppedGroupIds.has(t.toGroupId as string)) out = { ...out, toGradeId: "", toGroupId: "" }
      return out
    })

  // الحفظ بالترتيب المعتمد — كل حفظ يدفع للسحابة ويتحقق من المراجع المعلّقة
  saveGrades(grades)
  saveStudents(students)
  saveDues(dues)
  savePayments(payments)
  saveExams(exams)
  saveSessions(sessions)
  saveAttendance(attendance)
  saveManualGrades(manualGrades)
  saveRegistrationRequests(registrationRequests)
  saveGroupTransferRequests(transferRequests)
  saveStudentHistory(history)
  saveStudentAccounts(accounts)
}

/** حذف صف نهائياً: مجموعاته وحصصه وحضوره تُحذف، وطلابه واختباراته تبقى بلا صف/مجموعة */
export function deleteGradeCascade(gradeId: string): { ok: boolean; detachedStudents?: number; removedGroups?: number } {
  const grade = getGrades().find(g => g.id === gradeId)
  if (!grade) return { ok: false }
  const studentsCount = getStudents().filter(s => s.gradeId === gradeId).length
  applyCascadeDelete({ gradeIds: new Set([gradeId]) })
  return { ok: true, detachedStudents: studentsCount, removedGroups: grade.groups.length }
}

/** حذف مجموعة واحدة: حصصها وحضورها تُحذف، وطلابها يبقون بلا مجموعة (داخل صفهم) */
export function deleteGroupCascade(gradeId: string, groupId: string): { ok: boolean; detachedStudents?: number } {
  const group = getGrades().find(g => g.id === gradeId)?.groups.find(gr => gr.id === groupId)
  if (!group) return { ok: false }
  const studentsCount = getStudents().filter(s => s.groupId === groupId).length
  applyCascadeDelete({ groupIds: new Set([groupId]) })
  return { ok: true, detachedStudents: studentsCount }
}

/**
 * حذف طالب نهائياً: مع ماله (استحقاقات/مدفوعات) وحضوره ودرجاته اليدوية وسجل نشاطه
 * وحساب بوابة الطالب وطلباته — كما تفعل قيود CASCADE في قاعدة البيانات.
 * (محاولات الاختبار السابقة تبقى في سجل النتائج باسمه — لا علاقة لها بحسابه.)
 */
export function deleteStudentCascade(studentId: string): { ok: boolean } {
  if (!getStudents().some(s => s.id === studentId)) return { ok: false }
  applyCascadeDelete({ studentIds: new Set([studentId]) })
  return { ok: true }
}
