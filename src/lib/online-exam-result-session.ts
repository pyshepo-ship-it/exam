import type { OnlineExamTimerSession } from "./supabase/sync"

/**
 * قدرة قصيرة محفوظة في كوكي، وليست نسخة من إجابات الطالب أو بياناته.
 * السر يصدره PostgreSQL عند بدء الجلسة ويُستخدم فقط لاستعادة نتيجة الجلسة
 * نفسها عبر RPC المقيد. لا نستخدم localStorage أو sessionStorage لهذا الغرض.
 */
export interface RememberedOnlineExamSession {
  id: string
  secret: string
  savedAt: number
}

const COOKIE_NAME = "onlineExamResultSessions"
const MAX_SESSIONS = 12
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60

function encode(value: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(value))))
}

function decode(value: string): unknown {
  return JSON.parse(decodeURIComponent(escape(atob(value))))
}

function validSession(value: unknown): value is RememberedOnlineExamSession {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<RememberedOnlineExamSession>
  return typeof item.id === "string" && item.id.length >= 12
    && typeof item.secret === "string" && item.secret.length >= 32
    && typeof item.savedAt === "number" && Number.isFinite(item.savedAt)
}

function readCookie(): RememberedOnlineExamSession[] {
  if (typeof document === "undefined") return []
  const raw = document.cookie.split("; ").find(cookie => cookie.startsWith(`${COOKIE_NAME}=`))
  if (!raw) return []
  try {
    const value = decode(decodeURIComponent(raw.split("=").slice(1).join("=")))
    if (!Array.isArray(value)) return []
    const earliest = Date.now() - MAX_AGE_SECONDS * 1000
    return value.filter(validSession).filter(item => item.savedAt >= earliest)
  } catch {
    return []
  }
}

function writeCookie(sessions: RememberedOnlineExamSession[]): void {
  if (typeof document === "undefined") return
  if (sessions.length === 0) {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`
    return
  }
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : ""
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(encode(sessions.slice(0, MAX_SESSIONS)))}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`
  } catch {
    // فشل كتابة الكوكي لا يوقف الاختبار؛ تبقى النتيجة ظاهرة في الجلسة الحالية.
  }
}

/** يتذكر سر الجلسة العشوائي فقط حتى يستعيد الطالب نتيجته على هذا الجهاز. */
export function rememberOnlineExamResultSession(session: OnlineExamTimerSession): void {
  if (typeof window === "undefined") return
  const item: RememberedOnlineExamSession = {
    id: session.id,
    secret: session.secret,
    savedAt: Date.now(),
  }
  const previous = readCookie().filter(existing => existing.id !== item.id)
  writeCookie([item, ...previous])
}

/** الجلسات التي يملك المتصفح سراً عشوائياً صالحاً لاستعادة نتائجها فقط. */
export function getRememberedOnlineExamResultSessions(): RememberedOnlineExamSession[] {
  return readCookie()
}

/** يستخدم عند خروج الطالب كي لا تبقى قدرات نتائج على جهاز مشترك. */
export function clearRememberedOnlineExamResultSessions(): void {
  writeCookie([])
}
