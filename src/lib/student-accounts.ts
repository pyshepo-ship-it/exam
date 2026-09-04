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
import {
  fetchStudentById, submitRegistrationRequest, submitGroupTransferRequest,
  fetchRegistrationRequestByEmail, fetchStudentAccountByEmail,
  studentLogin, studentLogout, studentRegisterAuto, changeStudentPassword } from "./supabase/sync"
import { clearStore } from "./memory-store"
import { clearRememberedOnlineExamResultSessions } from "./online-exam-result-session"

// ------------------------------------------------------------
// إعدادات المعلم (مفاتيح عامة تُزامن عبر Supabase)
// ------------------------------------------------------------

export const REGISTRATION_OPEN_KEY = "registrationOpen"
export const STUDENT_REPORTS_ENABLED_KEY = "studentReportsEnabled"
/** تفعيل مباشر: أي طالب يسجّل يُفعّل حسابه فوراً بدون موافقة المعلم */
export const AUTO_APPROVE_REGISTRATION_KEY = "autoApproveRegistration"

/** هل التسجيل مفتوح للطلاب؟ (افتراضياً مفتوح — والمعلم يغلقه متى شاء) */
export function isRegistrationOpen(): boolean {
  return getSetting(REGISTRATION_OPEN_KEY, "1") !== ""
}

export function setRegistrationOpen(open: boolean): void {
  saveSetting(REGISTRATION_OPEN_KEY, open ? "1" : "")
}

/** هل التفعيل المباشر مفعّل؟ (افتراضياً مغلق — الطالب ينتظر موافقة المعلم) */
export function isAutoApproveRegistration(): boolean {
  return getSetting(AUTO_APPROVE_REGISTRATION_KEY, "") !== ""
}

export function setAutoApproveRegistration(enabled: boolean): void {
  saveSetting(AUTO_APPROVE_REGISTRATION_KEY, enabled ? "1" : "")
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

/** دالة FNV-1a المزدوجة (تحتفظ بها القراءة فقط للبصمات القديمة — لا تُكتب أبداً) */
function legacyFnvHex(input: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = ((h1 ^ c) * 0x01000193) >>> 0
    h2 = ((h2 + c) * 0x85ebca6b) >>> 0
  }
  return `fnv$${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`
}

/** هل البصمة من النوع القديم الضعيف (FNV)؟ — لا تُنشأ منه بصمات جديدة أبداً */
function isLegacyFnvHash(stored: string): boolean {
  return /^fnv\$[0-9a-f]{16}$/.test(stored || "")
}

/**
 * بصمة SHA-256 سداسية عشرية.
 * بدون أي «بديل محلي»: إن لم يتوفر WebCrypto تُرفض العملية برسالة واضحة بدل
 * تخفيض الأمان بصمتٍّ (كان هناك بديل FNV سابق غير مناسب لكلمات المرور).
 */
export async function sha256Hex(input: string): Promise<string> {
  const subtle = typeof globalThis !== "undefined" ? globalThis.crypto?.subtle : null
  if (!subtle) {
    throw new Error("متصفحك لا يدعم تشفير كلمات المرور — حدّث متصفحك أو جرّب متصفحاً آخر")
  }
  try {
    const data = new TextEncoder().encode(input)
    const digest = await subtle.digest("SHA-256", data)
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
  } catch {
    throw new Error("تعذر تشفير كلمة المرور على هذا الجهاز — أعد المحاولة")
  }
}

/**
 * مطابقة كلمة مرور مع بصمة مخزنة:
 *  - البصمات الحديثة SHA-256 تُقارن بعد التجزئة.
 *  - بصمات FNV القديمة (من إصدارات سابقة) تُقارن بنفس الخوارزمية للسماح بدخول
 *    الحسابات القائمة فقط — ولا تُكتب بصمة FNV جديدة أبداً.
 */
export async function passwordMatches(input: string, stored?: string): Promise<boolean> {
  if (!stored) return false
  if (isLegacyFnvHash(stored)) return legacyFnvHex(input) === stored
  const hash = await sha256Hex(input)
  return hash === stored
}

// ------------------------------------------------------------
// أدوات مساعدة
// ------------------------------------------------------------

const norm = (s: string) => (s || "").trim().replace(/\s+/g, " ").toLowerCase()
const digits = (s: string) => (s || "").replace(/\D/g, "")

/** تحويل الأرقام العربية-الهندية إلى لاتينية قبل أي تحقق (٠١٢ → 012) */
export const normalizeDigits = (s: string): string =>
  (s || "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))

/** أرقام فقط بعد التوحيد — ترفض الحروف والعربية والمسافات */
export const isValidPhone = (phone: string): boolean => {
  const d = normalizeDigits(phone).replace(/[\s-]/g, "")
  return /^[0-9]{10,15}$/.test(d)
}

/** بريد ASCII صارم — يرفض العربية وأي حروف غير لاتينية أو مسافات */
export const isValidEmail = (email: string): boolean =>
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test((email || "").trim())

/** الاسم: حروف فقط (أي لغة) ومسافات — بلا أرقام أو رموز غريبة */
export const isValidStudentName = (name: string): boolean => {
  const n = (name || "").trim()
  return n.length >= 5 && !/\d/.test(n) && !/[<>{}\[\]\\/^$#@*+=|~`"]/.test(n)
}

export interface RegisterInput {
  name: string
  phone: string
  /** هاتف ولي الأمر — إجباري */
  guardianPhone: string
  email: string
  password: string
  confirmPassword: string
  gradeId: string
  groupId: string
}

/** منع التسجيل أكثر من مرة خلال يومين (48 ساعة) لنفس الهاتف/البريد */
const REGISTRATION_COOLDOWN_MS = 48 * 60 * 60 * 1000

// ============================================================
// حدود الطلبات (Rate Limit) — حماية من إغراق النظام بطلبات وهمية
//  • عالمي: 20 طلب تسجيل كحد أقصى في الساعة + 10 طلبات نقل + 20 استفسار
//  • لكل جهاز: طلب تسجيل واحد كل 10 دقائق، ونقل واحد كل ساعة
//  • فشل تسجيل الدخول: 5 محاولات كل 15 دقيقة لكل بريد (حماية التخمين)
//
// هذه عدّادات أرقام فقط (عدد + وقت بداية النافذة) وليست بيانات:
// لا اسم ولا هاتف ولا بريد ولا درجات — لذلك تُحفظ على الجهاز لحماية
// قاعدة البيانات من الإغراق، بينما كل البيانات الحقيقية في Supabase وحدها.
// ============================================================
const RATE_LIMITS_KEY = "studentRateLimits"

interface RateEntry { count: number; windowStart: number }

function readRateMap(): Record<string, RateEntry> {
  try {
    return JSON.parse(localStorage.getItem(RATE_LIMITS_KEY) || "{}")
  } catch {
    return {}
  }
}

function writeRateMap(map: Record<string, RateEntry>): void {
  try { localStorage.setItem(RATE_LIMITS_KEY, JSON.stringify(map)) } catch { /* تجاهل */ }
}

/** فحص الحد فقط دون زيادة العداد — الزيادة تتم عند نجاح العملية فقط */
function checkRate(bucket: string, max: number, windowMs: number): boolean {
  if (typeof window === "undefined") return true
  const entry = readRateMap()[bucket]
  const now = Date.now()
  if (!entry || now - entry.windowStart >= windowMs) return true
  return entry.count < max
}

/** يسمح بعملية داخل نافذة زمنية — ويزيد العداد إن سمح */
function consumeRate(bucket: string, max: number, windowMs: number): boolean {
  if (typeof window === "undefined") return true
  const map = readRateMap()
  const entry = map[bucket]
  const now = Date.now()
  if (!entry || now - entry.windowStart >= windowMs) {
    map[bucket] = { count: 1, windowStart: now }
    writeRateMap(map)
    return true
  }
  if (entry.count >= max) return false
  entry.count += 1
  writeRateMap(map)
  return true
}

/** تصفير حدود الطلبات (تُستخدم في الاختبارات فقط — الحدود تعمل تلقائياً بخلاف ذلك) */
export function resetRateLimits(): void {
  if (typeof window === "undefined") return
  try { localStorage.removeItem(RATE_LIMITS_KEY) } catch { /* تجاهل */ }
}

function minutesLeftInWindow(bucket: string, windowMs: number): number {
  const entry = readRateMap()[bucket]
  if (!entry) return 0
  const left = windowMs - (Date.now() - entry.windowStart)
  return Math.max(1, Math.ceil(left / 60000))
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

  // حماية من الإغراق فقط — وليست عرقلة لإعادة المحاولة:
  // أكثر من 5 محاولات في نفس الدقيقة، أو 20 محاولة في الساعة من نفس الجهاز.
  // مهم: العدّاد لا يزيد إلا عند نجاح الإرسال — أي خطأ (تحقق أو قاعدة بيانات)
  // لا يحسب ولا يحظر الطالب من إعادة المحاولة فوراً.
  if (!checkRate("reg-device-min", 5, 60 * 1000)) {
    return { ok: false, error: `محاولات كثيرة جداً — انتظر ${minutesLeftInWindow("reg-device-min", 60 * 1000)} دقيقة ثم حاول مجدداً` }
  }
  if (!checkRate("reg-device-hour", 20, 60 * 60 * 1000)) {
    return { ok: false, error: `محاولات كثيرة خلال الساعة — انتظر ${minutesLeftInWindow("reg-device-hour", 60 * 60 * 1000)} دقيقة ثم حاول مجدداً` }
  }
  if (!checkRate("reg-global", 100, 60 * 60 * 1000)) {
    return { ok: false, error: "عدد كبير جداً من طلبات التسجيل في الساعة — يرجى المحاولة لاحقاً" }
  }
  const name = (input.name || "").trim()
  const phone = normalizeDigits((input.phone || "")).replace(/[\s-]/g, "")
  const guardianPhone = normalizeDigits((input.guardianPhone || "")).replace(/[\s-]/g, "")
  const email = (input.email || "").trim().toLowerCase()

  if (!isValidStudentName(name)) return { ok: false, error: "يرجى كتابة الاسم كاملاً بالحروف فقط (ثلاثي يُفضَّل، بدون أرقام)" }
  if (!isValidPhone(phone)) return { ok: false, error: "رقم الهاتف غير صحيح — أرقام فقط بدون حروف (10-15 رقماً)" }
  if (!isValidPhone(guardianPhone)) return { ok: false, error: "هاتف ولي الأمر إجباري — أرقام فقط بدون حروف (10-15 رقماً)" }
  if (!isValidEmail(email)) return { ok: false, error: "البريد الإلكتروني غير صحيح — حروف إنجليزية وأرقام فقط بدون مسافات أو حروف عربية" }
  if (!input.gradeId || !input.groupId) return { ok: false, error: "يرجى اختيار الصف والمجموعة" }
  if (input.password.length < 6) return { ok: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }
  if (input.password !== input.confirmPassword) return { ok: false, error: "كلمة المرور وتأكيدها غير متطابقين" }

  // المجموعة يجب أن تنتمي للصف المختار
  const grade = getGrades().find(g => g.id === input.gradeId)
  if (!grade) return { ok: false, error: "الصف المختار غير موجود" }
  if (!grade.groups.some(g => g.id === input.groupId)) {
    return { ok: false, error: "المجموعة المختارة لا تنتمي للصف المختار" }
  }

  // البريد فريد نهائياً: أي طلب سابق (بانتظار/مقبول/مرفوض) أو حساب قائم يمنع إعادة استخدام البريد
  const allRequests = getRegistrationRequests()
  const emailTaken = allRequests.some(r => norm(r.email) === norm(email)) ||
    getStudentAccounts().some(a => norm(a.email) === norm(email))
  if (emailTaken) {
    const approved = allRequests.find(r => norm(r.email) === norm(email) && r.status === "approved")
    if (approved) return { ok: false, error: "هذا البريد مسجَّل بالفعل — يمكنك تسجيل الدخول مباشرة" }
    return { ok: false, error: "هذا البريد مستخدم في طلب سابق ولا يمكن تكراره — استخدم بريداً آخر أو تواصل مع المعلم" }
  }

  // منع التسجيل أكثر من مرة خلال يومين (48 ساعة) بنفس الهاتف — ولي الأمر يمكن أن يكون هاتفه مكرراً بعد المهلة
  const cooldownCut = Date.now() - REGISTRATION_COOLDOWN_MS
  const phoneCooldown = allRequests.find(
    r => digits(normalizeDigits(r.phone)) === digits(phone) && new Date(r.createdAt || 0).getTime() > cooldownCut
  )
  if (phoneCooldown) {
    const hoursLeft = Math.max(1, Math.ceil((REGISTRATION_COOLDOWN_MS - (Date.now() - new Date(phoneCooldown.createdAt || 0).getTime())) / 3600000))
    return { ok: false, error: `تم التسجيل بهذا الرقم حديثاً — انتظر موافقة المعلم، ويمكن إعادة التقديم بعد ~${hoursLeft} ساعة` }
  }

  let passwordHash: string
  try {
    passwordHash = await sha256Hex(input.password)
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "تعذر تشفير كلمة المرور — أعد المحاولة" }
  }
  const request: RegistrationRequest = {
    id: `reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    phone,
    guardianPhone,
    email,
    passwordHash,
    gradeId: input.gradeId,
    groupId: input.groupId,
    status: "pending",
    createdAt: new Date().toISOString(),
  }

  // التفعيل المباشر: أنشئ الحساب فوراً عبر الدالة الآمنة بدلاً من طلب ينتظر الموافقة
  if (isAutoApproveRegistration()) {
    const auto = await studentRegisterAuto({
      name,
      phone,
      guardianPhone,
      email,
      passwordHash,
      gradeId: input.gradeId,
      groupId: input.groupId,
    })
    if (auto.ok) {
      consumeRate("reg-device-min", 5, 60 * 1000)
      consumeRate("reg-device-hour", 20, 60 * 60 * 1000)
      consumeRate("reg-global", 100, 60 * 60 * 1000)
      return { ok: true, message: "تم إنشاء حسابك بنجاح 🎉 — تسجيل الدخول متاح مباشرة بنفس البريد وكلمة المرور" }
    }
    if (auto.code === "closed") {
      return { ok: false, error: "التسجيل مغلق حالياً — يرجى التواصل مع المعلم" }
    }
    if (auto.code !== "not_enabled") {
      // فشل شبكة/خادم (وليس تغيّر إعداد) — نُبلغ الطالب ولا نحسبها ضمن الحد
      return { ok: false, error: `تعذر إنشاء حسابك: ${auto.error || "تعذر الاتصال بقاعدة البيانات"}` }
    }
    // auto.code === "not_enabled" → الإعداد تغيّر من جهاز آخر: نرسل طلباً عادياً للموافقة
  }

  const res = await submitRegistrationRequest(request)
  if (!res.ok) {
    // فشل الإرسال لا يُحسب ضمن الحد — الطالب يعيد المحاولة فوراً
    return { ok: false, error: `تعذر إرسال الطلب: ${res.error}` }
  }
  // نجاح الإرسال فقط يزيد عدّادات الحماية
  consumeRate("reg-device-min", 5, 60 * 1000)
  consumeRate("reg-device-hour", 20, 60 * 60 * 1000)
  consumeRate("reg-global", 100, 60 * 60 * 1000)
  return {
    ok: true,
    message: "تم إرسال طلب التسجيل بنجاح ✅ — انتظر موافقة المعلم ثم سجّل الدخول بنفس البريد وكلمة المرور",
  }
}

// ------------------------------------------------------------
// جلسة الطالب
// ------------------------------------------------------------

/** مفتاح قديم كان يُستخدم لنسخة الجلسة في localStorage — يُمسح ولا يُكتب مجدداً */
const PORTAL_SESSION_KEY = "studentPortalSession"
/**
 * الجلسة تعيش في كوكي واحد فقط (توكين دخول — ليست بيانات):
 * يتيح للسيرفر (Middleware) معرفة أن الزائر طالب، ويبقيه مسجلاً 30 يوماً.
 * كل بيانات الطالب نفسها تُجلب من Supabase في كل مرة — لا نسخة منها على الجهاز.
 */
const PORTAL_SESSION_COOKIE = "studentPortalSession"
/** مدة صلاحية جلسة الطالب: 30 يوماً ثم يُطلب الدخول من جديد */
const PORTAL_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface PortalSession {
  email: string
  studentId: string
  name: string
  /** لحظة إنشاء الجلسة (ms) */
  iat: number
  /** لحظة انتهاء الجلسة (ms) — بعدها يُطلب تسجيل الدخول مجدداً */
  exp: number
  /**
   * سرّ جلوس أصدره student_login (SECURITY DEFINER) بعد التحقق من كلمة المرور.
   * يستخدمه get_student_portal_data لجلب بيانات الطالب دون قراءة خام من anon.
   */
  token?: string
}

/** قراءة كوكي بالاسم (قيم بسيطة base64) */
function readSessionCookie(): PortalSession | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.split("; ").find(c => c.startsWith(`${PORTAL_SESSION_COOKIE}=`))
  if (!match) return null
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(match.split("=").slice(1).join("=")))))
    return JSON.parse(json) as PortalSession
  } catch {
    return null
  }
}

function writeSessionCookie(session: PortalSession | null): void {
  if (typeof document === "undefined") return
  if (!session) {
    document.cookie = `${PORTAL_SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`
    return
  }
  try {
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(session))))
    const maxAge = Math.max(0, Math.floor((session.exp - Date.now()) / 1000))
    document.cookie = `${PORTAL_SESSION_COOKIE}=${encodeURIComponent(b64)}; path=/; max-age=${maxAge}; SameSite=Lax`
  } catch { /* تجاهل */ }
}

/** الجلسة الحالية — من الكوكي فقط، ويُرفض ما انتهت صلاحيته */
export function getPortalSession(): PortalSession | null {
  if (typeof window === "undefined") return null
  const session = readSessionCookie()
  if (!session) return null
  // جلسة قديمة الشكل (قبل إضافة الصلاحية) أو منتهية → تُلغى
  if (!session.exp || Date.now() >= session.exp) {
    portalLogout()
    return null
  }
  return session
}

export function portalLogout(): void {
  if (typeof window === "undefined") return
  // إلغاء جلسة الطالب في قاعدة البيانات (أفضل جهد — لا يكسر الخروج إن فشل).
  const token = readSessionCookie()?.token
  if (token) { void studentLogout(token) }
  writeSessionCookie(null)
  // مسح أي نسخة قديمة من الجلسة وذاكرة البيانات (لا يبقى شيء على الجهاز)
  try {
    window.localStorage.removeItem(PORTAL_SESSION_KEY)
    window.sessionStorage.removeItem(PORTAL_SESSION_KEY)
  } catch { /* تجاهل */ }
  clearStore()
  // أسرار نتائج الاختبارات قدرات خاصة بهذا المتصفح؛ تمسح عند تسجيل الخروج.
  clearRememberedOnlineExamResultSessions()
}

export type ChangePasswordResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

/**
 * الطالب يغيّر كلمة مروره من داخل بوابته (قسم الطلبات):
 * يتحقق من كلمة المرور القديمة بصرياً ثم يرسل البصمتين إلى الدالة الآمنة
 * change_student_password (SECURITY DEFINER) التي تتأكد من صحة القديمة
 * وتُحدّث حسابه في السحابة — لا تُحفظ كلمة المرور نصاً في أي مكان.
 */
export async function changePortalPassword(
  token: string,
  oldPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  const oldPw = String(oldPassword || "")
  const newPw = String(newPassword || "")
  if (!oldPw) return { ok: false, error: "اكتب كلمة المرور القديمة" }
  if (newPw.length < 6) return { ok: false, error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" }
  if (newPw === oldPw) return { ok: false, error: "كلمة المرور الجديدة لا بد أن تختلف عن القديمة" }
  let oldHash: string, oldFnv: string, newHash: string
  try {
    oldHash = await sha256Hex(oldPw)
    oldFnv = legacyFnvHex(oldPw)
    newHash = await sha256Hex(newPw)
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "تعذر تشفير كلمة المرور على هذا الجهاز" }
  }
  const res = await changeStudentPassword(token, oldHash, oldFnv, newHash)
  if (!res.ok) {
    if (res.code === "wrong_old") return { ok: false, error: "كلمة المرور القديمة غير صحيحة" }
    if (res.code === "invalid") return { ok: false, error: "انتهت صلاحية جلسة الدخول — سجّل الدخول من جديد" }
    return { ok: false, error: res.error || "تعذر تغيير كلمة المرور — أعد المحاولة" }
  }
  return { ok: true, message: "تم تغيير كلمة المرور بنجاح — استخدمها في تسجيل الدخول القادم" }
}

export type LoginResult =
  | { ok: true; session: PortalSession }
  | { ok: false; error: string; status?: 'pending' | 'rejected' | 'blocked' }

/** تسجيل دخول الطالب — مسموح فقط بعد موافقة المعلم وتفعيل حسابه */
export async function portalLogin(email: string, password: string): Promise<LoginResult> {
  const mail = (email || "").trim().toLowerCase()
  if (!mail || !password) return { ok: false, error: "يرجى إدخال البريد وكلمة المرور" }

  // ============================================================
  // المسار الأساسي: دالة student_login (SECURITY DEFINER) تتحقق من كلمة
  // المرور وحالة الحساب داخل قاعدة البيانات وتُصدر توكين الجلسة. لا نعتمد على
  // أي قراءة خام من anon لحسابات/طلبات الطلاب — أصلحنا REVOKE لذلك.
  // (قد يُصل إلى هنا في بيئات قديمة أو المعاينة دون الدالة فيسقط للخطة أدناه).
  // ============================================================
  const mint = await studentLogin(mail, password, legacyFnvHex(password)).catch((e) => ({
    ok: false, code: "unavailable" as const,
    error: (e as Error)?.message || "تعذر الاتصال بقاعدة البيانات",
  }))

  if (mint.code !== "unavailable") {
    // الأفضل رصد الطالب المعني (يُستخدم فقط إذا لم يُرجع الخادم studentId).
    const resolveLocalStudentId = (): string | undefined => {
      const byAccount = getStudentAccounts().find(a => norm(a.email) === norm(mail))?.studentId
      const byReq = getRegistrationRequests()
        .filter(r => norm(r.email) === norm(mail))
        .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
        .pop()?.linkedStudentId
      return byAccount || byReq
    }

    // نجاح — نبني الجلسة بإعادة جلب بيانات الطالب فقط (لا قائمة لبقية الطلاب).
    if (mint.ok) {
      const studentId = mint.studentId || resolveLocalStudentId()
      if (!studentId) {
        return { ok: false, error: "حسابك غير مربوط ببيانات طالب — يرجى التواصل مع المعلم" }
      }
      let student = getStudents().find(s => s.id === studentId)
      if (!student) {
        const remote = await fetchStudentById(studentId).catch(() => null)
        if (remote) student = remote
      }
      if (!student && mint.name) student = { id: studentId, name: mint.name } as any
      if (!student) {
        return {
          ok: false,
          error: "تمت الموافقة على طلبك، لكن تعذر جلب بياناتك الآن — أعد المحاولة، وإن استمر راجع المعلم",
        }
      }
      // نحفظ بيانات الطالب في ذاكرة الجلسة للعرض الفوري فقط — الأصل في السحابة.
      try { if (!getStudents().some(s => s.id === student.id)) saveStudents([...getStudents(), student]) } catch { /* تجاهل */ }
      if (student.status === "inactive") {
        return { ok: false, error: "حسابك موقوف حالياً — يرجى التواصل مع المعلم", status: "blocked" }
      }
      const now = Date.now()
      const session: PortalSession = {
        email: mail,
        studentId,
        name: student.name,
        iat: now,
        exp: now + PORTAL_SESSION_TTL_MS,
        token: mint.token,
      }
      if (typeof window !== "undefined") writeSessionCookie(session)
      return { ok: true, session }
    }

    // نتائج سياسة موثوقة من قاعدة البيانات.
    if (mint.code === "pending") return { ok: false, error: mint.error || "طلبك لا يزال قيد المراجعة — انتظر موافقة المعلم ثم حاول مجدداً", status: "pending" }
    if (mint.code === "rejected") return { ok: false, error: mint.error || "تم رفض طلب التسجيل", status: "rejected" }
    if (mint.code === "blocked") return { ok: false, error: mint.error || "تم إيقاف حسابك من تسجيل الدخول — يرجى التواصل مع المعلم", status: "blocked" }
    if (mint.code === "no_account") return { ok: false, error: mint.error || "لا يوجد حساب بهذا البريد — سجَّل أولاً من صفحة التسجيل" }
    if (mint.code === "not_linked") return { ok: false, error: mint.error || "حسابك غير مربوط ببيانات طالب — يرجى التواصل مع المعلم" }
    if (mint.code === "wrong_password") {
      const failBucket = `login-fail:${norm(mail)}`
      if (!consumeRate(failBucket, 5, 15 * 60 * 1000)) {
        return { ok: false, error: `محاولات كثيرة بخطأ — انتظر ${minutesLeftInWindow(failBucket, 15 * 60 * 1000)} دقيقة ثم حاول مجدداً` }
      }
      return { ok: false, error: mint.error || "كلمة المرور غير صحيحة" }
    }
    return { ok: false, error: mint.error || "تعذر تسجيل الدخول" }
  }

  // ============================================================
  // خطة احتياطية (لا دالة في البيئة): المنطق المحلي + قراءة anon كما كان.
  // ============================================================

  // حساب البوابة مرجع الهوية الأساسي (يتابع تغيّر البريد وكلمة المرور من المدرس).
  // لا نسخة محلية دائمة: إن لم يكن في ذاكرة الجلسة يُجلب من Supabase مباشرة،
  // فيدخل الطالب من أي جهاز في العالم بأحدث حالة لحسابه (تفعيل/كلمة المرور).
  let account = getStudentAccounts().find(a => norm(a.email) === norm(mail))
  if (!account) {
    const remoteAccount = await fetchStudentAccountByEmail(mail).catch(() => null)
    if (remoteAccount) {
      const accounts = getStudentAccounts()
      saveStudentAccounts([...accounts.filter(a => norm(a.email) !== norm(mail)), remoteAccount])
      account = remoteAccount
    }
  }

  // أحدث طلب لنفس البريد هو المعتمد (إعادة التقديم بعد الرفض تلغي القديم)
  let request = getRegistrationRequests()
    .filter(r => norm(r.email) === norm(mail))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
    .pop()
  // طلب بحكم الربط: البريد تغيّر من المدرس فلم يجد الطلب بالبريد الجديد
  let requestIsAuthoritative = true
  if (!request && account && account.active !== false) {
    request = getRegistrationRequests()
      .filter(r => r.linkedStudentId === account.studentId && r.status === "approved")
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
      .pop()
    requestIsAuthoritative = !!request
  }
  if (!request) {
    // جهاز جديد تماماً — ربما سجّل من جهاز آخر
    const remote = await fetchRegistrationRequestByEmail(mail)
    if (remote) {
      saveRegistrationRequests([...getRegistrationRequests(), remote])
      return portalLogin(mail, password)
    }
    return { ok: false, error: "لا يوجد حساب بهذا البريد — سجَّل أولاً من صفحة التسجيل" }
  }

  // مقارنة آمنة: SHA-256 حديثاً + قراءة FNV القديم فقط (بلا كتابة جديدة)
  let matchesRequest = false
  let matchesAccount = false
  try {
    matchesRequest = requestIsAuthoritative && (await passwordMatches(password, request.passwordHash))
    matchesAccount = !!(account && account.active !== false && (await passwordMatches(password, account.passwordHash)))
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "تعذر التحقق من كلمة المرور على هذا الجهاز" }
  }
  if (!matchesRequest && !matchesAccount) {
    // حد محاولات التخمين: 5 فشل/15 دقيقة لكل بريد
    const failBucket = `login-fail:${norm(mail)}`
    if (!consumeRate(failBucket, 5, 15 * 60 * 1000)) {
      return { ok: false, error: `محاولات كثيرة بخطأ — انتظر ${minutesLeftInWindow(failBucket, 15 * 60 * 1000)} دقيقة ثم حاول مجدداً` }
    }
    return { ok: false, error: "كلمة المرور غير صحيحة" }
  }

  if (request.status === "pending") {
    // موافقة المعلم قد حدثت من جهاز آخر (موقع منشور) — نستشير Supabase قبل الرفض
    const remote = await fetchRegistrationRequestByEmail(mail)
    if (remote && remote.status === "approved") {
      const updated = getRegistrationRequests().map(r => (r.id === request.id ? { ...r, ...remote } : r))
      saveRegistrationRequests(updated)
      return portalLogin(mail, password)
    }
    return { ok: false, error: "طلبك لا يزال قيد المراجعة — انتظر موافقة المعلم ثم حاول مجدداً", status: "pending" }
  }
  if (request.status === "rejected") {
    return { ok: false, error: `تم رفض طلب التسجيل${request.reviewNote ? `: ${request.reviewNote}` : ""}`, status: "rejected" }
  }

  if (account && !account.active) {
    return { ok: false, error: "تم إيقاف حسابك من تسجيل الدخول — يرجى التواصل مع المعلم", status: "blocked" }
  }

  const studentId = account?.studentId || request.linkedStudentId
  if (!studentId) {
    return { ok: false, error: "حسابك غير مربوط ببيانات طالب — يرجى التواصل مع المعلم" }
  }

  // جهاز الطالب لا يحمل قائمة الطلاب — إن لم يوجد محلياً نجيبه من السحابة ونحفظه
  let student = getStudents().find(s => s.id === studentId)
  if (!student) {
    const remote = await fetchStudentById(studentId).catch(() => null)
    if (remote) {
      try { saveStudents([...getStudents(), remote]) } catch { /* تجاهل */ }
      student = remote
    }
  }
  if (!student) {
    return {
      ok: false,
      error: "تمت الموافقة على طلبك، لكن تعذر جلب بياناتك الآن — تأكد من اتصال الإنترنت وأعد المحاولة، وإن استمر راجع المعلم",
    }
  }
  // جلسة آمنة: إنشاء توكين جلوس عبر student_login (التحقق من كلمة المرور في قاعدة
  // البيانات + إصدار السر). يوفّر أيضاً الاسم من الخادم إن تعذر جلبه محلياً.
  let sessionToken = ""
  try {
    const mint = await studentLogin(mail, password, legacyFnvHex(password))
    if (mint.ok) {
      sessionToken = mint.token || ""
      if (!student && mint.name && !mint.status) {
        student = { id: studentId, name: mint.name } as any
      }
    }
  } catch { /* بدون Supabase — نكمل بجلسة غير موقعة في وضع العرض فقط */ }

  if (student && student.status === "inactive") {
    return { ok: false, error: "حسابك موقوف حالياً — يرجى التواصل مع المعلم", status: "blocked" }
  }
  if (!student) {
    return {
      ok: false,
      error: "تمت الموافقة على طلبك، لكن تعذر جلب بياناتك الآن — تأكد من اتصال الإنترنت وأعد المحاولة، وإن استمر راجع المعلم",
    }
  }

  const now = Date.now()
  const session: PortalSession = {
    email: mail,
    studentId,
    name: student.name,
    iat: now,
    exp: now + PORTAL_SESSION_TTL_MS,
    token: sessionToken || undefined,
  }
  // الجلسة كوكي فقط — لا تُكتب أي بيانات للطالب على جهازه
  if (typeof window !== "undefined") {
    writeSessionCookie(session)
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

  linkAccountToStudent(request, student, now)

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

/** ربط حساب البريد بالطالب (إنشاء أو تحديث) */
function linkAccountToStudent(request: RegistrationRequest, student: Student, now: string): void {
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
}

/**
 * الموافقة مع فرض إنشاء طالب **جديد** (بدون أي دمج) — عند تشابه الأسماء فقط
 * والمعلم يرى أنهما طالبان مختلفان.
 */
export function approveRegistrationRequestAsNew(requestId: string): ApproveOutcome {
  const requests = getRegistrationRequests()
  const request = requests.find(r => r.id === requestId)
  if (!request) return { ok: false, message: "الطلب غير موجود" }
  if (request.status === "approved") return { ok: false, message: "الطلب مقبول بالفعل" }

  const now = new Date().toISOString()
  const student: Student = {
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
    detail: "اعتبره المعلم طالباً جديداً رغم تشابه الاسم مع طالب آخر",
    date: now,
  })
  linkAccountToStudent(request, student, now)
  saveRegistrationRequests(
    requests.map(r =>
      r.id === requestId
        ? { ...r, status: "approved" as const, reviewedAt: now, linkedStudentId: student.id }
        : r
    )
  )
  return {
    ok: true,
    message: `تم قبوله كطالب جديد «${student.name}» — أصبح الدخول ممكناً`,
    studentId: student.id,
    createdNew: true,
  }
}

/**
 * الموافقة مع الدمج القسري بـ**طالب محدد** — رغم اختلاف الهاتف
 * (قرار المعلم الصريح: إنه نفس الطالب).
 */
export function approveRegistrationRequestWithStudent(requestId: string): ApproveOutcome {
  const requests = getRegistrationRequests()
  const request = requests.find(r => r.id === requestId)
  if (!request) return { ok: false, message: "الطلب غير موجود" }
  if (request.status === "approved") return { ok: false, message: "الطلب مقبول بالفعل" }

  const match = findMatchingStudent(request)
  if (!match) return { ok: false, message: "لا يوجد طالب متشابه لدمجه — استخدم القبول كطالب جديد" }

  const now = new Date().toISOString()
  const student: Student = {
    ...match,
    name: request.name.trim(),
    phone: request.phone.trim(),
    email: request.email.trim().toLowerCase(),
    gradeId: request.gradeId,
    groupId: request.groupId,
    updatedAt: now,
  }
  saveStudents(getStudents().map(s => (s.id === match.id ? student : s)))
  addStudentHistoryEvent({
    studentId: student.id,
    type: "account",
    title: "دمج طلب تسجيل بالطالب",
    detail: "قرر المعلم أنه نفس الطالب (رغم اختلاف الهاتف) — تم تحديث بياناته وربط حسابه",
    date: now,
  })
  linkAccountToStudent(request, student, now)
  saveRegistrationRequests(
    requests.map(r =>
      r.id === requestId
        ? { ...r, status: "approved" as const, reviewedAt: now, linkedStudentId: student.id }
        : r
    )
  )
  return {
    ok: true,
    message: `تم دمج الطلب بالطالب «${student.name}» وتحديث بياناته — أصبح الدخول ممكناً`,
    studentId: student.id,
    updatedExisting: true,
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

  // منع التكرار يتم عرضياً لدى المدرس (الطلبات في السحابة — لا قائمة محلية على جهاز الطالب)

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

export interface TeacherStudentUpdate {
  name?: string
  phone?: string
  email?: string
  gradeId?: string
  groupId?: string
}

/** المعلم يحدّث بيانات طالب (الاسم/الهاتف/البريد/الصف/المجموعة) ويسجل ما غيّره */
export function updateStudentByTeacher(
  studentId: string,
  patch: TeacherStudentUpdate
): { ok: boolean; message: string } {
  const students = getStudents()
  const student = students.find(s => s.id === studentId)
  if (!student) return { ok: false, message: "بيانات الطالب غير موجودة" }

  const changes: string[] = []
  const updated: Student = { ...student, updatedAt: new Date().toISOString() }

  if (patch.name !== undefined && patch.name.trim() && patch.name.trim() !== student.name) {
    updated.name = patch.name.trim()
    changes.push(`الاسم إلى «${updated.name}»`)
  }
  if (patch.phone !== undefined && patch.phone.trim() && digits(normalizeDigits(patch.phone)) !== digits(student.phone || "")) {
    updated.phone = patch.phone.trim()
    changes.push("رقم الهاتف")
  }
  if (patch.email !== undefined && patch.email.trim().toLowerCase() !== (student.email || "")) {
    const mail = patch.email.trim().toLowerCase()
    if (!isValidEmail(mail)) return { ok: false, message: "البريد الإلكتروني غير صحيح" }
    // البريد مفتاح الحساب — نحدّث الحساب أيضاً
    const accounts = getStudentAccounts()
    const oldAccount = accounts.find(a => a.studentId === studentId)
    if (oldAccount && oldAccount.email !== mail) {
      if (accounts.some(a => norm(a.email) === norm(mail) && a.studentId !== studentId)) {
        return { ok: false, message: "هذا البريد مستخدم بحساب طالب آخر" }
      }
      const newAccount: StudentAccount = { ...oldAccount, id: mail, email: mail }
      saveStudentAccounts([...accounts.filter(a => a.id !== oldAccount.id), newAccount])
      // الطلب المعتمد المربوط به يحمل البريد القديم — نوحّده حتى يبقى الدخول يعمل
      saveRegistrationRequests(
        getRegistrationRequests().map(r =>
          norm(r.email) === norm(oldAccount.email) && r.status === "approved" ? { ...r, email: mail } : r
        )
      )
      changes.push("البريد الإلكتروني (مع حساب الدخول)")
    }
    updated.email = mail
    if (!oldAccount) changes.push("البريد الإلكتروني")
  }
  if (patch.groupId !== undefined && patch.groupId !== student.groupId) {
    updated.groupId = patch.groupId
    changes.push("المجموعة")
    if (patch.gradeId) updated.gradeId = patch.gradeId
  } else if (patch.gradeId !== undefined && patch.gradeId !== student.gradeId) {
    updated.gradeId = patch.gradeId
    changes.push("الصف")
  }

  if (changes.length === 0) return { ok: true, message: "لا تغييرات" }

  saveStudents(students.map(s => (s.id === studentId ? updated : s)))
  addStudentHistoryEvent({
    studentId,
    type: "account",
    title: "تعديل بيانات من المعلم",
    detail: `غيّر: ${changes.join("، ")}`,
    date: new Date().toISOString(),
  })
  return { ok: true, message: `تم تحديث: ${changes.join("، ")}` }
}

export type ResetPasswordResult =
  | { ok: true; temporaryPassword: string; message: string }
  | { ok: false; message: string }

/**
 * المعلم يعيد إنشاء كلمة مرور جديدة لطالب نسيها — تُنشأ كلمة مؤقتة
 * (7 خانات) وتُخزَّن بصمتها فقط. المعلم يبلغ الطالب بها ويتغيرها بنفسه لاحقاً.
 */
export async function resetStudentPasswordByTeacher(studentId: string): Promise<ResetPasswordResult> {
  const students = getStudents()
  const student = students.find(s => s.id === studentId)
  if (!student) return { ok: false, message: "بيانات الطالب غير موجودة" }

  const accounts = getStudentAccounts()
  const account = accounts.find(a => a.studentId === studentId)
  if (!account) return { ok: false, message: "الطالب ليس له حساب بوابة بعد — اطلب منه التسجيل أولاً" }

  // كلمة مؤقتة واضحة الحروف (بدون أحرف متشابهة)
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
  let temp = ""
  const arr = new Uint8Array(7)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(arr)
    for (let i = 0; i < 7; i++) temp += alphabet[arr[i] % alphabet.length]
  } else {
    for (let i = 0; i < 7; i++) temp += alphabet[Math.floor(Math.random() * alphabet.length)]
  }

  let passwordHash: string
  try {
    passwordHash = await sha256Hex(temp)
  } catch (e) {
    return { ok: false, message: (e as Error)?.message || "تعذر تشفير كلمة المرور على هذا الجهاز" }
  }
  saveStudentAccounts(
    accounts.map(a => (a.id === account.id ? { ...a, passwordHash, active: true } : a))
  )

  // طلب التسجيل المعتمد يفحص البصمة أيضاً — نوحّدها حتى يعمل الدخول فوراً
  saveRegistrationRequests(
    getRegistrationRequests().map(r =>
      r.linkedStudentId === studentId && r.status === "approved" ? { ...r, passwordHash } : r
    )
  )

  addStudentHistoryEvent({
    studentId,
    type: "account",
    title: "إعادة إنشاء كلمة المرور",
    detail: "أنشأ المعلم كلمة مرور مؤقتة جديدة بناءً على طلب الطالب",
    date: new Date().toISOString(),
  })

  return {
    ok: true,
    temporaryPassword: temp,
    message: `كلمة المرور المؤقتة للطالب «${student.name}» — أبلغه بها، وسيجب تغييرها من صفحته`,
  }
}

// ------------------------------------------------------------
// استرجاع بيانات الدخول (نسيت كلمة المروري / نسيت بريدي)
// ------------------------------------------------------------

/** ملاحظة تضع على الطلب حين يطلب الطالب إعادة تعيين كلمته — المعلم يراها في قسم الطلبات */
export const RECOVERY_NOTE = "🔐 الطالب يطلب إعادة تعيين كلمة المرور (نسيت كلمة المروري)"

export type RecoveryRequestResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

export interface RecoveryStatus {
  found: boolean
  kind?: "reset" | "reminder"
  studentName?: string
  /** للمدرس فقط — لا يُعرض للطالب */
  tempPassword?: string
  message: string
}

/** الطالب يطلب إعادة تعيين كلمة مروره — يُحفظ كطلب معلّق يراها المعلم في قسم الطلبات */
export function requestPasswordReset(name: string, email: string, phone: string): RecoveryRequestResult {
  const n = norm(name)
  const mail = (email || "").trim().toLowerCase()
  const ph = digits(normalizeDigits(phone))
  if (!n || !ph) return { ok: false, error: "أدخل اسمك ورقم هاتفك (والبريد إن تذكرته)" }

  // حد أقصى 3 طلبات استرجاع/ساعة من نفس الجهاز
  if (!consumeRate("recovery", 3, 60 * 60 * 1000)) {
    return { ok: false, error: `محاولات كثيرة — انتظر ${minutesLeftInWindow("recovery", 60 * 60 * 1000)} دقيقة ثم حاول مجدداً` }
  }

  // نجيب من كل المصادر: الطلبات المحلية + السحابة (لو الموقع منشور وجاء الطلب من جهاز آخر)
  const reqs = getRegistrationRequests()
  const byEmail = reqs.find(r => norm(r.email) === mail)
  const byNamePhone = reqs.find(r => norm(r.name) === n && digits(normalizeDigits(r.phone)) === ph)
  const target = byEmail || byNamePhone
  if (!target) {
    return { ok: false, error: "لا توجد بيانات مطابقة — تأكد من الاسم والبريد ورقم الهاتف كما سجلت بهم" }
  }

  if (target.status === "pending") {
    return { ok: true, message: "طلبك الأصلي لا يزال قيد المراجعة — انتظر موافقة المعلم أولاً" }
  }
  if (target.status === "rejected") {
    return { ok: false, error: "طلب التسجيل بهذا البريد مرفوض — راجع المعلم أو سجّل من جديد" }
  }

  // نكتب طلب مراجعة معلّق — المعلم هو من ينشئ كلمة المرور الجديدة ويسلّمها للطالب
  saveRegistrationRequests(
    reqs.map(r => (r.id === target.id ? { ...r, reviewNote: RECOVERY_NOTE } : r))
  )
  return { ok: true, message: "تم إرسال طلبك للمعلم — راجع المعلم لاستلام كلمة مرور مؤقتة ثم حاول الدخول بها" }
}

/** الطالب نسى بريده — نبحث بالاسم + الهاتف ونجيب بتلميح (البريد مخفي جزئياً) */
export function remindEmailByName(name: string, phone: string): { ok: boolean; message: string } {
  const n = norm(name)
  const ph = digits(normalizeDigits(phone))
  if (!n || !ph) return { ok: false, message: "أدخل الاسم ورقم الهاتف" }

  if (!consumeRate("recovery", 3, 60 * 60 * 1000)) {
    return { ok: false, message: `محاولات كثيرة — انتظر ${minutesLeftInWindow("recovery", 60 * 60 * 1000)} دقيقة ثم حاول مجدداً` }
  }

  const all: { name: string; email: string }[] = []
  for (const r of getRegistrationRequests()) {
    if (norm(r.name) === n && digits(normalizeDigits(r.phone)) === ph && r.email) all.push({ name: r.name, email: r.email })
  }
  const accounts = getStudentAccounts()
  const students = getStudents()
  for (const a of accounts) {
    const st = students.find(s => s.id === a.studentId)
    if (st && norm(st.name) === n && digits(normalizeDigits(st.phone || "")) === ph) all.push({ name: st.name, email: a.email })
  }
  if (all.length === 0) return { ok: false, message: "لا توجد حساب مطابق لهذا الاسم والهاتف" }

  const unique = Array.from(new Map(all.map(x => [norm(x.email), x])).values())
  const hints = unique.map(x => {
    const [user, domain] = x.email.split("@")
    const shown = user.slice(0, 2) + "•".repeat(Math.max(user.length - 2, 2))
    return `${shown}@${domain}`
  })
  return { ok: true, message: `بريدك المسجَّل يبدأ بـ: ${hints.join(" أو ")} — استخدمه في صفحة الدخول` }
}

/** المعلم ينشئ كلمة مرور جديدة لطالب بعد طلب استرجاع — ويمسح ملاحظة الطلب */
export async function fulfillRecoveryByTeacher(requestId: string): Promise<ResetPasswordResult> {
  const request = getRegistrationRequests().find(r => r.id === requestId)
  if (!request) return { ok: false, message: "الطلب غير موجود" }

  // الطالب المربوط بالطلب أولاً، وإلا نبحث بالاسم/البريد
  let studentId = request.linkedStudentId || ""
  if (!studentId) {
    const students = getStudents()
    const st = students.find(s => norm(s.email || "") === norm(request.email)) ||
      students.find(s => norm(s.name) === norm(request.name))
    studentId = st?.id || ""
  }
  if (!studentId) return { ok: false, message: "لا يوجد طالب مربوط بهذا الطلب — اعتمد الطلب أولاً أو أنشئ الطالب" }

  const res = await resetStudentPasswordByTeacher(studentId)
  if (res.ok) {
    saveRegistrationRequests(
      getRegistrationRequests().map(r => (r.id === requestId ? { ...r, reviewNote: undefined } : r))
    )
  }
  return res
}

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

/** حذف حساب البوابة عند حذف الطالب (تستدعيها واجهات سابقة مباشرة؛ والحذف المتسلسل يمسحها مع بقية صفوف الطالب) */
export function removeStudentPortalAccount(studentId: string): void {
  const accounts = getStudentAccounts()
  saveStudentAccounts(accounts.filter(a => a.studentId !== studentId))
}
