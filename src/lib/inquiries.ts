// ============================================================
// استفسارات الطلاب — ليست محادثة مفتوحة:
//  • الطالب يرسل استفساراً واحداً (رسالة)
//  • المعلم يرد عليه ويقرر: يغلقه أو يتركه مفتوحاً ليرد الطالب مرة أخرى
//  • لا يمكن للطالب إرسال رسالة جديدة وهو لديه رسالة بلا رد
// ============================================================

import {
  InquiryThread,
  InquiryMessage,
  getInquiries as getInquiriesFromStorage,
  saveInquiries,
  getStudents,
  saveStudents,
} from "./data-storage"

export { saveInquiries }
export const getInquiries = getInquiriesFromStorage
import { submitInquiryThread, pushInquiries, fetchStudentInquiries, fetchStudentById, getStudentPortalRecord } from "./supabase/sync"
import { saveToStore } from "./data-storage"
import { STORAGE_KEYS } from "./storage-keys"

export interface InquiryResult {
  ok: boolean
  error?: string
  message?: string
}

// ------------------------------------------------------------
// قفل قناة الاستفسار لطالب معيّن — قرار المعلم
// ------------------------------------------------------------

/** هل قناة استفسار الطالب مغلقة تماماً؟ */
export function isInquiryChannelClosed(studentId: string): boolean {
  return getStudents().find(s => s.id === studentId)?.inquiryBlocked === true
}

/** المعلم يغلق/يفتح قناة استفسار طالب */
export function setStudentInquiryChannel(studentId: string, closed: boolean): InquiryResult {
  const students = getStudents()
  const student = students.find(s => s.id === studentId)
  if (!student) return { ok: false, error: "بيانات الطالب غير موجودة" }
  saveStudents(
    students.map(s =>
      s.id === studentId ? { ...s, inquiryBlocked: closed || undefined, updatedAt: new Date().toISOString() } : s
    )
  )
  return {
    ok: true,
    message: closed
      ? `تم إغلاق قناة الاستفسار للطالب «${student.name}» تماماً`
      : `تم إعادة فتح قناة الاستفسار للطالب «${student.name}»`,
  }
}

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** هل يمكن للطالب إرسال استفسار/رد الآن؟ */
export function canStudentSendInquiry(studentId: string): { allowed: boolean; reason?: string; thread?: InquiryThread; channelClosed?: boolean } {
  // المعلم أغلق القناة لهذا الطالب تماماً — لا إرسال إطلاقاً
  if (isInquiryChannelClosed(studentId)) {
    return { allowed: false, reason: "أغلق المعلم قناة الاستفسار الخاصة بك — راجع المعلم مباشرة", channelClosed: true }
  }
  const threads = getInquiries().filter(t => t.studentId === studentId)
  const open = threads.find(t => t.status === "open")
  if (open) {
    const last = open.messages[open.messages.length - 1]
    if (last && last.from === "student") {
      return { allowed: false, reason: "لديك استفسار بانتظار رد المعلم — ستتمكن من الرد بعد إجابته", thread: open }
    }
    return { allowed: true, thread: open }
  }
  if (threads.some(t => t.status === "closed")) {
    // استفسار مغلق — يمكن فتح استفسار جديد
  }
  return { allowed: true }
}

/** الطالب يرسل استفساراً جديداً أو يرد — القرار كله من السحابة (المصدر الوحيد) */
export async function sendStudentInquiry(studentId: string, text: string, token?: string): Promise<InquiryResult> {
  const body = (text || "").trim()
  if (body.length < 5) return { ok: false, error: "اكتب استفسارك بوضوح (5 أحرف على الأقل)" }
  if (body.length > 1000) return { ok: false, error: "الاستفسار طويل جداً — اختصر في 1000 حرف" }

  // بيانات الطالب وحالة قناته: من الدالة الآمنة أولاً ثم ذاكرة الجلسة.
  // (فئة الطلاب لا تُقرأ خاماً من anon؛ لذا مرّر سرّ الجلسة لجلب بيانات الطالب)
  let student = getStudents().find(s => s.id === studentId)
  try {
    if (token) {
      const record = await getStudentPortalRecord(token)
      if (record?.student && record.student.id === studentId) {
        const mapped = {
          id: record.student.id,
          name: record.student.name,
          phone: record.student.phone || undefined,
          email: record.student.email || undefined,
          gradeId: record.student.grade_id,
          groupId: record.student.group_id,
          status: record.student.status,
          inquiryBlocked: record.student.inquiry_blocked === true,
        }
        student = mapped as any
      }
    } else {
      const cloudStudent = await fetchStudentById(studentId)
      if (cloudStudent) student = cloudStudent
    }
  } catch { /* تعذر السحاب — تُعرض ذاكرة الجلسة */ }
  if (!student) return { ok: false, error: "تعذر التحقق من بياناتك — أعد المحاولة" }
  if (student.inquiryBlocked === true) {
    return { ok: false, error: "أغلق المعلم قناة الاستفسار الخاصة بك — راجع المعلم مباشرة" }
  }

  // خيوط الاستفسار: من Supabase — وذاكرة الجلسة للعرض الفوري فقط
  let threads: InquiryThread[] = getInquiries()
  try {
    const cloud = (await fetchStudentInquiries(token || "")) as InquiryThread[]
    if (Array.isArray(cloud)) {
      threads = cloud
      saveToStore(STORAGE_KEYS.INQUIRIES, cloud) // ذاكرة جلسة للقراءة الفورية — بلا دفع عكسي
    }
  } catch { /* تعذر السحاب — تُعرض ذاكرة الجلسة */ }

  const now = new Date().toISOString()
  const msg: InquiryMessage = { from: "student", text: body, at: now }
  const mine = threads.filter(t => t.studentId === studentId)
  const open = mine.find(t => t.status === "open")

  if (open) {
    const last = open.messages[open.messages.length - 1]
    if (last && last.from === "student") {
      return { ok: false, error: "لديك استفسار بانتظار رد المعلم — ستتمكن من الرد بعد إجابته" }
    }
    // رد على الموضوع المفتوح — رفع سحابي أولاً، الكاش بعد النجاح فقط
    const updated = threads.map(t =>
      t.id === open.id
        ? { ...t, messages: [...t.messages, msg], updatedAt: now }
        : t
    )
    try {
      await pushInquiries(updated)
    } catch (e: unknown) {
      const m = (e as { message?: string })?.message || "خطأ اتصال — أعد المحاولة"
      return { ok: false, error: `تعذر إرسال الرد: ${m}` }
    }
    saveToStore(STORAGE_KEYS.INQUIRIES, updated)
    return { ok: true, message: "تم إرسال ردك — سيرد المعلم عليه قريباً" }
  }

  // استفسار جديد — إدراج سحابي مباشر (submitInquiryThread سحابية أولاً)
  const thread: InquiryThread = {
    id: newId("inq"),
    studentId,
    studentName: student.name,
    gradeId: student.gradeId,
    groupId: student.groupId,
    messages: [msg],
    status: "open",
    createdAt: now,
    updatedAt: now,
  }
  const res = await submitInquiryThread(thread)
  if (!res.ok) return { ok: false, error: `تعذر إرسال الاستفسار: ${res.error}` }
  return { ok: true, message: "تم إرسال استفسارك للمعلم — ستجد رده هنا" }
}

/** المعلم يرد على استفسار (يظل مفتوحاً ليرد الطالب إن أراد) */
export function teacherReplyInquiry(threadId: string, text: string): InquiryResult {
  const body = (text || "").trim()
  if (!body) return { ok: false, error: "اكتب الرد أولاً" }
  const threads = getInquiries()
  const thread = threads.find(t => t.id === threadId)
  if (!thread) return { ok: false, error: "الاستفسار غير موجود" }
  if (thread.status === "closed") return { ok: false, error: "هذا الاستفسار مغلق" }
  const now = new Date().toISOString()
  saveInquiries(
    threads.map(t =>
      t.id === threadId
        ? { ...t, messages: [...t.messages, { from: "teacher" as const, text: body, at: now }], updatedAt: now }
        : t
    )
  )
  return { ok: true, message: "تم إرسال الرد للطالب — الاستفسار ما زال مفتوحاً ليرد إن أراد" }

}

/** المعلم يغلق الاستفسار (لا يمكن للطالب الرد بعده) */
export function teacherCloseInquiry(threadId: string): InquiryResult {
  const threads = getInquiries()
  const thread = threads.find(t => t.id === threadId)
  if (!thread) return { ok: false, error: "الاستفسار غير موجود" }
  saveInquiries(threads.map(t => (t.id === threadId ? { ...t, status: "closed" as const, updatedAt: new Date().toISOString() } : t)))
  return { ok: true, message: "تم إغلاق الاستفسار" }
}
