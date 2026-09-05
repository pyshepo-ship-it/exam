/**
 * بطاقة المتصفح (Device ticket) — كيف يُعرف الزائر بلا رقم هاتف ولا تسجيل؟
 *
 * المشكلة: استبيان مفتوح للجميع بلا تسجيل لا يملك هوية يمنع بها الرد المكرر،
 * وطلب رقم الهاتف حلٌّ وهمي (أي أحد يكتب مئة رقم غير حقيقي) ومزعج للطالب.
 *
 * الحل: يولّد المتصفح نصًّا عشوائيًا مرة واحدة ويحتفظ به، ويرسله مع الرد.
 * الخادم لا يخزّنه كما هو: يهشّره بملح سرّي خاص بكل استبيان، فتصير «بصمة»
 * تمنع الرد الثاني ولا تدل على صاحبها ولا تصلح للتتبع بين الاستبيانات.
 *
 * لماذا مكانان (localStorage + كوكي)؟ لأن مسح أحدهما وحده شائع جدًا، وكل
 * واحد منهما يستعيد الآخر. ووضع التخفي يبدأ ببطاقة جديدة بطبيعته — يكمله
 * كشف الشبكة في الخادم (ترحيل 023).
 *
 * لا يحتوي أي بيانات شخصية: نص عشوائي فقط.
 */

const KEY = "survey_device_id"
const COOKIE = "sdid"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400 // ~13 شهرًا

/** نص عشوائي آمن (32 حرفًا) — crypto إن توفر، وإلا بديل مقبول */
function randomId(): string {
  try {
    const c = globalThis.crypto
    if (c && typeof c.getRandomValues === "function") {
      const bytes = new Uint8Array(16)
      c.getRandomValues(bytes)
      return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")
    }
  } catch {
    /* المتصفحات القديمة أو السياقات غير الآمنة */
  }
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 12) +
    Math.random().toString(36).slice(2, 12)
  ).slice(0, 32)
}

/** الشكل المقبول في الخادم: 16..128 من حروف وأرقام وشرطات (survey_device_key) */
export function isValidDeviceId(value: string): boolean {
  return /^[a-z0-9-]{16,128}$/.test(value || "")
}

function readCookie(name: string): string {
  if (typeof document === "undefined") return ""
  const match = document.cookie.split("; ").find(part => part.startsWith(name + "="))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ""
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return
  try {
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : ""
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`
  } catch {
    /* الكوكيز محظورة: يبقى localStorage */
  }
}

function readLocal(name: string): string {
  try {
    return window.localStorage.getItem(name) || ""
  } catch {
    return ""
  }
}

function writeLocal(name: string, value: string) {
  try {
    window.localStorage.setItem(name, value)
  } catch {
    /* وضع التخفي المتشدد أو تخزين ممتلئ: يبقى الكوكي */
  }
}

/**
 * بطاقة هذا المتصفح — تُنشأ عند أول استعمال وتُكتب في المخزنين معًا،
 * وإن وُجدت في أحدهما فقط تُنسخ إلى الآخر (استعادة بعد مسح جزئي).
 * تُعيد "" على الخادم (SSR) فلا يُرسل شيء.
 */
export function getSurveyDeviceId(): string {
  if (typeof window === "undefined") return ""

  const fromLocal = readLocal(KEY)
  const fromCookie = readCookie(COOKIE)

  let id = isValidDeviceId(fromLocal) ? fromLocal : isValidDeviceId(fromCookie) ? fromCookie : ""
  if (!id) id = randomId()

  if (fromLocal !== id) writeLocal(KEY, id)
  if (fromCookie !== id) writeCookie(COOKIE, id)

  return id
}
