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
  gradeId: string
  groupId: string
  status: 'active' | 'inactive'
  notes?: string
  createdAt: string
  updatedAt: string
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
  createdAt: string
  updatedAt: string
}

export interface Question {
  id: string
  questionType: 1 | 2 | 3 | 4 | 5
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
  status: 'present' | 'absent' | 'late' | 'excused'
  lateMinutes?: number
  notes?: string
  createdAt: string
}

// ---- الإعلانات ولوحة الشرف والملفات والروابط ----

export interface Announcement {
  id: string
  title: string
  body: string
  pinned: boolean
  createdAt: string
}

export interface Honoree {
  id: string
  studentId?: string
  studentName: string
  groupId: string
  reason: string
  month: number // 1-12
  year: number
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
} from "./supabase/sync"

// Helper functions
export const getFromStorage = <T>(key: string): T[] => {
  if (typeof window === 'undefined') return []
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : []
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
  return localStorage.getItem(key) || fallback
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

/** هل الدخول في لوحة الشرف معروض حالياً؟ (يُعرض طوال الشهر والعام المحددين) */
export const isHonoreeActive = (honoree: Honoree, now: Date = new Date()): boolean => {
  return honoree.month === now.getMonth() + 1 && honoree.year === now.getFullYear()
}

/** كل المجموعات في جميع الصفوف مع اسم الصف */
export const getAllGroups = (grades: Grade[]) =>
  grades.flatMap(g => g.groups.map(gr => ({ ...gr, gradeName: g.name, gradeId: g.id })))

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
 * اكتشاف الصفوف التجريبية المتبقية من النسخ القديمة:
 * صف اسمه من الأسماء التجريبية ولا يوجد عليه أي طلاب
 */
export const getSampleGrades = (): Grade[] => {
  const grades = getGrades()
  const students = getStudents()
  return grades.filter(grade => {
    if (!SAMPLE_GRADE_NAMES.includes(grade.name)) return false
    const groupIds = grade.groups.map(g => g.id)
    const hasStudents = students.some(s => groupIds.includes(s.groupId))
    return !hasStudents
  })
}

/**
 * إزالة البيانات التجريبية (الصفوف والمجموعات الافتراضية)
 * لا تلمس أي صف عليه طلاب
 */
export const removeSampleGrades = (): { removedGrades: number; removedStudents: number } => {
  const grades = getGrades()
  const sampleGrades = getSampleGrades()
  const sampleGradeIds = new Set(sampleGrades.map(g => g.id))
  const sampleGroupIds = new Set(sampleGrades.flatMap(g => g.groups.map(gr => gr.id)))

  const students = getStudents()
  const remainingStudents = students.filter(s => !sampleGroupIds.has(s.groupId))

  saveGrades(grades.filter(g => !sampleGradeIds.has(g.id)))
  saveStudents(remainingStudents)
  if (typeof window !== 'undefined') {
    localStorage.removeItem('initialized')
    localStorage.removeItem('sampleBannerDismissed')
  }

  return {
    removedGrades: sampleGradeIds.size,
    removedStudents: students.length - remainingStudents.length,
  }
}
