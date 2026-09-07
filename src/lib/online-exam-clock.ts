/**
 * ساعة عرض فقط؛ انتهاء المحاولة وقبول الإجابات يُحسمان دائماً في PostgreSQL.
 * لا نقارن طابعاً زمنياً من الخادم بـ Date.now(): ساعة الهاتف قد تكون خاطئة
 * أو تتغير تلقائياً أثناء الاختبار. performance.now() لا يتأثر بهذه القفزات.
 */
export interface OnlineExamServerTime {
  startedAt: string
  expiresAt: string
  serverNow: string
}

export interface OnlineExamClock {
  /** موعد في نطاق performance.now()، وليس Unix time. لا يُحفظ على الجهاز. */
  deadline: number
  durationMs: number
  /** لترتيب ردود المزامنة المتأخرة؛ صفر لبيئة التطوير بلا خادم. */
  serverTime: number
}

export const DEFAULT_ONLINE_EXAM_MINUTES = 60
export const MAX_ONLINE_EXAM_MINUTES = 1440

/** نفس قاعدة start_online_exam_session: الصفر/السالب/الفارغ = 60، لا دقيقة واحدة. */
export function onlineExamDurationMinutes(value?: number | null): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.min(MAX_ONLINE_EXAM_MINUTES, Math.round(value)))
    : DEFAULT_ONLINE_EXAM_MINUTES
}

/**
 * نرسو بساعة الخادم على الساعة الرتيبة عند وصول الرد. نصف زمن الرحلة تقدير
 * للشبكة، وليس إذناً بالتسليم: إن سبق التقدير الخادم يرد in_progress ولا يُغلق
 * الاختبار. إعادة المزامنة عند العودة من الخلفية تعالج المتصفحات التي توقف
 * performance.now() أثناء نوم الجهاز، من دون منح وقت إضافي على الخادم.
 */
export function clockFromServer(
  timing: OnlineExamServerTime,
  requestStarted: number,
  receivedAt: number
): OnlineExamClock | null {
  const started = Date.parse(timing.startedAt)
  const expires = Date.parse(timing.expiresAt)
  const now = Date.parse(timing.serverNow)
  if (![started, expires, now, requestStarted, receivedAt].every(Number.isFinite)
    || expires <= started || now < started || receivedAt < requestStarted) return null

  const durationMs = expires - started
  const transitMs = (receivedAt - requestStarted) / 2
  const remainingMs = Math.max(0, Math.min(durationMs, expires - now - transitMs))
  return { deadline: receivedAt + remainingMs, durationMs, serverTime: now }
}

export function remainingExamSeconds(clock: OnlineExamClock | null, now: number): number {
  return clock ? Math.max(0, Math.ceil((clock.deadline - now) / 1000)) : 0
}

export function elapsedExamSeconds(clock: OnlineExamClock, now: number): number {
  return Math.min(
    Math.round(clock.durationMs / 1000),
    Math.max(0, Math.round((clock.durationMs - (clock.deadline - now)) / 1000))
  )
}
