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
  wordPosition: number
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

// Storage Keys
const STORAGE_KEYS = {
  GRADES: 'grades',
  STUDENTS: 'students',
  DUES: 'dues',
  PAYMENTS: 'payments',
  EXAMS: 'exams',
  SESSIONS: 'sessions',
  ATTENDANCE: 'attendance',
}

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
export const saveGrades = (grades: Grade[]): void => saveToStorage(STORAGE_KEYS.GRADES, grades)

// Students
export const getStudents = (): Student[] => getFromStorage<Student>(STORAGE_KEYS.STUDENTS)
export const saveStudents = (students: Student[]): void => saveToStorage(STORAGE_KEYS.STUDENTS, students)

// Dues
export const getDues = (): Due[] => getFromStorage<Due>(STORAGE_KEYS.DUES)
export const saveDues = (dues: Due[]): void => saveToStorage(STORAGE_KEYS.DUES, dues)

// Payments
export const getPayments = (): Payment[] => getFromStorage<Payment>(STORAGE_KEYS.PAYMENTS)
export const savePayments = (payments: Payment[]): void => saveToStorage(STORAGE_KEYS.PAYMENTS, payments)

// Exams
export const getExams = (): Exam[] => getFromStorage<Exam>(STORAGE_KEYS.EXAMS)
export const saveExams = (exams: Exam[]): void => saveToStorage(STORAGE_KEYS.EXAMS, exams)

// Sessions
export const getSessions = (): Session[] => getFromStorage<Session>(STORAGE_KEYS.SESSIONS)
export const saveSessions = (sessions: Session[]): void => saveToStorage(STORAGE_KEYS.SESSIONS, sessions)

// Attendance
export const getAttendance = (): Attendance[] => getFromStorage<Attendance>(STORAGE_KEYS.ATTENDANCE)
export const saveAttendance = (attendance: Attendance[]): void => saveToStorage(STORAGE_KEYS.ATTENDANCE, attendance)

// Helper: Calculate student balance
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

// Helper: Get student with grade and group names
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

// Initialize with sample data if empty
export const initializeSampleData = (): void => {
  if (typeof window === 'undefined') return
  
  // Check if already initialized
  if (localStorage.getItem('initialized')) return
  
  // Sample grades
  const sampleGrades: Grade[] = [
    {
      id: '1',
      name: 'الصف الرابع الابتدائي',
      academicYear: '2025-2026',
      createdAt: new Date().toISOString(),
      groups: [
        {
          id: '1',
          name: 'مجموعة 1',
          days: ['الأربعاء', 'السبت'],
          startTime: '16:00',
          endTime: '17:00',
          monthlyFee: 150,
          studentsCount: 0,
        },
        {
          id: '2',
          name: 'مجموعة 2',
          days: ['الأحد', 'الثلاثاء'],
          startTime: '12:00',
          endTime: '13:00',
          monthlyFee: 150,
          studentsCount: 0,
        },
      ],
    },
    {
      id: '2',
      name: 'الصف الخامس الابتدائي',
      academicYear: '2025-2026',
      createdAt: new Date().toISOString(),
      groups: [
        {
          id: '3',
          name: 'مجموعة 1',
          days: ['الاثنين', 'الخميس'],
          startTime: '15:00',
          endTime: '16:00',
          monthlyFee: 160,
          studentsCount: 0,
        },
      ],
    },
  ]
  
  saveGrades(sampleGrades)
  localStorage.setItem('initialized', 'true')
}
