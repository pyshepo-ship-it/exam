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
  /** نشر الاختبار للطلاب على الموقع ليؤدوه خلال المدة المحددة */
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

export interface ExamAttemptAnswer {
  choiceId?: string
  text?: string
  isTrue?: boolean
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
  score: number
  totalMarks: number
  startedAt: string
  submittedAt: string
  durationSeconds: number
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

// Helper functions
export const getFromStorage = <T>(key: string): T[] => {
  if (typeof window === 'undefined') return []
  const data = localStorage.getItem(key)
  if (!data) return []
  try {
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveToStorage = <T>(key: string, data: T[]): void => {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(data))
}

// Grades
export const getGrades = (): Grade[] => getFromStorage<Grade>(STORAGE_KEYS.GRADES)
export const saveGrades = (grades: Grade[]): void => {
  saveToStorage(STORAGE_KEYS.GRADES, grades)
  queuePush(() => pushGrades(grades))
}

// Students
export const getStudents = (): Student[] => getFromStorage<Student>(STORAGE_KEYS.STUDENTS)
export const saveStudents = (students: Student[]): void => {
  saveToStorage(STORAGE_KEYS.STUDENTS, students)
  queuePush(() => pushStudents(students))
}

// Dues
export const getDues = (): Due[] => getFromStorage<Due>(STORAGE_KEYS.DUES)
export const saveDues = (dues: Due[]): void => {
  saveToStorage(STORAGE_KEYS.DUES, dues)
  queuePush(() => pushDues(dues))
}

// Payments
export const getPayments = (): Payment[] => getFromStorage<Payment>(STORAGE_KEYS.PAYMENTS)
export const savePayments = (payments: Payment[]): void => {
  saveToStorage(STORAGE_KEYS.PAYMENTS, payments)
  queuePush(() => pushPayments(payments))
}

// Exams
export const getExams = (): Exam[] => getFromStorage<Exam>(STORAGE_KEYS.EXAMS)
export const saveExams = (exams: Exam[]): void => {
  saveToStorage(STORAGE_KEYS.EXAMS, exams)
  queuePush(() => pushExams(exams))
}

// Sessions
export const getSessions = (): Session[] => getFromStorage<Session>(STORAGE_KEYS.SESSIONS)
export const saveSessions = (sessions: Session[]): void => {
  saveToStorage(STORAGE_KEYS.SESSIONS, sessions)
  queuePush(() => pushSessions(sessions))
}

// Attendance
export const getAttendance = (): Attendance[] => getFromStorage<Attendance>(STORAGE_KEYS.ATTENDANCE)
export const saveAttendance = (attendance: Attendance[]): void => {
  saveToStorage(STORAGE_KEYS.ATTENDANCE, attendance)
  queuePush(() => pushAttendance(attendance))
}

export const getExamAttempts = (): ExamAttempt[] => getFromStorage<ExamAttempt>(STORAGE_KEYS.EXAM_ATTEMPTS)
export const saveExamAttempts = (attempts: ExamAttempt[], opts?: { sync?: boolean }): void => {
  saveToStorage(STORAGE_KEYS.EXAM_ATTEMPTS, attempts)
  if (opts?.sync === false) return
  queuePush(() => pushExamAttempts(attempts))
}

// Announcements
export const getAnnouncements = (): Announcement[] => getFromStorage<Announcement>(STORAGE_KEYS.ANNOUNCEMENTS)
export const saveAnnouncements = (items: Announcement[]): void => {
  saveToStorage(STORAGE_KEYS.ANNOUNCEMENTS, items)
  queuePush(() => pushAnnouncements(items))
}

// Honorees (لوحة الشرف)
export const getHonorees = (): Honoree[] => getFromStorage<Honoree>(STORAGE_KEYS.HONOREES)
export const saveHonorees = (items: Honoree[]): void => {
  saveToStorage(STORAGE_KEYS.HONOREES, items)
  queuePush(() => pushHonorees(items))
}

// Shared files
export const getSharedFiles = (): SharedFile[] => getFromStorage<SharedFile>(STORAGE_KEYS.SHARED_FILES)
export const saveSharedFiles = (items: SharedFile[]): void => {
  saveToStorage(STORAGE_KEYS.SHARED_FILES, items)
  queuePush(() => pushSharedFiles(items))
}

// Important links
export const getImportantLinks = (): ImportantLink[] => getFromStorage<ImportantLink>(STORAGE_KEYS.IMPORTANT_LINKS)
export const saveImportantLinks = (items: ImportantLink[]): void => {
  saveToStorage(STORAGE_KEYS.IMPORTANT_LINKS, items)
  queuePush(() => pushImportantLinks(items))
}

// الدرجات اليدوية
export const getManualGrades = (): ManualGrade[] => getFromStorage<ManualGrade>(STORAGE_KEYS.MANUAL_GRADES)
export const saveManualGrades = (items: ManualGrade[]): void => {
  saveToStorage(STORAGE_KEYS.MANUAL_GRADES, items)
  queuePush(() => pushManualGrades(items))
}

// طلبات التسجيل
export const getRegistrationRequests = (): RegistrationRequest[] => getFromStorage<RegistrationRequest>(STORAGE_KEYS.REGISTRATION_REQUESTS)
export const saveRegistrationRequests = (items: RegistrationRequest[]): void => {
  saveToStorage(STORAGE_KEYS.REGISTRATION_REQUESTS, items)
  queuePush(() => pushRegistrationRequests(items))
}

// طلبات نقل المجموعة
export const getGroupTransferRequests = (): GroupTransferRequest[] => getFromStorage<GroupTransferRequest>(STORAGE_KEYS.GROUP_TRANSFER_REQUESTS)
export const saveGroupTransferRequests = (items: GroupTransferRequest[]): void => {
  saveToStorage(STORAGE_KEYS.GROUP_TRANSFER_REQUESTS, items)
  queuePush(() => pushGroupTransferRequests(items))
}

// سجل نشاط الطلاب
export const getStudentHistory = (): StudentHistoryEvent[] => getFromStorage<StudentHistoryEvent>(STORAGE_KEYS.STUDENT_HISTORY)
export const saveStudentHistory = (items: StudentHistoryEvent[]): void => {
  saveToStorage(STORAGE_KEYS.STUDENT_HISTORY, items)
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
export const getStudentAccounts = (): StudentAccount[] => getFromStorage<StudentAccount>(STORAGE_KEYS.STUDENT_ACCOUNTS)

// ---------- الاستفسارات ----------
export const getInquiries = (): InquiryThread[] => getFromStorage<InquiryThread>(STORAGE_KEYS.INQUIRIES)
export const saveInquiries = (items: InquiryThread[]): void => {
  saveToStorage(STORAGE_KEYS.INQUIRIES, items)
  queuePush(() => pushInquiries(items))
}
export const saveStudentAccounts = (items: StudentAccount[]): void => {
  saveToStorage(STORAGE_KEYS.STUDENT_ACCOUNTS, items)
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

/** السنة الدراسية المخزنة في الجهاز (أو الحالية محسوباً تلقائياً إذا لم تُخزَّن) */
export const getStoredAcademicYear = (): string => {
  if (typeof window === 'undefined') return '2026-2027'
  const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR)
  return stored && stored.trim() ? stored : getCurrentAcademicYear()
}

export const saveAcademicYear = (academicYear: string): void => {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEYS.CURRENT_ACADEMIC_YEAR, academicYear)
  queuePush(() => pushSetting("currentAcademicYear", academicYear))
}

/** اقتراح السنة التي يجب فتحها بعد إغلاق سنة معينة */
export const suggestNextAcademicYear = (closedYear: string): string => {
  const current = getCurrentAcademicYear()
  const next = getNextAcademicYear(closedYear)
  const parseStart = (y: string) => parseInt(y, 10) || 0
  return parseStart(next) >= parseStart(current) ? next : current
}

export const getYearArchives = (): YearArchive[] => getFromStorage<YearArchive>(STORAGE_KEYS.YEAR_ARCHIVES)

export const saveYearArchives = (archives: YearArchive[]): void => {
  saveToStorage(STORAGE_KEYS.YEAR_ARCHIVES, archives)
  queuePush(() => pushYearArchives(archives))
}

// إعدادات عامة (مفتاح/قيمة) — مثل رقم واتساب التواصل
export const getSetting = (key: string, fallback = ""): string => {
  if (typeof window === "undefined") return fallback
  // ملاحظة: القيمة الفارغة "" مقصودة (مثلاً إغلاق التسجيل) — لا تُستبدل بالافتراضي
  const v = localStorage.getItem(key)
  return v === null ? fallback : v
}

export const saveSetting = (key: string, value: string): void => {
  if (typeof window === "undefined") return
  localStorage.setItem(key, value)
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
    saveToStorage(STORAGE_KEYS.HONOREES, next)
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

// ---- البيانات التجريبية (النسخة القديمة) ----

// أسماء الصفوف التجريبية التي كانت تُضاف تلقائياً في النسخ السابقة
const SAMPLE_GRADE_NAMES = ['الصف الرابع الابتدائي', 'الصف الخامس الابتدائي']

/**
 * معرفات الصفوف التجريبية القديمة.
 *
 * ⚠️ مهم: البذرة القديمة كانت تستخدم معرفات ثابتة ('1' و '2').
 * الصفوف التي ينشئها المستخدم تستخدم Date.now() (13 رقماً)،
 * لذلك لا يمكن أبداً أن تتطابق مع هذه المعرفات.
 *
 * الاعتماد على الاسم وحده كان خطأً جسيماً: أي صف حقيقي يسميه
 * المستخدم "الصف الرابع الابتدائي" (وهو اسم شائع جداً!) كان
 * يُصنَّف تجريبياً ويُحذف. لذلك صار المعرّف شرطاً إلزامياً.
 */
const SAMPLE_GRADE_IDS = ['1', '2']

/**
 * اكتشاف الصفوف التجريبية المتبقية من النسخ القديمة.
 *
 * الشروط (يجب أن تتحقق كلها معاً حتى لا يُحذف أي صف حقيقي):
 *  1. معرّف الصف من معرفات البذرة القديمة الثابتة ('1' أو '2')
 *  2. اسم الصف من الأسماء التجريبية
 *  3. لا يوجد أي طالب في أي مجموعة من مجموعاته
 *  4. لا توجد أي بيانات أخرى مرتبطة به (اختبارات/حصص/استحقاقات)
 */
export const getSampleGrades = (): Grade[] => {
  const grades = getGrades()
  const students = getStudents()
  const exams = getExams()
  const sessions = getSessions()
  const dues = getDues()

  return grades.filter(grade => {
    // 1) المعرّف الثابت للبذرة القديمة — شرط إلزامي
    if (!SAMPLE_GRADE_IDS.includes(String(grade.id))) return false

    // 2) الاسم التجريبي
    if (!SAMPLE_GRADE_NAMES.includes(grade.name)) return false

    const groupIds = grade.groups.map(g => g.id)

    // 3) لا طلاب
    if (students.some(s => groupIds.includes(s.groupId) || s.gradeId === grade.id)) return false

    // 4) لا اختبارات / حصص / استحقاقات مرتبطة
    if (exams.some(e => e.gradeId === grade.id || (e.groupId && groupIds.includes(e.groupId)))) return false
    if (sessions.some(se => groupIds.includes(se.groupId))) return false
    if (dues.some(d => d.groupId && groupIds.includes(d.groupId))) return false

    return true
  })
}

/**
 * إزالة البيانات التجريبية (الصفوف والمجموعات الافتراضية)
 * لا تلمس أي صف عليه طلاب
 */
/** مفتاح النسخة الاحتياطية قبل إزالة البيانات التجريبية (للتراجع) */
const SAMPLE_BACKUP_KEY = 'sampleGradesBackup'

/** هل توجد نسخة يمكن التراجع إليها؟ */
export const hasSampleBackup = (): boolean => {
  if (typeof window === 'undefined') return false
  const raw = localStorage.getItem(SAMPLE_BACKUP_KEY)
  if (!raw) return false
  try {
    return (JSON.parse(raw) as Grade[]).length > 0
  } catch {
    return false
  }
}

/** التراجع عن إزالة البيانات التجريبية (استعادة الصفوف المحذوفة) */
export const restoreSampleGrades = (): number => {
  if (typeof window === 'undefined') return 0
  const raw = localStorage.getItem(SAMPLE_BACKUP_KEY)
  if (!raw) return 0
  let backup: Grade[] = []
  try {
    backup = JSON.parse(raw) as Grade[]
  } catch {
    return 0
  }
  if (backup.length === 0) return 0

  const current = getGrades()
  const currentIds = new Set(current.map(g => g.id))
  const restored = backup.filter(g => !currentIds.has(g.id))
  saveGrades([...current, ...restored])
  localStorage.removeItem(SAMPLE_BACKUP_KEY)
  return restored.length
}

export const removeSampleGrades = (): { removedGrades: number; removedStudents: number } => {
  const grades = getGrades()
  const sampleGrades = getSampleGrades()
  const sampleGradeIds = new Set(sampleGrades.map(g => g.id))

  // لا شيء لإزالته — لا نلمس أي بيانات
  if (sampleGradeIds.size === 0) {
    return { removedGrades: 0, removedStudents: 0 }
  }

  // نحفظ نسخة احتياطية تسمح بالتراجع الفوري
  if (typeof window !== 'undefined') {
    localStorage.setItem(SAMPLE_BACKUP_KEY, JSON.stringify(sampleGrades))
  }

  // getSampleGrades يضمن بالفعل عدم وجود أي طالب مرتبط،
  // لذلك لا نحذف أي طالب إطلاقاً هنا (حماية من فقدان البيانات).
  saveGrades(grades.filter(g => !sampleGradeIds.has(g.id)))

  if (typeof window !== 'undefined') {
    localStorage.removeItem('initialized')
    localStorage.removeItem('sampleBannerDismissed')
  }

  return { removedGrades: sampleGradeIds.size, removedStudents: 0 }
}
