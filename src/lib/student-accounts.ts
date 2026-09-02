// ============================================================
// منطق بوابة الطلاب:
//  - تسجيل طالب جديد (طلب ينتظر موافقة المعلم)
//  - تسجيل دخول الطالب (ممنوع قبل الموافقة)
//  - الموافقة: ربط الطلب ببيانات الطالب اليدوية أو إنشاء طالب جديد
//  - طلبات الانضمام لمجموعة أخرى والموافقة عليها
//  - تحكم المعلم: فتح/إغلاق التسجيل، تفعيل/منع دخول طالب
//  - تقارير الطلاب: فتح/إغلاق
// كلمة المرور لا تُخزَّن أبداً — تُخزَّن بصمة SHA-256 فقط.
// ============================================================

import {
  Student,
  RegistrationRequest,
  GroupTransferRequest,
  StudentAccount,
  getStudents,
  saveStudents,
  getRegistrationRequests,
  saveRegistrationRequests,
  getGroupTransferRequests,
  saveGroupTransferRequests,
  getStudentAccounts,
  saveStudentAccounts,
  addStudentHistoryEvent,
  getGrades,
  getSetting,
  saveSetting,
} from "./data-storage"
import { submitRegistrationRequest, submitGroupTransferRequest } from "./supabase/sync"

// ------------------------------------------------------------
// إعدادات المعلم (مفاتيح عامة تُزامن عبر Supabase)
// ------------------------------------------------------------

export const REGISTRATION_OPEN_KEY = "registrationOpen"
export const STUDENT_REPORTS_ENABLED_KEY = "studentReportsEnabled"

/** هل التسجيل مفتوح للطلاب؟ (افتراضياً مفتوح — والمعلم يغلقه متى شاء) */
export function isRegistrationOpen(): boolean {
  return getSetting(REGISTRATION_OPEN_KEY, "1") !== ""
}

export function setRegistrationOpen(open: boolean): void {
  saveSetting(REGISTRATION_OPEN_KEY, open ? "1" : "")
}

/** هل تقارير الطلاب مفعّلة في البوابة؟ (افتراضياً مفعّلة) */
export function areStudentReportsEnabled(): boolean {
  return getSetting(STUDENT_REPORTS_ENABLED_KEY, "1") !== ""
}

export function setStudentReportsEnabled(enabled: boolean): void {
  saveSetting(STUDENT_REPORTS_ENABLED_KEY, enabled ? "1" : "")
}

// ------------------------------------------------------------
// تشفير كلمة المرور (بصمة فقط)
// ------------------------------------------------------------

/** بصمة SHA-256 سداسية عشرية — مع بديل محلي إن لم يتوفر WebCrypto */
export async function sha256Hex(input: string): Promise<string> {
  try {
    if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
      const data = new TextEncoder().encode(input)
      const digest = await globalThis.crypto.subtle.digest("SHA-256", data)
      return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
    }
  } catch {
    /* fallback */
  }
  // بديل مبسط (FNV-1a مزدوج) — يُستخدم فقط إن لم يتوفر WebCrypto
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = ((h1 ^ c) * 0x01000193) >>> 0
    h2 = ((h2 + c) * 0x85ebca6b) >>> 0
  }
  return `fnv$${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`
}

// ------------------------------------------------------------
// أدوات مساعدة
// ------------------------------------------------------------

const norm = (s: string) => (s || "").trim().replace(/\s+/g, " ").toLowerCase()
const digits = (s: string) => (s || "").replace(/\D/g, "")

export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email || "").trim())

export const isValidPhone = (phone: string): boolean => {
  const d = digits(phone)
  return d.length >= 10 && d.length <= 15
}

export interface RegisterInput {
  name: string
  phone: string
  email: string
  password: string
  confirmPassword: string
  gradeId: string
  groupId: string
}

export type RegisterResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

/**
 * تسجيل طالب جديد — ينشئ طلب تسجيل بحالة "قيد المراجعة".
 * لا يمكن التسجيل مرتين بنفس البريد، والتسجيل مغلق إذا أغلق المعلم البوابة.
 */
export async function registerStudentAccount(input: RegisterInput): Promise<RegisterResult> {
  if (!isRegistrationOpen()) {
    return { ok: false, error: "التسجيل مغلق حالياً — يرجى التواصل مع المعلم" }
  }
  const name = (input.name || "").trim()
  const phone = (input.phone || "").trim()
  const email = (input.email || "").trim().toLowerCase()

  if (name.length < 5) return { ok: false, error: "يرجى إدخال الاسم كاملاً (ثلاثي يُفضَّل)" }
  if (!isValidPhone(phone)) return { ok: false, error: "رقم الهاتف غير صحيح — أدخل رقماً صحيحاً" }
  if (!isValidEmail(email)) return { ok: false, error: "البريد الإلكتروني غير صحيح" }
  if (!input.gradeId || !input.groupId) return { ok: false, error: "يرجى اختيار الصف والمجموعة" }
  if (input.password.length < 6) return { ok: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }
  if (input.password !== input.confirmPassword) return { ok: false, error: "كلمة المرور وتأكيدها غير متطابقين" }

  // المجموعة يجب أن تنتمي للصف المختار
  const grade = getGrades().find(g => g.id === input.gradeId)
  if (!grade) return { ok: false, error: "الصف المختار غير موجود" }
  if (!grade.groups.some(g => g.id === input.groupId)) {
    return { ok: false, error: "المجموعة المختارة لا تنتمي للصف المختار" }
  }

  // لا تكرار لنفس البريد (بانتظار / مقبول)
  const existing = getRegistrationRequests().find(r => norm(r.email) === norm(email) && r.status !== "rejected")
  if (existing) {
    if (existing.status === "approved") {
      return { ok: false, error: "هذا البريد مسجَّل بالفعل — يمكنك تسجيل الدخول مباشرة" }
    }
    return { ok: false, error: "لديك طلب تسجيل قيد المراجعة بنفس البريد — انتظر موافقة المعلم" }
  }

  // منع تكرار نفس الطالب بنفس الرقم (طلب سابق قيد المراجعة)
  const dupPhone = getRegistrationRequests().find(
    r => digits(r.phone) === digits(phone) && r.status === "pending"
  )
  if (dupPhone) {
    return { ok: false, error: "يوجد طلب تسجيل قيد المراجعة بنفس رقم الهاتف — انتظر موافقة المعلم" }
  }

  const passwordHash = await sha256Hex(input.password)
  const request: RegistrationRequest = {
    id: `reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    phone,
    email,
    passwordHash,
    gradeId: input.gradeId,
    groupId: input.groupId,
    status: "pending",
    createdAt: new Date().toISOString(),
  }

  const res = await submitRegistrationRequest(request)
  if (!res.ok) {
    return { ok: false, error: `تعذر إرسال الطلب: ${res.error}` }
  }
  return {
    ok: true,
    message: "تم إرسال طلب التسجيل بنجاح ✅ — سيتمكنك من تسجيل الدخول بعد موافقة المعلم على طلبك",
  }
}

// ------------------------------------------------------------
// جلسة الطالب
// ------------------------------------------------------------

const PORTAL_SESSION_KEY = "studentPortalSession"

export interface PortalSession {
  email: string
  studentId: string
  name: string
}

export function getPortalSession(): PortalSession | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(PORTAL_SESSION_KEY)
    return raw ? (JSON.parse(raw) as PortalSession) : null
  } catch {
    return null
  }
}

export function portalLogout(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(PORTAL_SESSION_KEY)
}

export type LoginResult =
  | { ok: true; session: PortalSession }
  | { ok: false; error: string; status?: 'pending' | 'rejected' | 'blocked' }

/** تسجيل دخول الطالب — مسموح فقط بعد موافقة المعلم وتفعيل حسابه */
export async function portalLogin(email: string, password: string): Promise<LoginResult> {
  const mail = (email || "").trim().toLowerCase()
  if (!mail || !password) return { ok: false, error: "يرجى إدخال البريد وكلمة المرور" }

  // أحدث طلب لنفس البريد هو المعتمد (إعادة التقديم بعد الرفض تلغي القديم)
  const request = getRegistrationRequests()
    .filter(r => norm(r.email) === norm(mail))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
    .pop()
  if (!request) return { ok: false, error: "لا يوجد حساب بهذا البريد — سجَّل أولاً من صفحة التسجيل" }

  const hash = await sha256Hex(password)
  if (hash !== request.passwordHash) {
    return { ok: false, error: "كلمة المرور غير صحيحة" }
  }

  if (request.status === "pending") {
    return { ok: false, error: "طلبك لا يزال قيد المراجعة — انتظر موافقة المعلم ثم حاول مجدداً", status: "pending" }
  }
  if (request.status === "rejected") {
    return { ok: false, error: `تم رفض طلب التسجيل${request.reviewNote ? `: ${request.reviewNote}` : ""}`, status: "rejected" }
  }

  const account = getStudentAccounts().find(a => norm(a.email) === norm(mail))
  if (account && !account.active) {
    return { ok: false, error: "تم إيقاف حسابك من تسجيل الدخول — يرجى التواصل مع المعلم", status: "blocked" }
  }

  const studentId = account?.studentId || request.linkedStudentId
  if (!studentId) {
    return { ok: false, error: "حسابك غير مربوط ببيانات طالب — يرجى التواصل مع المعلم" }
  }

  const student = getStudents().find(s => s.id === studentId)
  if (!student) return { ok: false, error: "بيانات الطالب غير موجودة — يرجى التواصل مع المعلم" }
  if (student.status === "inactive") {
    return { ok: false, error: "حسابك موقوف حالياً — يرجى التواصل مع المعلم", status: "blocked" }
  }

  const session: PortalSession = { email: mail, studentId, name: student.name }
  if (typeof window !== "undefined") {
    localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(session))
  }
  return { ok: true, session }
}

// ------------------------------------------------------------
// قرارات المعلم: الموافقة والرفض
// ------------------------------------------------------------

export interface ApproveOutcome {
  ok: boolean
  message: string
  studentId?: string
  createdNew?: boolean
  updatedExisting?: boolean
}

/**
 * البحث عن طالب موجود يطابق بيانات الطلب:
 *  1) تطابق رقم الهاتف بالكامل
 *  2) تطابق الاسم + الصف
 *  3) تطابق الاسم فقط (إن كان فريداً)
 */
export function findMatchingStudent(request: RegistrationRequest): Student | undefined {
  const students = getStudents()
  const reqPhone = digits(request.phone)
  const reqName = norm(request.name)

  const byPhone = students.find(s => s.phone && digits(s.phone) === reqPhone && reqPhone.length >= 10)
  if (byPhone) return byPhone

  const byNameGrade = students.filter(s => norm(s.name) === reqName && s.gradeId === request.gradeId)
  if (byNameGrade.length === 1) return byNameGrade[0]

  const byName = students.filter(s => norm(s.name) === reqName)
  if (byName.length === 1) return byName[0]

  return undefined
}

/**
 * الموافقة على طلب تسجيل:
 *  - إن وُجد طالب مطابق: تُحدَّث بياناته اليدوية ببيانات الطلب (الاسم/الهاتف/البريد) ويُنقل لمجموعته إن اختلف، ويُسجَّل ذلك في سجله.
 *  - إن لم يوجد: يُنشأ طالب جديد فوراً على مجموعته المطلوبة.
 *  - يُربط الحساب بالطالب ويصبح الدخول ممكناً.
 */
export function approveRegistrationRequest(requestId: string): ApproveOutcome {
  const requests = getRegistrationRequests()
  const request = requests.find(r => r.id === requestId)
  if (!request) return { ok: false, message: "الطلب غير موجود" }
  if (request.status === "approved") return { ok: false, message: "الطلب مقبول بالفعل" }

  const now = new Date().toISOString()
  const students = getStudents()
  const match = findMatchingStudent(request)

  let student: Student
  let createdNew = false
  let updatedExisting = false

  if (match) {
    updatedExisting = true
    student = {
      ...match,
      name: request.name.trim(),
      phone: request.phone.trim(),
      email: request.email.trim().toLowerCase(),
      gradeId: request.gradeId,
      groupId: request.groupId,
      updatedAt: now,
    }
    saveStudents(students.map(s => (s.id === match.id ? student : s)))

    // توثيق ما تغيّر في سجل الطالب
    if (match.groupId !== request.groupId) {
      addStudentHistoryEvent({
        studentId: student.id,
        type: "account",
        title: "تحديث بيانات من طلب التسجيل",
        detail: `تم نقل الطالب إلى مجموعته المطلوبة وتحديث بياناته (الاسم/الهاتف/البريد)`,
        date: now,
      })
    } else {
      addStudentHistoryEvent({
        studentId: student.id,
        type: "account",
        title: "ربط حساب بوابة الطالب",
        detail: "تمت الموافقة على طلب التسجيل وربطه ببياناته وتحديثها",
        date: now,
      })
    }
  } else {
    createdNew = true
    student = {
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: request.name.trim(),
      phone: request.phone.trim(),
      email: request.email.trim().toLowerCase(),
      gradeId: request.gradeId,
      groupId: request.groupId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    }
    saveStudents([...getStudents(), student])
    addStudentHistoryEvent({
      studentId: student.id,
      type: "account",
      title: "تسجيل جديد من بوابة الطالب",
      detail: "تمت الموافقة على طلب التسجيل وإنشاء الطالب على مجموعته مباشرة",
      date: now,
    })
  }

  // ربط الحساب
  const accounts = getStudentAccounts()
  const accountId = request.email.trim().toLowerCase()
  const existingAccount = accounts.find(a => norm(a.email) === norm(accountId))
  const account: StudentAccount = {
    id: accountId,
    email: accountId,
    studentId: student.id,
    active: true,
    createdAt: existingAccount?.createdAt || now,
  }
  saveStudentAccounts(
    existingAccount
      ? accounts.map(a => (a.id === existingAccount.id ? account : a))
      : [...accounts, account]
  )

  // تحديث حالة الطلب
  saveRegistrationRequests(
    requests.map(r =>
      r.id === requestId
        ? { ...r, status: "approved" as const, reviewedAt: now, linkedStudentId: student.id }
        : r
    )
  )

  return {
    ok: true,
    message: createdNew
      ? `تمت الموافقة وإنشاء الطالب «${student.name}» على مجموعته مباشرة — أصبح الدخول ممكناً`
      : `تمت الموافقة وربط الطلب بالطالب «${student.name}» وتحديث بياناته — أصبح الدخول ممكناً`,
    studentId: student.id,
    createdNew,
    updatedExisting,
  }
}

/** رفض طلب التسجيل (مع سبب اختياري) */
export function rejectRegistrationRequest(requestId: string, note = ""): ApproveOutcome {
  const requests = getRegistrationRequests()
  const request = requests.find(r => r.id === requestId)
  if (!request) return { ok: false, message: "الطلب غير موجود" }
  saveRegistrationRequests(
    requests.map(r =>
      r.id === requestId
        ? { ...r, status: "rejected" as const, reviewedAt: new Date().toISOString(), reviewNote: note || undefined }
        : r
    )
  )
  return { ok: true, message: `تم رفض طلب «${request.name}»` }
}

// ------------------------------------------------------------
// طلبات الانضمام لمجموعة أخرى
// ------------------------------------------------------------

export type TransferResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

/** الطالب يطلب الانضمام لمجموعة أخرى **بنفس صفه** فقط */
export async function requestGroupTransfer(
  studentId: string,
  toGroupId: string
): Promise<TransferResult> {
  const student = getStudents().find(s => s.id === studentId)
  if (!student) return { ok: false, error: "بيانات الطالب غير موجودة" }
  if (!toGroupId) return { ok: false, error: "يرجى اختيار المجموعة المطلوبة" }
  if (student.groupId === toGroupId) return { ok: false, error: "أنت في هذه المجموعة بالفعل" }

  const grades = getGrades()
  const currentGrade = grades.find(g => g.groups.some(x => x.id === student.groupId))
  const targetGrade = grades.find(g => g.groups.some(x => x.id === toGroupId))
  if (!currentGrade || !targetGrade) return { ok: false, error: "المجموعة المطلوبة غير موجودة" }
  if (currentGrade.id !== targetGrade.id) {
    return { ok: false, error: "يمكن الانضمام فقط إلى مجموعات داخل صفك الحالي — تواصل مع المعلم لتغيير الصف" }
  }

  // لا تكرار لطلب معلق لنفس الطالب لنفس المجموعة
  const dup = getGroupTransferRequests().find(
    t => t.studentId === studentId && t.status === "pending" && t.toGroupId === toGroupId
  )
  if (dup) return { ok: false, error: "لديك طلب معلق لهذه المجموعة بالفعل — انتظر مراجعة المعلم" }

  const request: GroupTransferRequest = {
    id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    studentId,
    studentName: student.name,
    fromGroupId: student.groupId,
    toGradeId: targetGrade.id,
    toGroupId,
    status: "pending",
    createdAt: new Date().toISOString(),
  }
  const res = await submitGroupTransferRequest(request)
  if (!res.ok) return { ok: false, error: `تعذر إرسال الطلب: ${res.error}` }
  return { ok: true, message: "تم إرسال طلب الانضمام — سيُنقل بعد موافقة المعلم" }
}

/** الموافقة على طلب نقل: يُنقل الطالب ويُسجَّل ذلك في سجله (ويظهر في تقريره) */
export function approveGroupTransferRequest(requestId: string): ApproveOutcome {
  const requests = getGroupTransferRequests()
  const request = requests.find(r => r.id === requestId)
  if (!request) return { ok: false, message: "الطلب غير موجود" }
  if (request.status === "approved") return { ok: false, message: "الطلب مقبول بالفعل" }

  const students = getStudents()
  const student = students.find(s => s.id === request.studentId)
  if (!student) return { ok: false, message: "الطالب غير موجود" }

  const now = new Date().toISOString()
  const fromGroupLabel = student.groupId
  saveStudents(
    students.map(s =>
      s.id === student.id
        ? { ...s, groupId: request.toGroupId, gradeId: request.toGradeId, updatedAt: now }
        : s
    )
  )

  addStudentHistoryEvent({
    studentId: student.id,
    type: "transfer",
    title: "نقل إلى مجموعة أخرى",
    detail: `تمت الموافقة على طلب الانضمام — النقل من المجموعة (${fromGroupLabel}) إلى المجموعة (${request.toGroupId})`,
    date: now,
  })

  saveGroupTransferRequests(
    requests.map(r =>
      r.id === requestId
        ? { ...r, status: "approved" as const, reviewedAt: now }
        : r
    )
  )
  return { ok: true, message: `تم نقل «${student.name}» إلى المجموعة الجديدة وتسجيل ذلك في سجله`, studentId: student.id }
}

export function rejectGroupTransferRequest(requestId: string, note = ""): ApproveOutcome {
  const requests = getGroupTransferRequests()
  const request = requests.find(r => r.id === requestId)
  if (!request) return { ok: false, message: "الطلب غير موجود" }
  saveGroupTransferRequests(
    requests.map(r =>
      r.id === requestId
        ? { ...r, status: "rejected" as const, reviewedAt: new Date().toISOString(), reviewNote: note || undefined }
        : r
    )
  )
  return { ok: true, message: "تم رفض الطلب" }
}

// ------------------------------------------------------------
// تحكم المعلم في حسابات الطلاب
// ------------------------------------------------------------

/** منع/تفعيل تسجيل دخول طالب (دون حذف بياناته) */
export function setStudentPortalActive(studentId: string, active: boolean): ApproveOutcome {
  if (!studentId || !getStudents().some(s => s.id === studentId)) {
    return { ok: false, message: "بيانات الطالب غير موجودة" }
  }
  const accounts = getStudentAccounts()
  const account = accounts.find(a => a.studentId === studentId)
  if (account) {
    saveStudentAccounts(accounts.map(a => (a.id === account.id ? { ...a, active } : a)))
  } else {
    const student = getStudents().find(s => s.id === studentId)
    const email = student?.email || `student-${studentId}@portal.local`
    saveStudentAccounts([
      ...accounts,
      { id: email, email, studentId, active, createdAt: new Date().toISOString() },
    ])
  }
  return {
    ok: true,
    message: active ? "تم تفعيل تسجيل الدخول للطالب" : "تم منع الطالب من تسجيل الدخول (بياناته محفوظة)",
  }
}

/** هل دخول الطالب مفعّل؟ (افتراضياً نعم) */
export function isStudentPortalActive(studentId: string): boolean {
  const account = getStudentAccounts().find(a => a.studentId === studentId)
  return account ? account.active : true
}

/** حذف حساب البوابة عند حذف الطالب */
export function removeStudentPortalAccount(studentId: string): void {
  const accounts = getStudentAccounts()
  saveStudentAccounts(accounts.filter(a => a.studentId !== studentId))
}
