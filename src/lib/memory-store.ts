import { STORAGE_KEYS } from "./storage-keys"

// ============================================================
// مخزن الذاكرة (Runtime Memory Store) — صفر تخزين محلي للبيانات
// ============================================================
// السياسة المعتمدة من صاحب الموقع:
//   • Supabase هو المكان الوحيد الذي تُسجَّل فيه البيانات نهائياً
//     (الطلاب، الصفوف، المجموعات، المواعيد، التحصيل، الاختبارات،
//      المحاولات، الإعلانات، لوحة الشرف، الملفات، الروابط، الأرشيف…).
//   • لا يُكتب أي بيان في localStorage أو sessionStorage أو IndexedDB.
//   • كل صفحة تجلب بياناتها من السحابة تلقائياً عند فتحها، والطالب
//     يفتح اختباره أو حسابه من أي جهاز في العالم فيجد أحدث بيانات.
//
// هذه الذاكرة متغيّرات داخل تبويب المتصفح أثناء الجلسة فقط:
//   • تُعبَّأ من السحابة (pullAllData / fetchPublicData / fetchStudentPortalData)
//   • وكل حفظ يذهب إلى السحابة ثم يُحدِّث الذاكرة للعرض الفوري
//   • وتُمسح تماماً عند تحديث الصفحة أو إغلاقها أو تسجيل الخروج
//   • وأي كاش قديم تركته النسخ السابقة في المتصفح يُمسح تلقائياً عند الإقلاع
//
// ما يبقى على الجهاز (ليس بيانات): كوكي جلسة الدخول، مظهر الموقع
// (ليلي/نهاري)، عدّاد حماية الإغراق، وشارة «جديد» للإعلانات.
// ============================================================

const isBrowser = (): boolean => typeof window !== "undefined"

const rowsStore = new Map<string, unknown[]>()
const settingsStore = new Map<string, string>()

type Listener = () => void
const listeners = new Set<Listener>()

/** قراءة صفوف كيان من الذاكرة (فارغة حتى تصل بيانات السحابة) */
export function readRows<T>(key: string): T[] {
  if (!isBrowser()) return []
  return (rowsStore.get(key) as T[] | undefined) || []
}

/** كتابة صفوف كيان في الذاكرة — لا تُكتب على الجهاز أبداً */
export function writeRows<T>(key: string, rows: T[]): void {
  if (!isBrowser()) return
  rowsStore.set(key, Array.isArray(rows) ? [...rows] : [])
  notifyStoreUpdate(key)
}

/** قراءة إعداد (مفتاح/قيمة) من الذاكرة */
export function readSetting(key: string, fallback = ""): string {
  if (!isBrowser()) return fallback
  const v = settingsStore.get(key)
  // القيمة الفارغة مقصودة أحياناً (مثل إغلاق التسجيل) — لا تُستبدل بالافتراضي
  return v === undefined ? fallback : v
}

/** كتابة إعداد في الذاكرة (مع دفعه للسحابة من مكان الحفظ) */
export function writeSetting(key: string, value: string): void {
  if (!isBrowser()) return
  settingsStore.set(key, value)
  notifyStoreUpdate(key)
}

/** مسح الذاكرة بالكامل أو مفاتيح محددة (تسجيل خروج / حذف كل البيانات) */
export function clearStore(keys?: string[]): void {
  if (!isBrowser()) return
  if (!keys) {
    rowsStore.clear()
    settingsStore.clear()
  } else {
    for (const k of keys) {
      rowsStore.delete(k)
      settingsStore.delete(k)
    }
  }
  notifyStoreUpdate()
}

/** الاشتراك في تحديثات الذاكرة (لتُحدِّث الصفحات عرضها بعد وصول بيانات السحابة) */
export function onStoreUpdate(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function notifyStoreUpdate(_key?: string): void {
  for (const fn of listeners) {
    try { fn() } catch { /* مستمع متعطل لا يوقف البقية */ }
  }
}

// ------------------------------------------------------------
// إنقاذ ثم مسح أي تخزين محلي قديم (النسخ السابقة كانت تحتفظ بكاش في المتصفح)
// ------------------------------------------------------------

/** مفاتيح إعدادات قديمة (مفتاح/قيمة) كانت تُحفظ في المتصفح */
const LEGACY_SETTING_KEYS: string[] = [
  "teacherName",
  "teacherSignatureLine",
  "whatsappNumber",
  "schedulePublished",
  "registrationOpen",
  "autoApproveRegistration",
  "studentReportsEnabled",
]

/** كل المفاتيح التي يجب أن تختفي من المتصفح نهائياً */
const LEGACY_KEYS: string[] = [
  ...Object.values(STORAGE_KEYS),
  ...LEGACY_SETTING_KEYS,
  "sampleGradesBackup",
  "sampleBannerDismissed", // علم إخفاء شريط «البيانات التجريبية» القديم — أُلغي الشريط
  "initialized", // علم البذرة القديمة في الإصدارات السابقة
  "studentPortalSession", // الجلسة الآن كوكي فقط — لا نسخة في localStorage
]

function readLegacy<T>(key: string): T[] {
  try {
    const raw = window.localStorage?.getItem(key) ?? null
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

/**
 * إنقاذ لمرة واحدة: أي كاش قديم في المتصفح ينتقل إلى ذاكرة الجلسة
 * (ليُرفع إلى السحابة إن كانت فارغة) ثم يُمسح من الجهاز نهائياً.
 */
export function adoptLegacyIntoMemory(): void {
  if (!isBrowser()) return
  for (const key of Object.values(STORAGE_KEYS)) {
    if (rowsStore.has(key)) continue
    const legacy = readLegacy<unknown>(key)
    if (legacy.length > 0) rowsStore.set(key, legacy)
  }
  for (const key of LEGACY_SETTING_KEYS) {
    if (settingsStore.has(key)) continue
    let v: string | null = null
    try { v = window.localStorage?.getItem(key) ?? null } catch { v = null }
    if (v !== null) settingsStore.set(key, v)
  }
}

/**
 * حذف أي بيانات محفوظة محلياً من النسخ السابقة (localStorage + sessionStorage).
 * لا يمسّ مظهر الموقع ولا عدّاد حماية الإغراق ولا شارة «جديد» (ليست بيانات).
 */
export function purgeLegacyLocalStorage(): void {
  if (!isBrowser()) return
  const remove = (storage: Storage | undefined | null, key: string): void => {
    try { storage?.removeItem(key) } catch { /* تخزين محجوب (وضع خاص) — لا شيء محفوظ */ }
  }
  for (const key of LEGACY_KEYS) {
    remove(window.localStorage, key)
    remove(window.sessionStorage, key)
  }
}

// عند إقلاع التطبيق في المتصفح: إنقاذ أي كاش قديم إلى الذاكرة ثم مسح المتصفح نهائياً
if (isBrowser()) {
  adoptLegacyIntoMemory()
  purgeLegacyLocalStorage()
}
