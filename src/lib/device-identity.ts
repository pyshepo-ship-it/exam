/**
 * هوية الجهاز (Device identity) — التعرّف على الزائر بلا تسجيل دخول.
 *
 * تتكوّن من طبقتين مستقلتين تمامًا، ويُرسلان معًا في كل طلب حسّاس:
 *
 *  1) البطاقة (card): نص عشوائي 32 خانة يولّده المتصفح مرة واحدة، ويُخزَّن في
 *     ثلاثة أماكن — localStorage و IndexedDB وكوكي سنة — وكل مكان يُعيد بناء
 *     الآخرين إن مُسح أحدهم. ثابتة تمامًا وفريدة لكل متصفح، لكنها تضيع مع
 *     المسح الكامل للبيانات أو نافذة التخفي.
 *
 *  2) البصمة (fingerprint): هاش SHA-256 مشتق من خصائص العتاد والنظام التي لا
 *     يستطيع الطالب العادي تغييرها: بصمة رسم Canvas، ومورّد/معالج WebGL،
 *     ومقاس الشاشة وعمق الألوان، وعدد الأنوية والذاكرة، والمنطقة الزمنية
 *     واللغة والنظام، وعرض الخطوط. لا تحتاج تخزينًا إطلاقًا: تُحسب من الجهاز
 *     نفسه في كل مرة، فتصمد أمام مسح البيانات والتخفي وتبديل الاسم.
 *
 * الطبقتان معًا: البطاقة تميّز جهازين متطابقي المواصفات، والبصمة تُمسك من
 * مسح بطاقته. والخادم يخزّن الاثنين مهشَّرين ويربطهما بحساب الطالب لحظة
 * دخوله، فتُعرف مشاركاته المجهولة لاحقًا.
 *
 * حدود صادقة: لا توجد في المتصفح بصمة «يستحيل تزويرها». هذا المزيج يصمد أمام
 * مسح الكوكيز وتغيير الاسم والخروج من الحساب وأغلب حالات التخفي، وينكسر
 * بجهاز آخر حقيقي أو متصفح مختلف كليًا. ولذلك يبقى قرار المنع/التنبيه بيد
 * المعلم في الحالات الحرجة.
 *
 * لا يُخزَّن هنا أي بيانات شخصية: نص عشوائي + هاش لا يُعكس.
 */

const CARD_KEY = "device_card_id"
const CARD_COOKIE = "dvc"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400 // ~13 شهرًا
const IDB_NAME = "device-identity"
const IDB_STORE = "card"

/** الشكل المقبول في الخادم: 16..128 من حروف وأرقام وشرطات */
export function isValidDeviceCard(value: string): boolean {
  return /^[a-z0-9-]{16,128}$/.test(value || "")
}

/** هاش سداسي عشري 64 خانة */
export function isValidFingerprint(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value || "")
}

function randomId(): string {
  try {
    const c = globalThis.crypto
    if (c && typeof c.getRandomValues === "function") {
      const bytes = new Uint8Array(16)
      c.getRandomValues(bytes)
      return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")
    }
  } catch {
    /* سياق غير آمن أو متصفح قديم */
  }
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 12) +
    Math.random().toString(36).slice(2, 12)
  ).slice(0, 32)
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
    /* الكوكيز محظورة: يبقى المخزنان الآخران */
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
    /* تخزين ممتلئ أو محظور */
  }
}

/** IndexedDB: المخزن الثالث — ينجو غالبًا من «مسح الكوكيز» السريع */
function idbRead(): Promise<string> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(IDB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE)
      }
      req.onerror = () => resolve("")
      req.onsuccess = () => {
        try {
          const db = req.result
          if (!db.objectStoreNames.contains(IDB_STORE)) return resolve("")
          const get = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get("id")
          get.onsuccess = () => resolve(typeof get.result === "string" ? get.result : "")
          get.onerror = () => resolve("")
        } catch {
          resolve("")
        }
      }
    } catch {
      resolve("")
    }
  })
}

function idbWrite(value: string): Promise<void> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(IDB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE)
      }
      req.onerror = () => resolve()
      req.onsuccess = () => {
        try {
          const db = req.result
          if (!db.objectStoreNames.contains(IDB_STORE)) return resolve()
          const tx = db.transaction(IDB_STORE, "readwrite")
          tx.objectStore(IDB_STORE).put(value, "id")
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
        } catch {
          resolve()
        }
      }
    } catch {
      resolve()
    }
  })
}

/**
 * بطاقة هذا المتصفح — تُقرأ من أي مخزن متاح وتُكتب في الثلاثة معًا.
 * النسخة المتزامنة (بلا IndexedDB) كي تصلح للاستدعاء داخل الرسم.
 */
export function getDeviceCard(): string {
  if (typeof window === "undefined") return ""
  const fromLocal = readLocal(CARD_KEY)
  const fromCookie = readCookie(CARD_COOKIE)
  let id = isValidDeviceCard(fromLocal) ? fromLocal : isValidDeviceCard(fromCookie) ? fromCookie : ""
  if (!id) id = randomId()
  if (fromLocal !== id) writeLocal(CARD_KEY, id)
  if (fromCookie !== id) writeCookie(CARD_COOKIE, id)
  void idbWrite(id)
  return id
}

/** نسخة تنتظر IndexedDB أيضًا: تستعيد البطاقة بعد مسح localStorage والكوكي معًا */
export async function getDeviceCardAsync(): Promise<string> {
  if (typeof window === "undefined") return ""
  const fromLocal = readLocal(CARD_KEY)
  const fromCookie = readCookie(CARD_COOKIE)
  const fromIdb = await idbRead()
  let id = [fromLocal, fromCookie, fromIdb].find(isValidDeviceCard) || ""
  if (!id) id = randomId()
  if (fromLocal !== id) writeLocal(CARD_KEY, id)
  if (fromCookie !== id) writeCookie(CARD_COOKIE, id)
  if (fromIdb !== id) await idbWrite(id)
  return id
}

/** بصمة رسم Canvas — تختلف باختلاف كرت الشاشة ومحرك الرسم والخطوط */
function canvasSignal(): string {
  try {
    const canvas = document.createElement("canvas")
    canvas.width = 240
    canvas.height = 60
    const ctx = canvas.getContext("2d")
    if (!ctx) return "no-canvas"
    ctx.textBaseline = "top"
    ctx.font = "16px 'Arial'"
    ctx.fillStyle = "#f60"
    ctx.fillRect(0, 0, 120, 24)
    ctx.fillStyle = "#069"
    ctx.fillText("بصمة الجهاز 0123 Ag#", 2, 2)
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)"
    ctx.fillText("بصمة الجهاز 0123 Ag#", 4, 18)
    ctx.beginPath()
    ctx.arc(60, 40, 14, 0, Math.PI * 2, true)
    ctx.closePath()
    ctx.fill()
    return canvas.toDataURL().slice(-160)
  } catch {
    return "canvas-blocked"
  }
}

/** مورّد ومعالج الرسوميات — من أثبت الإشارات على الهاتف نفسه */
function webglSignal(): string {
  try {
    const canvas = document.createElement("canvas")
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null
    if (!gl) return "no-webgl"
    const dbg = gl.getExtension("WEBGL_debug_renderer_info")
    const vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR))
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
    return `${vendor}|${renderer}|${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`
  } catch {
    return "webgl-blocked"
  }
}

/** الخطوط المتاحة — تختلف بين الأجهزة والأنظمة ولا يغيّرها المستخدم عادةً */
function fontsSignal(): string {
  try {
    const probes = ["Arial", "Tahoma", "Times New Roman", "Courier New", "Cairo", "Amiri", "Noto Naskh Arabic", "Segoe UI", "Roboto"]
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return "no-ctx"
    return probes
      .map(font => {
        ctx.font = `14px '${font}', monospace`
        return Math.round(ctx.measureText("نصٌ تجريبي Wg42").width)
      })
      .join(",")
  } catch {
    return "fonts-blocked"
  }
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")
}

/** بديل هاش عند غياب crypto.subtle (سياق غير آمن) — يبقى الشكل 64 خانة */
function fallbackHash(text: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < text.length; i++) {
    h1 = (h1 ^ text.charCodeAt(i)) >>> 0
    h1 = (h1 * 0x01000193) >>> 0
    h2 = (h2 + text.charCodeAt(i) * (i + 7)) >>> 0
  }
  const part = (n: number) => n.toString(16).padStart(8, "0")
  return (part(h1) + part(h2)).repeat(4).slice(0, 64)
}

let cachedFingerprint = ""

/**
 * بصمة العتاد — تُحسب من الجهاز نفسه بلا أي تخزين، فتصمد أمام مسح البيانات
 * ونافذة التخفي. تُحسب مرة واحدة لكل صفحة وتُحفظ في الذاكرة فقط.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return ""
  if (cachedFingerprint) return cachedFingerprint

  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number }
  const parts = [
    canvasSignal(),
    webglSignal(),
    fontsSignal(),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    `${screen.availWidth}x${screen.availHeight}`,
    String(window.devicePixelRatio || 1),
    String(nav.hardwareConcurrency || 0),
    String(nav.deviceMemory || 0),
    String(nav.maxTouchPoints || 0),
    navigator.platform || "",
    (navigator.languages || [navigator.language]).join(","),
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    String(new Date().getTimezoneOffset()),
    // نوع المتصفح مُدرج كإشارة واحدة فقط ضمن الخليط، لا كأساس للتعرّف
    (navigator.userAgent || "").replace(/[\d.]+/g, ""),
  ]

  const raw = parts.join("~")
  try {
    cachedFingerprint = await sha256Hex(raw)
  } catch {
    cachedFingerprint = fallbackHash(raw)
  }
  return cachedFingerprint
}

/**
 * البصمة المحسوبة سابقًا في هذه الصفحة (بلا انتظار) — للمسارات المتزامنة مثل
 * خرائط الرفع. تُملأ من أول نبضة جهاز عند فتح الصفحة.
 */
export function getCachedFingerprint(): string {
  return cachedFingerprint
}

export interface DeviceIdentity {
  /** البطاقة الثابتة المخزَّنة (قد تضيع بالمسح الكامل) */
  card: string
  /** بصمة العتاد المحسوبة (تصمد أمام المسح) */
  fingerprint: string
}

/** هوية هذا الجهاز كاملة — تُرسل مع كل طلب حسّاس (اختبار/استبيان/استفسار) */
export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  if (typeof window === "undefined") return { card: "", fingerprint: "" }
  const [card, fingerprint] = await Promise.all([getDeviceCardAsync(), getDeviceFingerprint()])
  return { card, fingerprint }
}
