"use client"

import React, { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  Clock,
  CheckCircle2,
  Trophy,
  BookOpen,
  AlertCircle,
  LogIn,
  UserPlus,
  ShieldCheck,
  UserX,
  Globe,
  Phone,
  GraduationCap,
  Loader2,
  PlayCircle,
  Users,
  History,
  Star,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Exam,
  ExamAccessMode,
  ExamAttempt,
  ExamAttemptAnswer,
  Grade,
  Student,
  Question,
  SubQuestion,
  getExams,
  getGrades,
  getStudents,
  getGroupsOfGrade,
  isOnlineExam,
  getOnlineExamMode,
  isObjectiveQuestionType,
  getExamAttempts,
  saveExamAttempts,
  maybeAutoHonor,
} from "@/lib/data-storage"
import { gradeExam, shouldPromoteToHonor } from "@/lib/exam-grade"
import { gradeSealedExam, sealExamForStudent, withServerFeedback } from "@/lib/exam-public"
import { isSupabaseConfigured } from "@/lib/supabase/client"
import { rememberOnlineExamResultSession, getRememberedOnlineExamResultSessions } from "@/lib/online-exam-result-session"
import {
  fetchPublicData,
  fetchStudentSelfRecord,
  submitPublicHonoree,
  startOnlineExamTimerSession,
  saveOnlineExamTimerProgress,
  submitOnlineExamTimerSession,
  getOnlineExamAnswerFeedback,
  getOnlineExamTimerResult,
  getOnlineExamTimerStatus,
  type OnlineExamTimerSession,
  type OnlineExamTimerResultAttempt,
} from "@/lib/supabase/sync"
import { TeacherSignature } from "@/components/teacher-signature"
import { onlineExamDurationMinutes, remainingExamSeconds, elapsedExamSeconds, type OnlineExamClock } from "@/lib/online-exam-clock"
import { TEACHER_NAME } from "@/lib/branding"
import { getPortalSession } from "@/lib/student-accounts"
import {
  examAvailability,
  attemptsStatus,
  examAccessMode,
  guestGroupsForGrade,
  isExamGradeSelectable,
  validateGuestIdentity,
  attemptNeedsResultRelease,
  effectiveAttemptScore,
  type GuestIdentity,
} from "@/lib/portal-content"
import { adoptedAttemptOf } from "@/lib/data-storage"
import { ExamReviewDialog } from "@/components/exam-review-dialog"
import { decodeSealForReview } from "@/lib/exam-public"
import {
  ARABIC_ORDINALS,
  getQuestionHeader,
  getQuestionTypeMeta,
  renderCompleteParts,
  getUnderlinedWords,
} from "@/lib/exam-templates"

type Step = "load" | "missing" | "identify" | "exam" | "result" | "closed"

type ExamStartIdentity = {
  studentId?: string
  studentName: string
  phone?: string
  gradeId: string
  groupId: string
}

function formatTime(totalSeconds: number) {
  const m = Math.max(0, Math.floor(totalSeconds / 60))
  const s = Math.max(0, totalSeconds % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/** معرّف محلي قصير للجلسة؛ سر الجلسة الحقيقي ينشئه الخادم ولا يعتمد على هذا المعرف. */
function newExamNonce(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}

/** تُستخدم أرقام الخادم كمصدر الحقيقة حتى لو كانت نسخة السؤال خالية من المفتاح. */
function gradeFromServerAttempt(
  exam: Exam,
  answers: Record<string, ExamAttemptAnswer>,
  server: Partial<ExamAttempt>,
  feedback: Record<string, { choiceId?: string; text?: string; isTrue?: boolean }>
): ReturnType<typeof gradeExam> {
  const local = Object.keys(feedback).length > 0
    ? gradeExam(withServerFeedback(exam, feedback), answers)
    : gradeExam(exam, answers)
  const score = typeof server.autoScore === "number" ? server.autoScore
    : typeof server.score === "number" ? server.score : local.score
  const autoTotal = typeof server.autoTotal === "number" ? server.autoTotal : local.autoTotal
  const manualTotal = typeof server.manualTotal === "number" ? server.manualTotal : local.manualTotal
  return {
    ...local,
    score,
    autoTotal,
    manualTotal,
    percent: autoTotal > 0 ? (score / autoTotal) * 100 : 0,
  }
}

export default function TakeExamPage() {
  const params = useParams<{ id: string }>()
  // تغيير الرابط ينشئ مكوّناً جديداً: لا تنتقل إجابات/مؤقت/نتيجة بين اختبارين.
  return <ExamSessionPage key={params?.id} examId={params?.id} />
}

function ExamSessionPage({ examId }: { examId?: string }) {
  const [step, setStep] = useState<Step>("load")
  const [exam, setExam] = useState<Exam | null>(null)
  const [grades, setGrades] = useState<Grade[]>([])

  const [studentName, setStudentName] = useState(() => {
    if (typeof window === "undefined") return ""
    return getPortalSession()?.name || ""
  })
  const [gradeId, setGradeId] = useState("")
  const [groupId, setGroupId] = useState("")
  const [answers, setAnswers] = useState<Record<string, ExamAttemptAnswer>>({})
  // عرض سؤال واحد في كل مرة — مؤشر السؤال الفرعي الحالي
  const [cursor, setCursor] = useState(0)
  const [startedAt, setStartedAt] = useState("")
  const [remaining, setRemaining] = useState(0)
  const [result, setResult] = useState<ReturnType<typeof gradeExam> | null>(null)
  const [autoSubmitted, setAutoSubmitted] = useState(false)
  const [answerVisibility, setAnswerVisibility] = useState<'never' | 'afterEach' | 'atEnd'>("never")
  const [closedReason, setClosedReason] = useState("")
  const [honored, setHonored] = useState(false)
  // بيانات الطالب من جلسة الدخول — هوية تلقائية في اختبارات الأعضاء (لا اختيار اسم)
  const [portalStudent, setPortalStudent] = useState<{ id: string; name: string; gradeId: string; groupId: string } | null>(null)
  // ===== من يفتح الاختبار: members (الأعضاء فقط) أو public (مفتوح للجميع بلا تسجيل) =====
  const [accessMode, setAccessMode] = useState<ExamAccessMode>("members")
  // بيانات الزائر في الاختبار المفتوح للجميع: الاسم والهاتف إجباريان،
  // والصف ثابت من إعداد المعلم، والمجموعة من قائمة مجموعات صفه المتاحة فقط
  const [guestName, setGuestName] = useState(() => {
    if (typeof window === "undefined") return ""
    return getPortalSession()?.name || ""
  })
  const [guestPhone, setGuestPhone] = useState("")
  const [guestGradeId, setGuestGradeId] = useState("")
  const [guestGroupId, setGuestGroupId] = useState("")
  const [guestIdentity, setGuestIdentity] = useState<GuestIdentity | null>(null)
  const [entryError, setEntryError] = useState("")
  const [starting, setStarting] = useState(false)
  const [serverTimerActive, setServerTimerActive] = useState(false)
  // يزيد عند وصول مفتاح تغذية راجعة مصرح به من الخادم ليعاد رسم النص تحت السؤال.
  const [feedbackVersion, setFeedbackVersion] = useState(0)
  const [submissionError, setSubmissionError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [syncError, setSyncError] = useState("")
  /** مسجَّل الدخول لكن الاختبار المفتوح للجميع ليس لصفه → يدخل كزائر */
  const [memberOtherGrade, setMemberOtherGrade] = useState(false)
  // نتائج المحاولات السابقة المستعادة من كوكي أسرار الجلسات على هذا الجهاز
  // (زائراً كان أو عضواً) — اطلاع بالقراءة فقط، بلا بدء جلسة وبلا استهلاك محاولة.
  const [previousAttempts, setPreviousAttempts] = useState<OnlineExamTimerResultAttempt[]>([])
  const [reviewPrevAttempt, setReviewPrevAttempt] = useState<OnlineExamTimerResultAttempt | null>(null)
  const submittedRef = React.useRef(false)
  // المراجع تمنع أن يلتقط مؤقت الخلفية نسخة قديمة من إجابات الطالب عند انتهاء الوقت.
  const answersRef = React.useRef<Record<string, ExamAttemptAnswer>>({})
  const startedAtRef = React.useRef("")
  const clockRef = React.useRef<OnlineExamClock | null>(null)
  const mountedRef = React.useRef(true)
  const previousRequestRef = React.useRef(0)
  const nextTimerSubmitRef = React.useRef(0)
  const lastSubmitReasonRef = React.useRef<"manual" | "timer">("manual")
  const progressInFlightRef = React.useRef<Promise<void> | null>(null)
  const progressQueuedRef = React.useRef(false)
  const statusInFlightRef = React.useRef(false)
  const syncServerClockRef = React.useRef<() => Promise<void>>(async () => undefined)
  const timerSessionRef = React.useRef<OnlineExamTimerSession | null>(null)
  const examIdentityRef = React.useRef<ExamStartIdentity | null>(null)
  const progressSaveTimerRef = React.useRef<number | null>(null)
  const flushServerProgressRef = React.useRef<() => Promise<unknown>>(async () => undefined)
  const finishExamRef = React.useRef<((reason?: "manual" | "timer") => Promise<void>) | null>(null)
  const sealRef = React.useRef("")
  const specRef = React.useRef<Record<string, { choiceId?: string; text?: string; isTrue?: boolean }>>({})

  /**
   * يستعيد نتائج محاولات هذا الاختبار التي نفّذها هذا الجهاز سابقاً، عبر أسرار
   * الجلسات المحفوظة في كوكي فقط — لا يقرأ أي جدول عام ولا يبدأ جلسة جديدة
   * ولا يستهلك محاولات. ما يظهر يحكمه البواب الآمن للخادم (الإجابة مملوكة
   * لصاحبها، والتصحيح اليدوي لا يُكشف قبل إطلاق النتيجة). محاولة الحساب
   * تتطلب دخول صاحبها؛ قدرة الزائر مسموحة في الاختبار العام فقط. نفرض ذلك
   * هنا للعرض، وفي RPC أيضاً حتى لا تتسرب البيانات في استجابة الشبكة.
   */
  const restorePreviousAttempts = async (targetExamId: string, isPublicExam: boolean) => {
    const request = ++previousRequestRef.current
    setPreviousAttempts([])
    setReviewPrevAttempt(null)
    const viewer = getPortalSession()
    try {
      const remembered = getRememberedOnlineExamResultSessions()
      if (remembered.length === 0) return
      const results = await Promise.all(remembered.map(saved => getOnlineExamTimerResult(saved, viewer?.token)))
      const currentViewer = getPortalSession()
      // الخروج/تبديل الحساب أو الرابط أثناء الطلب يلغي الرد كله، لا فلتره فقط.
      if (!mountedRef.current || request !== previousRequestRef.current
        || viewer?.studentId !== currentViewer?.studentId || viewer?.token !== currentViewer?.token) return
      const mine = results
        .filter((r): r is typeof r & { attempt: OnlineExamTimerResultAttempt } =>
          r.ok && r.state === "submitted" && !!r.attempt && r.attempt.examId === targetExamId
        )
        .map(r => r.attempt)
        .filter(attempt => attempt.studentId ? attempt.studentId === currentViewer?.studentId : isPublicExam)
      mine.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""))
      setPreviousAttempts(mine)
    } catch {
      // تعذر الاسترجاع (شبكة/كوكي) لا يعطّل رحلة بدء الاختبار
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (progressSaveTimerRef.current) window.clearTimeout(progressSaveTimerRef.current)
      progressQueuedRef.current = false
      timerSessionRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      let found = getExams().find(e => e.id === examId) || null
      let nextGrades = getGrades()
      let nextStudents = getStudents()

      const publicData = await fetchPublicData().catch(() => null)
      if (cancelled) return
      if (publicData) {
        // في البيئة السحابية تكون هذه النسخة من RPC المنقّى، فتتقدم على أي
        // ذاكرة قديمة ربما احتوت مفاتيح التصحيح من شاشة معلم سابقة.
        const safeExam = publicData.exams.find(e => e.id === examId) || null
        // عند اتصال Supabase وفشل RPC 015 لا نستعمل نسخة محلية خام ولا نفتح
        // الاختبار، حتى لا نرجع إلى تصحيح/توقيت قابلين للتلاعب.
        // وجود استجابة RPC سليمة يعني أن قائمتها هي المصدر الحصري؛ عدم
        // العثور على المعرف فيها لا يبرر الرجوع إلى نسخة محلية خام.
        found = publicData.examsAvailable ? safeExam : null
        if (nextGrades.length === 0) {
          nextGrades = publicData.grades.map(g => ({
            id: g.id,
            name: g.name,
            academicYear: "",
            createdAt: "",
            groups: publicData.groups
              .filter(gr => gr.gradeId === g.id)
              .map(gr => ({
                id: gr.id,
                name: gr.name,
                days: [] as string[],
                startTime: "",
                endTime: "",
                monthlyFee: 0,
                studentsCount: 0,
              })),
          }))
        }
      } else if (isSupabaseConfigured()) {
        // متغيرات السحابة موجودة لكن الاتصال/RPC لم ينجح؛ لا نعرض نسخة خام.
        found = null
      }

      // جلسة الطالب: الهوية تلقائية — لا اختيار اسم إطلاقاً
      const portal = getPortalSession()
      // بيانات الطالب من جهازه، أو بسرّ جلسته من السحابة (دخول من جهاز جديد).
      // لا نقرأ جدول students الخام: القراءة العامة مغلقة في المخطط المحصَّن.
      let me = portal ? nextStudents.find(s => s.id === portal.studentId) || undefined : undefined
      if (portal && !me) {
        const remote = await fetchStudentSelfRecord(portal.token || "").catch(() => null)
        if (cancelled) return
        if (remote) {
          me = remote as Student
          nextStudents = [...nextStudents.filter(s => s.id !== me!.id), me]
        }
      }
      if (portal) {
        setStudentName(me?.name || portal.name)
        setGuestName(prev => prev || me?.name || portal.name)
      }

      if (found) {
        const mode = examAccessMode(found)
        setAccessMode(mode)

        // الاختبار المفتوح للجميع يستضيف الأعضاء أيضاً: طالب مسجَّل الدخول
        // واختبار لصفه → هويته تلقائية من حسابه (بلا أي إدخال)، وإلا دخل كزائر
        const asMember =
          mode === "members" || !me || !found.gradeId || found.gradeId === me.gradeId

        // اختبار الأعضاء: عزل تام حسب الصف والمجموعة — لا يفتح اختباراً ليس له
        if (mode === "members" && me) {
          if (found.gradeId && found.gradeId !== me.gradeId) {
            setStep("missing")
            setGrades(nextGrades)
            return
          }
          const targets = found.targetGroupIds || []
          if (targets.length > 0 && !targets.includes(me.groupId)) {
            setStep("missing")
            setGrades(nextGrades)
            return
          }
        }

        // الإغلاق يمنع الأداء الجديد فقط — لا يمنع الاطلاع على نتائج سابقة لهذا
        // الجهاز (تصحيح المعلم واعتماده يكتملان غالباً بعد إغلاق النافذة الزمنية).
        const markClosed = (reason: string) => {
          setClosedReason(reason)
          setExam(sealExamForStudent(found).view)
          void restorePreviousAttempts(found.id, mode === "public")
          setStep("closed")
          setGrades(nextGrades)
        }

        // بوابة الإتاحة الزمنية (تسري على الأعضاء والزوار معاً)
        const availabilityClock = publicData?.examServerClock
        const availabilityNow = availabilityClock
          ? new Date(availabilityClock.serverNow + Math.max(0, performance.now() - availabilityClock.receivedAt))
          : undefined
        const av = examAvailability(found, availabilityNow)
        if (!av.open) {
          markClosed(av.reason || "الاختبار مغلق حالياً")
          return
        }

        // تعرض الواجهة ما تعرفه من محاولات هذا التبويب، أما الحد القاطع (حتى
        // عبر الأجهزة والطلبات المتزامنة) فيفحصه الخادم عند إنشاء الجلسة.
        if (portal && me && asMember) {
          const at = attemptsStatus(found, getExamAttempts(), portal.studentId)
          if (!at.allowed) {
            markClosed(at.reason || "استُنفدت محاولاتك لهذا الاختبار")
            return
          }
        }

        const sealed = sealExamForStudent(found)
        sealRef.current = sealed.token
        setAnswerVisibility(found.answerVisibility || "never")
        setExam(sealed.view)

        setMemberOtherGrade(!!(portal && me && !asMember))
        if (portal && me && asMember) {
          // هوية العضو: الاسم والصف والمجموعة من حسابه — لا يملأ شيئاً بنفسه
          setPortalStudent({
            id: portal.studentId,
            name: me.name || portal.name,
            gradeId: me.gradeId || found.gradeId || "",
            groupId: me.groupId || "",
          })
          setGradeId(me.gradeId || found.gradeId || "")
          setGroupId(me.groupId || "")
        } else {
          // زائر في اختبار مفتوح للجميع: الصف محدد مسبقاً من المعلم، والمجموعة يختارها
          setPortalStudent(null)
          setGradeId(found.gradeId || "")
          setGuestGradeId(found.gradeId || "")
          setGroupId("")
          setGuestGroupId("")
        }
      } else {
        setExam(null)
      }
      setGrades(nextGrades)
      if (!found || !isOnlineExam(found) || !found.allowOnline) {
        setStep("missing")
      } else {
        setStep("identify")
        // بالتوازي مع نموذج البدء: استرجاع نتائج هذا الجهاز السابقة للاطلاع عليها
        void restorePreviousAttempts(found.id, examAccessMode(found) === "public")
      }
    }
    void load()
    return () => { cancelled = true }
  }, [examId])

  // الكوكي قد يتغير من تبويب آخر. عند العودة لا نبقي نتيجة للحساب السابق.
  useEffect(() => {
    if (!exam || (step !== "identify" && step !== "closed")) return
    const refresh = () => {
      if (document.visibilityState !== "hidden") void restorePreviousAttempts(exam.id, examAccessMode(exam) === "public")
    }
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [exam, step])

  const groups = getGroupsOfGrade(grades, gradeId)

  // ===== الاختبار المفتوح للجميع: خيارات الزائر =====
  /** الصف: ثابت من الاختبار، ويُختار فقط إذا كان الاختبار عاماً (بلا صف) */
  const gradeSelectable = exam ? isExamGradeSelectable(exam) : false
  /** المجموعات المتاحة لصفه في هذا الاختبار فقط (المستهدفة إن حُدِّدت) */
  const guestGroups = exam
    ? guestGroupsForGrade(exam, grades, guestGradeId || exam.gradeId || "")
    : []

  /**
   * بدء العدّاد من موعد نهائي ثابت. عند وجود Supabase لا يبدأ الاختبار إلا بعد
   * أن ينشئ الخادم الجلسة؛ وهذا يمنع تغيير ساعة الجهاز للحصول على وقت إضافي.
   */
  const beginExam = async (identity: ExamStartIdentity): Promise<boolean> => {
    if (!exam) return false
    setEntryError("")
    const requestedMinutes = onlineExamDurationMinutes(exam.duration)
    let started = new Date().toISOString()
    let clock: OnlineExamClock = {
      deadline: performance.now() + requestedMinutes * 60000,
      durationMs: requestedMinutes * 60000,
      serverTime: 0,
    }
    const sessionId = newExamNonce("session")
    const attemptId = newExamNonce(`attempt-${exam.id}`)

    const serverStart = await startOnlineExamTimerSession({
      sessionId,
      attemptId,
      examId: exam.id,
      studentId: identity.studentId,
      studentToken: identity.studentId ? getPortalSession()?.token : undefined,
      studentName: identity.studentName,
      phone: identity.phone,
      gradeId: identity.gradeId,
      groupId: identity.groupId,
    })
    if (!mountedRef.current) return false
    if (serverStart.configured && !serverStart.session) {
      setEntryError(`لا يمكن بدء الاختبار بأمان الآن: ${serverStart.error || "تحقق من اتصال الخادم وترحيل جلسات الاختبار"}`)
      return false
    }
    if (serverStart.session) {
      const serverStartedAt = Date.parse(serverStart.session.startedAt)
      const serverExpiresAt = Date.parse(serverStart.session.expiresAt)
      if (!Number.isFinite(serverStartedAt) || !Number.isFinite(serverExpiresAt) || serverExpiresAt <= serverStartedAt) {
        setEntryError("تعذر التحقق من وقت جلسة الاختبار")
        return false
      }
      timerSessionRef.current = serverStart.session
      // يحتفظ المتصفح بسر عشوائي للجلسة فقط، حتى يستطيع الطالب رؤية نتيجته
      // المفرج عنها لاحقاً من RPC المقيد من دون فتح جدول المحاولات للزوار.
      rememberOnlineExamResultSession(serverStart.session)
      started = serverStart.session.startedAt
      clock = serverStart.session.clock
      setServerTimerActive(true)
    } else {
      // بيئة تطوير بلا Supabase فقط: يبقى عداد الواجهة مفيداً للاختبارات المحلية.
      timerSessionRef.current = null
      setServerTimerActive(false)
    }

    // وضع «بعد الإجابة على السؤال»: لا يظهر إلا مفتاح الأسئلة الموضوعية.
    if (answerVisibility === "afterEach" && sealRef.current) {
      specRef.current = decodeSealForReview(sealRef.current, exam.id)
    }
    submittedRef.current = false
    answersRef.current = {}
    examIdentityRef.current = identity
    startedAtRef.current = started
    clockRef.current = clock
    nextTimerSubmitRef.current = 0
    setAnswers({})
    setResult(null)
    setSubmissionError("")
    setAutoSubmitted(false)
    setStartedAt(started)
    setRemaining(remainingExamSeconds(clock, performance.now()))
    setCursor(0)
    setStep("exam")
    return true
  }

  const startExam = async () => {
    if (!exam || starting) return
    setEntryError("")

    // 1) الأعضاء المسجَّلون: الهوية (الاسم/الصف/المجموعة) من الحساب تلقائياً — بلا أي إدخال
    if (portalStudent) {
      if (!gradeId || !groupId) {
        setEntryError("لم يتم تحديد صفك ومجموعتك — أكمل بياناتك من إعدادات حسابك أو راجع المعلم")
        return
      }
      setStarting(true)
      try {
        await beginExam({ studentId: portalStudent.id, studentName: portalStudent.name, gradeId, groupId })
      } catch {
        setEntryError("تعذر بدء جلسة الاختبار — تحقق من الاتصال وأعد المحاولة")
      } finally {
        if (mountedRef.current) setStarting(false)
      }
      return
    }

    // 2) اختبار الأعضاء وزائر بلا حساب → بوابة تسجيل الدخول
    if (accessMode !== "public") {
      setEntryError("هذا الاختبار للطلاب المسجلين فقط — سجّل الدخول لبدء الاختبار")
      return
    }

    // 3) مفتوح للجميع: الاسم ورقم الهاتف إجباريان، والمجموعة من مجموعات صفه المتاحة
    const check = validateGuestIdentity(exam, grades, {
      name: guestName,
      phone: guestPhone,
      gradeId: guestGradeId,
      groupId: guestGroupId,
    })
    if (!check.ok) {
      setEntryError(check.error)
      return
    }

    // فحص سريع للمحاولات الموجودة في الذاكرة. أما الحد النهائي (وعبر الأجهزة)
    // فيحسمه start_online_exam_session داخل الخادم، لا قراءة جدول المحاولات الخام.
    const at = attemptsStatus(
      exam,
      getExamAttempts(),
      undefined,
      check.identity.name,
      check.identity.groupId,
      0
    )
    if (!at.allowed) {
      setEntryError(at.reason || "استُنفدت محاولاتك لهذا الاختبار")
      return
    }

    setGuestIdentity(check.identity)
    setStudentName(check.identity.name)
    setGradeId(check.identity.gradeId)
    setGroupId(check.identity.groupId)
    setStarting(true)
    try {
      await beginExam({
        studentName: check.identity.name, phone: check.identity.phone,
        gradeId: check.identity.gradeId, groupId: check.identity.groupId,
      })
    } catch {
      setEntryError("تعذر بدء جلسة الاختبار — تحقق من الاتصال وأعد المحاولة")
    } finally {
      if (mountedRef.current) setStarting(false)
    }
  }

  /** يطلب مفاتيح الإجابات التي يسمح إعداد الظهور لهذه الجلسة بعرضها فقط. */
  const refreshServerAnswerFeedback = async () => {
    const session = timerSessionRef.current
    if (!session || answerVisibility === "never") return false
    const feedback = await getOnlineExamAnswerFeedback(session, getPortalSession()?.token)
    if (!mountedRef.current || session !== timerSessionRef.current) return false
    if (!feedback.ok || !feedback.answers) return false
    specRef.current = feedback.answers
    setFeedbackVersion(previous => previous + 1)
    return true
  }

  const applyServerClock = (clock?: OnlineExamClock) => {
    if (!clock || !mountedRef.current || clock.serverTime < (clockRef.current?.serverTime || 0)) return
    clockRef.current = clock
    setRemaining(remainingExamSeconds(clock, performance.now()))
  }

  // تسلسل الرفع + قراءة أحدث الإجابات عند الإرسال، لا لقطة debounce قديمة.
  // يمنع رد حفظ بطيء من إعادة إجابة أقدم فوق الأحدث، ويحدّ عدد الطلبات المتوازية.
  const flushServerProgress = (): Promise<void> => {
    if (!timerSessionRef.current || submittedRef.current) return Promise.resolve()
    progressQueuedRef.current = true
    if (progressInFlightRef.current) return progressInFlightRef.current
    const session = timerSessionRef.current
    const upload = async () => {
      try {
        do {
          progressQueuedRef.current = false
          const saved = await saveOnlineExamTimerProgress(session, answersRef.current)
          if (!mountedRef.current || session !== timerSessionRef.current) return
          applyServerClock(saved.clock)
          if (saved.state === "saved") {
            setSyncError("")
            if (answerVisibility === "afterEach") void refreshServerAnswerFeedback()
          } else if (saved.state === "expired" || saved.state === "submitted") {
            void finishExamRef.current?.("timer")
          } else {
            setSyncError("تعذر حفظ آخر الإجابات في الخادم. تحقق من الاتصال ولا تغلق الصفحة؛ سنعيد المحاولة.")
          }
        } while (progressQueuedRef.current && !submittedRef.current)
      } finally {
        progressInFlightRef.current = null
      }
    }
    progressInFlightRef.current = upload()
    return progressInFlightRef.current
  }
  flushServerProgressRef.current = flushServerProgress

  const syncServerClock = async () => {
    const session = timerSessionRef.current
    if (!session || submittedRef.current || statusInFlightRef.current) return
    statusInFlightRef.current = true
    try {
      const status = await getOnlineExamTimerStatus(session)
      if (!mountedRef.current || session !== timerSessionRef.current || submittedRef.current) return
      if (!status.ok) {
        setSyncError("تعذر التحقق من وقت الخادم. تحقق من الاتصال ولا تغلق الصفحة.")
        return
      }
      applyServerClock(status.clock)
      if (status.state === "expired" || status.state === "submitted") void finishExamRef.current?.("timer")
    } finally {
      statusInFlightRef.current = false
    }
  }
  syncServerClockRef.current = syncServerClock

  const queueServerProgressSave = () => {
    if (!timerSessionRef.current) return
    if (progressSaveTimerRef.current) window.clearTimeout(progressSaveTimerRef.current)
    progressSaveTimerRef.current = window.setTimeout(() => {
      progressSaveTimerRef.current = null
      void flushServerProgressRef.current()
    }, 450)
  }

  const setAnswer = (id: string, patch: ExamAttemptAnswer) => {
    if (submittedRef.current || remainingExamSeconds(clockRef.current, performance.now()) <= 0) return
    const next = { ...answersRef.current, [id]: { ...answersRef.current[id], ...patch } }
    answersRef.current = next
    setAnswers(next)
    queueServerProgressSave()
  }

  const finishExam = async (reason: "manual" | "timer" = "manual") => {
    if (!mountedRef.current || !exam || step !== "exam" || submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    lastSubmitReasonRef.current = reason
    setSubmissionError("")
    try {
      // الصفر المحلي لا يعني انتهاء جلسة خادم؛ له بوابة مستقلة في RPC التسليم.
      const timedOut = !timerSessionRef.current && remainingExamSeconds(clockRef.current, performance.now()) <= 0

      // التصحيح الآلي لا يشمل المقال في الأنماط الجديدة؛ تبقى درجة المقال صفراً حتى مراجعة المعلم.
      const submittedAnswers = answersRef.current
      let finalAnswers = submittedAnswers
      let graded = sealRef.current
        ? gradeSealedExam(exam, sealRef.current, finalAnswers)
        : gradeExam(exam, finalAnswers)
      const identity = examIdentityRef.current || {
        studentId: portalStudent?.id,
        studentName: (portalStudent?.name || guestIdentity?.name || studentName).trim(),
        phone: portalStudent ? undefined : guestIdentity?.phone,
        gradeId,
        groupId,
      }
      const activeTimerSession = timerSessionRef.current
      const totalMarks = Math.round((graded.autoTotal + graded.manualTotal) * 100) / 100
      let attempt: ExamAttempt = {
        id: activeTimerSession?.attemptId || newExamNonce(`attempt-${exam.id}`),
        examId: exam.id,
        studentId: identity.studentId,
        studentName: identity.studentName,
        phone: identity.phone,
        groupId: identity.groupId,
        gradeId: identity.gradeId,
        answers: finalAnswers,
        // يبقى score مرادفاً للجزء الآلي للتوافق مع السجلات والتقارير القديمة.
        score: graded.score,
        totalMarks,
        autoScore: graded.score,
        autoTotal: graded.autoTotal,
        manualScore: 0,
        manualTotal: graded.manualTotal,
        gradingStatus: graded.manualTotal > 0 ? "pending_review" : "reviewed",
        startedAt: startedAtRef.current || startedAt || new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        // لا نمنح وقتاً إضافياً لو عاد المتصفح من الخلفية بعد الموعد النهائي.
        durationSeconds: clockRef.current ? elapsedExamSeconds(clockRef.current, performance.now()) : 0,
        timedOut,
      }

      if (activeTimerSession) {
        if (progressSaveTimerRef.current) {
          window.clearTimeout(progressSaveTimerRef.current)
          progressSaveTimerRef.current = null
        }
        const serverSubmission = await submitOnlineExamTimerSession(activeTimerSession, submittedAnswers, {
          onlyIfExpired: reason === "timer", studentToken: getPortalSession()?.token,
        })
        if (!mountedRef.current || activeTimerSession !== timerSessionRef.current) return
        if (serverSubmission.ok && serverSubmission.state === "in_progress") {
          applyServerClock(serverSubmission.clock)
          submittedRef.current = false
          // التقدير سبق الخادم (مثلاً بسبب بطء الشبكة): لا إغلاق ولا نتيجة كاذبة.
          return
        }
        if (!serverSubmission.ok || !serverSubmission.attempt) {
          // لا نلجأ إلى إدراج مباشر عند وجود جلسة خادم: ذلك سيلتف على ساعة الخادم.
          submittedRef.current = false
          setSubmissionError(serverSubmission.error || "لم يؤكد الخادم تسليم إجاباتك")
          // تبقى الورقة وإجاباتها أمام الطالب. الفشل ليس تسليماً ولا نتيجة.
          nextTimerSubmitRef.current = performance.now() + 5000
          return
        }
        const remote = serverSubmission.attempt as Partial<ExamAttempt>
        finalAnswers = remote.answers && typeof remote.answers === "object"
          ? remote.answers as Record<string, ExamAttemptAnswer>
          : submittedAnswers
        // عند انتهاء الوقت قد يستعمل الخادم آخر لقطة قبلها؛ اعرض هذه اللقطة
        // الفعلية في شاشة النتيجة ولا تعرض إجابة محلية لم تُقبل.
        answersRef.current = finalAnswers
        setAnswers(finalAnswers)
        // عند «في نهاية الاختبار» لا تصل المفاتيح إلا الآن وبعد تسليم الخادم.
        if (answerVisibility === "atEnd") await refreshServerAnswerFeedback()
        if (!mountedRef.current || activeTimerSession !== timerSessionRef.current) return
        graded = gradeFromServerAttempt(exam, finalAnswers, remote, specRef.current)
        attempt = {
          ...attempt,
          ...remote,
          id: typeof remote.id === "string" ? remote.id : attempt.id,
          examId: typeof remote.examId === "string" ? remote.examId : attempt.examId,
          studentId: typeof remote.studentId === "string" ? remote.studentId : undefined,
          studentName: typeof remote.studentName === "string" ? remote.studentName : attempt.studentName,
          phone: typeof remote.phone === "string" ? remote.phone : undefined,
          groupId: typeof remote.groupId === "string" ? remote.groupId : attempt.groupId,
          gradeId: typeof remote.gradeId === "string" ? remote.gradeId : attempt.gradeId,
          answers: finalAnswers,
          answerFeedback: Object.keys(specRef.current).length > 0 ? { ...specRef.current } : undefined,
          score: typeof remote.score === "number" ? remote.score : graded.score,
          totalMarks: typeof remote.totalMarks === "number" ? remote.totalMarks : Math.round((graded.autoTotal + graded.manualTotal) * 100) / 100,
          autoScore: typeof remote.autoScore === "number" ? remote.autoScore : graded.score,
          autoTotal: typeof remote.autoTotal === "number" ? remote.autoTotal : graded.autoTotal,
          manualScore: typeof remote.manualScore === "number" ? remote.manualScore : 0,
          manualTotal: typeof remote.manualTotal === "number" ? remote.manualTotal : graded.manualTotal,
          gradingStatus: remote.gradingStatus === "pending_review" || remote.gradingStatus === "reviewed"
            ? remote.gradingStatus
            : graded.manualTotal > 0 ? "pending_review" : "reviewed",
          startedAt: typeof remote.startedAt === "string" ? remote.startedAt : attempt.startedAt,
          submittedAt: typeof remote.submittedAt === "string" ? remote.submittedAt : attempt.submittedAt,
          durationSeconds: typeof remote.durationSeconds === "number" ? remote.durationSeconds : attempt.durationSeconds,
          timedOut: serverSubmission.timedOut === true,
        }
        setAutoSubmitted(serverSubmission.timedOut === true)
      }

      if (!activeTimerSession) setAutoSubmitted(timedOut)
      setResult(graded)
      setSubmissionError("")
      const all = [...getExamAttempts().filter(existing => existing.id !== attempt.id), attempt]
      // إذا أنشأ الخادم المحاولة، نحدّث ذاكرة التبويب للعرض فقط ولا نعيد إدراجها كزائر.
      saveExamAttempts(all, activeTimerSession ? { sync: false } : undefined)

      // لا تدخل المحاولة المختلطة أو المقالية لوحة الشرف قبل اكتمال التصحيح اليدوي وإطلاق النتيجة.
      const honorScore = attempt.autoScore ?? graded.score
      const honorTotal = attempt.autoTotal ?? graded.autoTotal
      const canPromote = graded.manualTotal === 0 &&
        shouldPromoteToHonor(exam, {
          autoTotal: honorTotal,
          percent: honorTotal > 0 ? (honorScore / honorTotal) * 100 : 0,
        })
      if (canPromote) {
        const honoree = maybeAutoHonor({
          exam,
          studentName: attempt.studentName,
          groupId: attempt.groupId,
          studentId: attempt.studentId,
          score: honorScore,
          totalMarks: honorTotal,
          sync: false,
        })
        if (honoree) {
          setHonored(true)
          submitPublicHonoree(honoree).catch(() => {})
        }
      }
      setStep("result")
    } catch {
      submittedRef.current = false
      if (mountedRef.current) setSubmissionError("تعذر تأكيد التسليم — إجاباتك باقية في هذه الصفحة، أعد المحاولة")
      nextTimerSubmitRef.current = performance.now() + 5000
    } finally {
      if (mountedRef.current) setSubmitting(false)
    }
  }

  // لا يعتمد المؤقت على نسخة قديمة من finishExam أو answers عند وضع المتصفح في الخلفية.
  finishExamRef.current = finishExam

  useEffect(() => {
    if (step !== "exam") return
    const tick = () => {
      const now = performance.now()
      const next = remainingExamSeconds(clockRef.current, now)
      setRemaining(next)
      if (next <= 0 && now >= nextTimerSubmitRef.current && !submittedRef.current) {
        nextTimerSubmitRef.current = now + 5000
        void finishExamRef.current?.("timer")
      }
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [step])

  // لا إغلاق عند مغادرة التبويب. نحفظ قبل الخلفية ونعيد المزامنة عند العودة/
  // استيقاظ الهاتف أو عودة الإنترنت؛ نبضة دورية تمنع تجويع الحفظ عند كتابة مقال.
  useEffect(() => {
    if (step !== "exam") return
    const flush = () => { void flushServerProgressRef.current() }
    const resume = () => { void syncServerClockRef.current(); flush() }
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush()
      else resume()
    }
    // رد الحفظ يحمل الساعة أيضاً؛ لا نضاعف RPC بنبضة حالة منفصلة كل مرة.
    const heartbeat = window.setInterval(flush, 15000)
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("pagehide", flush)
    window.addEventListener("pageshow", resume)
    window.addEventListener("online", resume)
    window.addEventListener("focus", resume)
    return () => {
      window.clearInterval(heartbeat)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("pagehide", flush)
      window.removeEventListener("pageshow", resume)
      window.removeEventListener("online", resume)
      window.removeEventListener("focus", resume)
    }
  }, [step])

  // نص الإجابة الصحيحة لسؤال فرعي (من المفتاح المفكوك — يُستخدم في afterEach/atEnd فقط)
  const correctAnswerLabel = (sqId: string, questionType: number, subQuestion?: { choices?: { id: string; choiceKey?: string; choiceText: string }[] }): string => {
    const spec = specRef.current[sqId]
    if (!spec) return ""
    if (questionType === 1) {
      const c = subQuestion?.choices?.find(x => x.id === spec.choiceId)
      return c ? `(${c.choiceKey || ""}) ${c.choiceText}` : ""
    }
    if (questionType === 3) return spec.isTrue === true ? "صح" : "خطأ"
    return spec.text || ""
  }

  /** هل السؤال الفرعي مُجاب عليه؟ */
  const isSubAnswered = (q: Question, sq: SubQuestion): boolean => {
    const a = answers[sq.id]
    if (!a) return false
    if (q.questionType === 1) return !!a.choiceId
    if (q.questionType === 3) return typeof a.isTrue === "boolean"
    return !!(a.text || "").trim()
  }

  /** رسم سؤال فرعي واحد بكل أنواعه + تغذية راجعة «بعد الإجابة» */
  const renderSubQuestion = (question: Question, sq: SubQuestion) => {
    const answeredNow = isSubAnswered(question, sq)
    // لا تُكشف إجابة نموذجية للمقال، حتى إن كتب المعلم مرجعاً داخلياً له؛
    // التعليق/التصحيح لا يظهران إلا بعد المراجعة والإطلاق الصريح.
    const canShowAutomaticFeedback = !exam?.onlineExamMode || isObjectiveQuestionType(question.questionType)
    const feedback = answerVisibility === "afterEach" && canShowAutomaticFeedback && answeredNow ? (() => {
      const gradedDetail = specRef.current[sq.id]
      if (!gradedDetail) return null
      let correct = false
      if (question.questionType === 1) correct = answers[sq.id].choiceId === gradedDetail.choiceId
      else if (question.questionType === 3) correct = answers[sq.id].isTrue === gradedDetail.isTrue
      else {
        const norm = (s?: string) => (s || "").trim().replace(/\s+/g, " ").toLowerCase()
        correct = norm(answers[sq.id].text) === norm(gradedDetail.text) && !!norm(gradedDetail.text)
      }
      const label = correctAnswerLabel(sq.id, question.questionType, sq)
      return { correct, label }
    })() : null

    return (
      <div className="border-t border-dashed pt-3 space-y-2">
        <p className="font-semibold">{sq.questionText}</p>

        {question.questionType === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sq.choices?.map(c => {
              const selected = answers[sq.id]?.choiceId === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setAnswer(sq.id, { choiceId: c.id })}
                  className={`text-right rounded-xl border px-3 py-2 ${
                    selected ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950" : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  {c.choiceKey}) {c.choiceText}
                </button>
              )
            })}
          </div>
        )}

        {question.questionType === 2 && (
          <div>
            <p className="text-sm text-gray-600 mb-2">
              {(() => {
                const { before, after, atEnd } = renderCompleteParts(sq)
                return atEnd ? `${before} ${after} ........` : `${before} ........ ${after}`
              })()}
            </p>
            <Input
              placeholder="أكمل الفراغ"
              value={answers[sq.id]?.text || ""}
              onChange={e => setAnswer(sq.id, { text: e.target.value })}
            />
          </div>
        )}

        {question.questionType === 3 && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant={answers[sq.id]?.isTrue === true ? "default" : "outline"}
              onClick={() => setAnswer(sq.id, { isTrue: true })}
            >
              صح
            </Button>
            <Button
              type="button"
              variant={answers[sq.id]?.isTrue === false ? "default" : "outline"}
              onClick={() => setAnswer(sq.id, { isTrue: false })}
            >
              خطأ
            </Button>
          </div>
        )}

        {(question.questionType === 4 || question.questionType === 5 || question.questionType === 6 || question.questionType === 7 || question.questionType === 8) && (
          <div>
            {question.questionType === 5 && (
              <p className="text-sm mb-2">
                {getUnderlinedWords(sq).map((w, i) => (
                  <span key={i}>
                    <span className={w.underlined ? "underline font-bold text-rose-600 dark:text-rose-400" : undefined}>{w.word}</span>
                    {i < getUnderlinedWords(sq).length - 1 ? " " : ""}
                  </span>
                ))}
              </p>
            )}
            <textarea
              rows={question.questionType === 5 ? 2 : (sq.answerLines || 1)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={
                question.questionType === 5
                  ? "التصحيح"
                  : question.questionType === 6
                  ? "اكتب المصطلح العلمي هنا"
                  : question.questionType === 7
                  ? "اكتب التعريف هنا"
                  : "إجابتك"
              }
              value={answers[sq.id]?.text || ""}
              onChange={e => setAnswer(sq.id, { text: e.target.value })}
            />
          </div>
        )}

        {feedback && (
          <div className={`rounded-xl border px-3 py-2 text-sm font-bold ${
            feedback.correct
              ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800 text-green-700 dark:text-green-300"
              : "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300"
          }`}>
            {feedback.correct ? "✅ إجابة صحيحة" : `❌ إجابة خاطئة — الإجابة الصحيحة: ${feedback.label}`}
          </div>
        )}
      </div>
    )
  }

  /**
   * بطاقة الاطلاع على المحاولات السابقة لهذا الجهاز — تظهر في شاشة البدء
   * (مع تلميح إعادة المحاولة) وفي شاشة الإغلاق (نتائج فقط؛ الأداء متوقف).
   * كل محاولة تُفتح للقراءة فقط عبر نافذة المراجعة نفسها وبقواعد الإطلاق ذاتها.
   */
  const renderPreviousAttemptsCard = (retryHint: boolean) => {
    if (previousAttempts.length === 0) return null
    const adoptedPrev = adoptedAttemptOf(previousAttempts)
    return (
      <div className="mb-6 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 sm:p-5 space-y-3 text-right">
        <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
          <History className="w-5 h-5 shrink-0" />
          <h3 className="font-extrabold">
            لديك {previousAttempts.length > 1 ? `${previousAttempts.length} محاولات سابقة` : "محاولة سابقة"} في هذا الاختبار على جهازك
          </h3>
        </div>
        <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80 leading-relaxed">
          يمكنك الاطلاع على نتيجتك وإجاباتك بالقراءة فقط — دون بدء محاولة جديدة ودون إمكانية تعديل أي إجابة مسلَّمة.
          {retryHint && " للمحاولة من جديد (إن تبقّت لك محاولات أو منحك المعلم محاولة إضافية) أكمل بياناتك بالأسفل وابدأ."}
        </p>
        <div className="space-y-2">
          {previousAttempts.map((attempt, index) => {
            const attemptNo = previousAttempts.length - index
            const pendingRelease = attemptNeedsResultRelease(attempt)
            const isAdopted = adoptedPrev?.id === attempt.id
            return (
              <div
                key={attempt.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 ${
                  isAdopted
                    ? "border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/20"
                    : "border-emerald-100 dark:border-emerald-900 bg-white/70 dark:bg-gray-900/60"
                }`}
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm text-gray-800 dark:text-gray-100 flex flex-wrap items-center gap-2">
                    المحاولة {attemptNo}
                    {attempt.submittedAt && (
                      <span className="text-[11px] font-normal text-gray-400">
                        {new Date(attempt.submittedAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    )}
                    {isAdopted && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 px-2 py-0.5 text-[11px] font-extrabold">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                        اعتمدها المعلم
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {pendingRelease ? (
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300">قيد مراجعة المعلم</span>
                  ) : (
                    <span className={`font-extrabold text-sm ${effectiveAttemptScore(attempt) >= (attempt.totalMarks || 1) * 0.5 ? "text-emerald-700 dark:text-emerald-300" : "text-red-600"}`} dir="ltr">
                      {effectiveAttemptScore(attempt)} / {attempt.totalMarks || 0}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-300 text-emerald-700 dark:text-emerald-300"
                    onClick={() => setReviewPrevAttempt(attempt)}
                  >
                    عرض النتيجة والإجابات
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (step === "load") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500" />
      </div>
    )
  }

  if (step === "closed") {
    const hasPrevResults = previousAttempts.length > 0
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6" dir="rtl">
        <div className={`w-full ${hasPrevResults ? "max-w-3xl" : "max-w-md"} space-y-4`}>
          <div className="text-center space-y-4">
            <Clock className="w-14 h-14 mx-auto text-amber-500" />
            <h1 className="text-2xl font-bold">الاختبار مغلق الآن</h1>
            <p className="text-gray-500">{closedReason || "لم يفت موعد هذا الاختبار بعد — تابع إعلانات المعلم"}</p>
            {/* الزائر في اختبار مفتوح للجميع يرجع للوحة الإعلانات، والعضو لبوابته */}
            {accessMode === "public" ? (
              <Link href="/"><Button variant="outline">الصفحة الرئيسية</Button></Link>
            ) : (
              <Link href="/student"><Button variant="outline">بوابة الطالب</Button></Link>
            )}
          </div>
          {/* الإغلاق يوقف الأداء الجديد ولا يحجب نتيجة سابقة: الاطلاع متاح دائماً */}
          {renderPreviousAttemptsCard(false)}
          {exam && reviewPrevAttempt && (
            <ExamReviewDialog
              open={!!reviewPrevAttempt}
              onOpenChange={(v) => { if (!v) setReviewPrevAttempt(null) }}
              exam={exam}
              attempts={[reviewPrevAttempt]}
              studentName={reviewPrevAttempt.studentName}
            />
          )}
          <TeacherSignature />
        </div>
      </div>
    )
  }

  if (step === "missing" || !exam) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="w-14 h-14 mx-auto text-rose-500" />
          <h1 className="text-2xl font-bold">الاختبار غير متاح</h1>
          <p className="text-gray-500">ربما لم يُنشر للطلاب بعد، أو انتهى رابطه.</p>
          <Link href="/"><Button variant="outline">العودة للصفحة الرئيسية</Button></Link>
          <TeacherSignature />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-arabic" dir="rtl">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold truncate">{exam.title}</h1>
              <p className="text-xs text-gray-500">
                {onlineExamDurationMinutes(exam.duration)} دقيقة
                {exam.totalMarks ? ` • ${exam.totalMarks} درجة` : ""}
              </p>
              <span
                className={`inline-flex items-center gap-1 mt-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  accessMode === "public"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                }`}
              >
                {accessMode === "public" ? (
                  <><Globe className="w-3 h-3" /> مفتوح للجميع — بدون تسجيل</>
                ) : (
                  <><Users className="w-3 h-3" /> للأعضاء المسجلين فقط</>
                )}
              </span>
            </div>
          </div>
          {step === "exam" && (
            <div
              className={`flex items-center gap-2 font-mono font-bold ${remaining < 60 ? "text-red-600" : "text-indigo-700"}`}
              title={serverTimerActive ? "وقت الاختبار مضبوط من الخادم" : "عداد الاختبار"}
            >
              <Clock className="w-5 h-5" />
              <span>{formatTime(remaining)}</span>
              {serverTimerActive && <span className="hidden sm:inline font-arabic text-[10px] text-emerald-600">محمي</span>}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* نتائج المحاولات السابقة على هذا الجهاز — اطلاع بلا استهلاك محاولة */}
        {step === "identify" && renderPreviousAttemptsCard(true)}

        {step === "identify" && !portalStudent && accessMode !== "public" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto">
              <UserX className="w-8 h-8 text-white" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">الاختبار متاح للطلاب المسجلين فقط</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                لضمان عدالة النتائج وتسجيل درجاتك في تقريرك، يجب تسجيل الدخول بحسابك قبل بدء الاختبار.
                <br />
                لا تملك حساباً؟ سجّل الآن وانتظر موافقة المعلم.
              </p>
            </div>
            <div className="space-y-3 max-w-sm mx-auto pt-2">
              <Button asChild className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 h-12 text-base">
                <Link href={`/student/login?next=${encodeURIComponent("/exam/" + examId)}`}>
                  <LogIn className="w-5 h-5 ml-2" />
                  تسجيل الدخول لبدء الاختبار
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full h-12 text-base">
                <Link href="/student/register">
                  <UserPlus className="w-5 h-5 ml-2" />
                  إنشاء حساب جديد
                </Link>
              </Button>
            </div>
            <p className="text-xs text-gray-400 pt-2">
              بعد تسجيل الدخول ستعود لهذا الاختبار تلقائياً وسيبدأ العدّ عند الضغط على «بدء الاختبار».
            </p>
          </div>
        )}

        {/* ===== الاختبار المفتوح للجميع: الزائر يُدخل اسمه وهاتفه ويختار مجموعته ===== */}
        {step === "identify" && !portalStudent && accessMode === "public" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5 text-white" />
              </span>
              <div>
                <h2 className="text-xl font-bold">اختبار مفتوح للجميع</h2>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                  بدون تسجيل دخول — أدخل بياناتك مرة واحدة ثم أجب عن الأسئلة
                </p>
              </div>
            </div>

            {/* عنوان الاختبار وصفه بخط كبير قبل البدء — تأكيد أنه الاختبار الصحيح */}
            <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30 px-4 py-3 text-center">
              <p className="text-lg sm:text-xl font-extrabold leading-snug text-gray-900 dark:text-white">
                {exam.title}
              </p>
              <p className="mt-1 text-base font-extrabold text-indigo-700 dark:text-indigo-300">
                {grades.find(g => g.id === (exam.gradeId || guestGradeId))?.name || "بلا صف محدد"}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                تأكد أن هذا اختبار صفك قبل البدء
              </p>
            </div>

            {memberOtherGrade && (
              <p className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                أنت مسجّل الدخول، لكن هذا الاختبار لصفٍّ غير صفك — لذلك تُسجَّل محاولتك بالبيانات التي تُدخلها هنا.
              </p>
            )}

            <div className="space-y-3">
              <div>
                <Label>الاسم الكامل *</Label>
                <Input
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="مثال: أحمد محمد علي"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>
                  رقم الهاتف * <span className="text-xs text-gray-400">(أرقام فقط بدون حروف)</span>
                </Label>
                <div className="relative mt-1">
                  <Input
                    dir="ltr"
                    type="tel"
                    value={guestPhone}
                    onChange={e => setGuestPhone(e.target.value)}
                    placeholder="01012345678"
                    className="pr-10"
                  />
                  <Phone className="w-4 h-4 text-gray-400 absolute top-1/2 right-3 -translate-y-1/2" />
                </div>
              </div>

              {/* الصف: إجباري ومحدد مسبقاً من المعلم — لا يختاره الزائر */}
              <div>
                <Label>الصف *</Label>
                {gradeSelectable ? (
                  <Select
                    value={guestGradeId}
                    onValueChange={val => { setGuestGradeId(val); setGuestGroupId("") }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="اختر صفك" />
                    </SelectTrigger>
                    <SelectContent>
                      {grades.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="mt-1 flex items-center gap-2 rounded-xl border-2 border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 px-4 py-3">
                    <GraduationCap className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="font-bold text-gray-900 dark:text-white">
                      {grades.find(g => g.id === (exam.gradeId || ""))?.name || "صف هذا الاختبار"}
                    </span>
                    <span className="mr-auto text-[11px] text-gray-500 shrink-0">محدد مسبقاً من المعلم</span>
                  </div>
                )}
              </div>

              {/* المجموعة: من مجموعات صفه المتاحة لهذا الاختبار فقط */}
              <div>
                <Label>
                  المجموعة *{" "}
                  <span className="text-xs text-gray-400">
                    ({guestGroups.length > 0 ? `المجموعات المتاحة لصفك في هذا الاختبار` : "لا توجد مجموعات متاحة"})
                  </span>
                </Label>
                <Select
                  value={guestGroupId}
                  disabled={guestGroups.length === 0}
                  onValueChange={val => setGuestGroupId(val)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue
                      placeholder={
                        gradeSelectable && !guestGradeId
                          ? "اختر الصف أولاً"
                          : guestGroups.length > 0
                          ? "اختر مجموعتك"
                          : "—"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {guestGroups.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                        {g.startTime ? ` (${g.startTime})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {entryError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm font-bold text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{entryError}</span>
              </div>
            )}

            <p className="text-xs text-gray-500">
              بعد البدء يبدأ العدّ التنازلي ({onlineExamDurationMinutes(exam.duration)} دقيقة) من وقت جلسة الاختبار ولا يمكن إيقافه —
              تُحفظ إجاباتك للمعلم مباشرة باسمك ومجموعتك.
            </p>

            <Button
              onClick={startExam}
              disabled={starting}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 h-12 text-base"
            >
              {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
              <span>{starting ? "جاري التحقق..." : "بدء الاختبار"}</span>
            </Button>

            <p className="text-center text-xs text-gray-400">
              لديك حساب؟{" "}
              <Link
                href={`/student/login?next=${encodeURIComponent("/exam/" + examId)}`}
                className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
              >
                سجّل الدخول
              </Link>{" "}
              لتُحفظ درجتك في تقريرك الكامل
            </p>
          </div>
        )}

        {step === "identify" && portalStudent && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <h2 className="text-xl font-bold">تأكيد بدء الاختبار</h2>
            <p className="text-sm text-gray-500">
              بعد البدء يبدأ العدّ التنازلي ({onlineExamDurationMinutes(exam.duration)} دقيقة) من وقت الجلسة ولا يمكن إيقافه.
            </p>
            <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="font-bold text-lg truncate">{portalStudent.name}</span>
                </div>
                <span className="shrink-0 bg-green-100 text-green-700 rounded-full px-3 py-1 text-xs font-bold">✓ مسجل الدخول</span>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {grades.find(g => g.id === gradeId)?.name || ""}
                {groupId ? ` — ${groups.find(x => x.id === groupId)?.name || ""}` : ""}
              </div>
              <p className="text-xs text-gray-400">
                اسمك وصفك ومجموعتك مسجَّلة تلقائياً من حسابك — تُحفظ درجتك في تقريرك مباشرة.
                <br />
                لا تملأ أي بيانات: أجب عن الأسئلة فقط.
              </p>
            </div>

            {entryError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm font-bold text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{entryError}</span>
              </div>
            )}

            <Button onClick={startExam} disabled={starting} className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 h-12 text-base">
              {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
              <span>{starting ? "جاري بدء الجلسة..." : "بدء الاختبار"}</span>
            </Button>
          </div>
        )}

        {step === "exam" && (() => {
          // تسلسل كل الأسئلة الفرعية — يُعرض واحد فقط في كل لحظة
          const items = exam.questions.flatMap((q, qi) => q.subQuestions.map(sq => ({ q, sq, qi })))
          if (items.length === 0) {
            return (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border p-8 text-center space-y-3">
                <AlertCircle className="w-12 h-12 mx-auto text-amber-500" />
                <p className="font-bold">لا توجد أسئلة في هذا الاختبار بعد</p>
                <Button onClick={() => void finishExam("manual")} variant="outline">متابعة</Button>
              </div>
            )
          }
          const safeCursor = Math.min(cursor, items.length - 1)
          const cur = items[safeCursor]
          const meta = getQuestionTypeMeta(cur.q.questionType)
          const isLast = safeCursor >= items.length - 1
          const answered = isSubAnswered(cur.q, cur.sq)
          const pct = Math.round(((safeCursor + (answered ? 1 : 0)) / items.length) * 100)
          return (
            <div className="space-y-4" data-feedback-version={feedbackVersion}>
              {(submissionError || syncError || submitting || remaining === 0) && (
                <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-100 space-y-2">
                  <p>{submitting ? "جارٍ التحقق من الخادم وتأكيد التسليم…" : submissionError || syncError || "جارٍ التحقق من انتهاء الوقت على الخادم…"}</p>
                  {(submissionError || syncError) && <p>لا تغلق هذه الصفحة ولا تحدّثها حتى يؤكد الخادم الحفظ أو التسليم.</p>}
                  {submissionError && (
                    <Button size="sm" variant="outline" disabled={submitting} onClick={() => void finishExam(lastSubmitReasonRef.current)}>
                      إعادة محاولة التسليم
                    </Button>
                  )}
                </div>
              )}
              {/* شريط التقدم */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
                <div className="flex items-center justify-between text-sm font-bold mb-2">
                  <span className="text-gray-900 dark:text-white">السؤال {safeCursor + 1} من {items.length}</span>
                  <span className="text-gray-400">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full bg-gradient-to-l from-indigo-500 to-purple-600 transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
              </div>

              {/* السؤال الحالي فقط */}
              <fieldset disabled={submitting || remaining === 0} className="bg-white dark:bg-gray-900 rounded-2xl border p-5 space-y-4">
                <h3 className="font-extrabold flex items-center gap-2">
                  <span className="text-white text-xs px-2 py-1 rounded" style={{ background: meta.accent }}>
                    {meta.paperMark}
                  </span>
                  السؤال {ARABIC_ORDINALS[cur.qi] || cur.qi + 1}: {getQuestionHeader(cur.q)}
                </h3>
                {renderSubQuestion(cur.q, cur.sq)}
              </fieldset>

              {/* التنقل: السابق / التالي (يُفتح بعد الإجابة) / إنهاء عند الأخير */}
              <div className="sticky bottom-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur rounded-2xl border p-4 flex items-center justify-between gap-3">
                <Button variant="outline" onClick={() => setCursor(safeCursor - 1)} disabled={safeCursor === 0}>
                  السابق
                </Button>
                <p className="text-xs text-gray-500 hidden sm:block text-center">
                  {isLast ? "آخر سؤال — راجع إجابتك ثم أنهِ الاختبار" : "أجب على السؤال ليظهر التالي"}
                </p>
                {isLast ? (
                  <Button disabled={submitting || remaining === 0} onClick={() => void finishExam("manual")} className="bg-gradient-to-r from-emerald-500 to-teal-600">
                    إنهاء الاختبار وإظهار النتيجة
                  </Button>
                ) : (
                  <Button
                    onClick={() => setCursor(safeCursor + 1)}
                    disabled={!answered}
                    title={!answered ? "أجب على السؤال أولاً" : "السؤال التالي"}
                    className="bg-gradient-to-r from-indigo-500 to-purple-600"
                  >
                    التالي
                  </Button>
                )}
              </div>
            </div>
          )
        })()}

        {step === "result" && result && (() => {
          const onlineMode = getOnlineExamMode(exam)
          const hasManualReview = result.manualTotal > 0
          const automaticLabel = onlineMode === "mixed" ? "الجزء المصحح تلقائياً" : "نتيجتك"
          return (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border p-5 sm:p-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500" />
            <h2 className="text-2xl font-extrabold">{autoSubmitted ? "تم تسليم الاختبار تلقائياً" : "انتهى الاختبار"}</h2>
            {autoSubmitted && (
              <p className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-sm font-bold text-amber-800 dark:text-amber-200">
                انتهى الوقت المخصص، فحُفظت إجاباتك تلقائياً.
              </p>
            )}
            {!hasManualReview && !submissionError && (
              <>
                <p className="text-xs font-bold text-gray-500">{automaticLabel}</p>
                <p className="text-5xl font-black text-indigo-700">
                  {result.score} / {result.autoTotal || 0}
                </p>
                <p className="text-gray-500">النسبة {result.percent.toFixed(0)}%</p>
              </>
            )}
            {hasManualReview && !submissionError && result.autoTotal > 0 && (
              <div className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/30 p-4">
                <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">الجزء المصحح تلقائياً</p>
                <p className="mt-1 text-4xl font-black text-indigo-700">{result.score} / {result.autoTotal}</p>
                <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-300">تظهر الإجابات الصحيحة حسب إعداد المعلم فقط.</p>
              </div>
            )}
            {hasManualReview && !submissionError && (
              <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-amber-800 dark:text-amber-200">
                <p className="font-extrabold">إجابتك المقالية قيد مراجعة المعلم</p>
                <p className="mt-1 text-sm">لن تظهر درجة المقال أو تعليقات المعلم أو التصحيح إلا بعد المراجعة وإطلاق النتيجة.</p>
              </div>
            )}
            {honored && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 p-4 text-amber-800 dark:text-amber-200">
                <Trophy className="w-6 h-6 mx-auto mb-1" />
                <p className="font-bold">مبروك — اسمك على لوحة الشرف هذا الشهر</p>
              </div>
            )}

            {/* مراجعة الإجابات الصحيحة — عند اختيار المعلم «في نهاية الاختبار» */}
            {!submissionError && answerVisibility === "atEnd" && (() => {
              // في التطوير بلا Supabase تبقى آلية الختم القديمة بديلاً محلياً؛
              // أما في الموقع فـ specRef وصل من RPC بعد التسليم ولا نعيد فك مفتاح محلي.
              if (!timerSessionRef.current) specRef.current = decodeSealForReview(sealRef.current, exam.id)
              const detailMap = new Map(result.details.map(d => [d.subQuestionId, d]))
              const reviewRows: { text: string; correct: boolean; answer: string; right: string }[] = []
              for (const q of exam.questions || []) {
                for (const sq of q.subQuestions || []) {
                  const d = detailMap.get(sq.id)
                  if (!d || !d.auto) continue
                  const ans = answers[sq.id] || {}
                  const myAnswer =
                    q.questionType === 1
                      ? sq.choices?.find(c => c.id === ans.choiceId)?.choiceText || "—"
                      : q.questionType === 3
                      ? ans.isTrue === true ? "صح" : ans.isTrue === false ? "خطأ" : "—"
                      : ans.text?.trim() || "—"
                  reviewRows.push({
                    text: `${getQuestionHeader(q)} — ${sq.questionText}`,
                    correct: d.correct,
                    answer: myAnswer,
                    right: correctAnswerLabel(sq.id, q.questionType, sq) || "—",
                  })
                }
              }
              if (reviewRows.length === 0) return null
              return (
                <div className="text-right border-t pt-4 mt-2 space-y-2">
                  <h3 className="font-extrabold">مراجعة الإجابات الصحيحة</h3>
                  {reviewRows.map((r, i) => (
                    <div key={i} className={`rounded-xl border px-4 py-3 text-sm ${
                      r.correct ? "border-green-200 dark:border-green-900 bg-green-50/60 dark:bg-green-950/20" : "border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/20"
                    }`}>
                      <p className="font-bold text-gray-800 dark:text-gray-100">{r.correct ? "✅" : "❌"} {r.text}</p>
                      <p className="text-gray-600 dark:text-gray-300 mt-1">إجابتك: {r.answer}</p>
                      {!r.correct && <p className="text-green-700 dark:text-green-300 font-bold mt-0.5">الصحيح: {r.right}</p>}
                    </div>
                  ))}
                </div>
              )
            })()}
            {!submissionError && (
              <>
                <p className="text-xs text-gray-500 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 px-3 py-2">
                  نتيجتك محفوظة — عُد إلى هذا الرابط لاحقاً من نفس الجهاز وستجد زر الاطلاع عليها ومراجعة إجاباتك (قراءة فقط) دون استهلاك أي محاولة.
                </p>
                <p className="text-sm text-gray-400">إعداد {TEACHER_NAME}</p>
                <Link href={portalStudent ? "/student" : "/"}><Button variant="outline">{portalStudent ? "العودة لبوابة الطالب" : "العودة للصفحة الرئيسية"}</Button></Link>
              </>
            )}
          </div>
          )
        })()}

        {/* مراجعة محاولة سابقة: يعرض المحاولة المعتمدة/المختارة بقواعد الإطلاق نفسها —
            لا تحرير إطلاقاً، الإجابات المسلمة للقراءة فقط */}
        {exam && reviewPrevAttempt && (
          <ExamReviewDialog
            open={!!reviewPrevAttempt}
            onOpenChange={(v) => { if (!v) setReviewPrevAttempt(null) }}
            exam={exam}
            attempts={[reviewPrevAttempt]}
            studentName={reviewPrevAttempt.studentName}
          />
        )}

        <TeacherSignature />
      </main>
    </div>
  )
}
