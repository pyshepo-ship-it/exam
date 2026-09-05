"use client"

import React, { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  FileText,
  Plus,
  Edit2,
  Trash2,
  Eye,
  Download,
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
  Sparkles,
  Palette,
  Link2,
  Globe,
  Printer,
ClipboardList,
Timer,
  Settings2,
  EyeOff,
  SlidersHorizontal,
  Users,
  UserCheck,
  Phone,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import toast from "react-hot-toast"
import { exportToPDF, printElement, printA4 } from "@/lib/pdf-utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Grade,
  Exam,
  ExamAttempt,
  ExamAttemptAnswerReview,
  Question,
  SubQuestion,
  ExamAccessMode,
  ExamDeliveryMode,
  ExamTemplateId,
  OnlineExamMode,
  allowedOnlineQuestionTypes,
  examDeliveryMode,
  getOnlineExamMode,
  getOnlineExamReadiness,
  isEssayQuestionForMode,
  isOnlineExam,
  isObjectiveQuestionType,
  getGrades,
  getExams,
  saveExams,
  getStoredAcademicYear,
  getGroupsOfGrade,
} from "@/lib/data-storage"
import { TEACHER_NAME } from "@/lib/branding"
import {
  MONTHS,
  QUESTION_TYPES,
  QUESTION_BUTTONS,
  ARABIC_ORDINALS,
  getQuestionHeader,
  getQuestionTypeMeta,
  getExamTotalMarks,
  getTemplate,
  renderCompleteParts,
  getUnderlinedWords,
  getOrnamentPreset,
  ORNAMENT_OPACITY_CHOICES,
  type OrnamentDensity,
} from "@/lib/exam-templates"
import { getExamAttempts, saveExamAttempts } from "@/lib/data-storage"
import { examAvailability, effectiveAttemptScore } from "@/lib/portal-content"
import { BanDeviceButton, DeviceOwnerBadge } from "@/components/devices/device-actions"
import { grantDeviceAttempt } from "@/lib/supabase/sync"
import { marksForReviewVerdict, summarizeAttemptReview } from "@/lib/exam-grade"
import { forcePushAll } from "@/lib/supabase/sync"
import { Switch } from "@/components/ui/switch"
import { ExamPaper, TemplatePicker, TemplateSwitcher } from "@/components/exam/exam-paper"
import { ScienceIcon } from "@/components/exam/science-ornaments"

/** لا نعرض اختباراً مجدولاً للطلاب ما لم تكن له فترة صحيحة ومكتملة. */
const ONLINE_MODE_LABELS: Record<OnlineExamMode, string> = {
  objective: "اختياري وصح وخطأ",
  essay: "مقالي",
  mixed: "مختلط",
}

function scheduledAvailabilityIssue(
  availabilityMode: "always" | "scheduled",
  availableFrom: string,
  availableUntil: string
): string | null {
  if (availabilityMode !== "scheduled") return null
  if (!availableFrom || !availableUntil) return "حدّد وقت فتح الاختبار ووقت إغلاقه، أو اختر «مفتوح دائماً»"

  const from = new Date(availableFrom)
  const until = new Date(availableUntil)
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) {
    return "أدخل وقتَي فتح وإغلاق صحيحين"
  }
  if (from >= until) return "يجب أن يكون وقت الإغلاق بعد وقت الفتح"
  return null
}

/**
 * ISO (UTC) → قيمة datetime-local بتوقيت المعلم.
 * قصّ نص ISO مباشرةً كان يعرض توقيت UTC داخل حقل محلي، فتنزاح نافذة الاختبار
 * بمقدار فارق التوقيت مع كل حفظ (‎+3 ساعات في مصر).
 */
function toLocalInputValue(iso?: string): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

/** قيمة datetime-local (توقيت المعلم) → ISO للتخزين */
function fromLocalInputValue(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export default function ExamsPage() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  /** تظهر أولاً لاختيار مسار الاختبار، ثم يفتح محرر النوع المختار */
  const [examTypeDialogOpen, setExamTypeDialogOpen] = useState(false)
  const [onlineModeDialogOpen, setOnlineModeDialogOpen] = useState(false)
  /** المحرر صفحة كاملة داخل المسار نفسه، وليس نافذة منبثقة. */
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)
  const [previewExam, setPreviewExam] = useState<Exam | null>(null)
  const [resultsExam, setResultsExam] = useState<Exam | null>(null)
  const [reviewAttempt, setReviewAttempt] = useState<ExamAttempt | null>(null)
  const [reviewDraft, setReviewDraft] = useState<Record<string, ExamAttemptAnswerReview>>({})
  const [resultsVersion, setResultsVersion] = useState(0)
  const [panelExam, setPanelExam] = useState<Exam | null>(null)
  const [panelForm, setPanelForm] = useState({
    allowOnline: false,
    accessMode: "members" as ExamAccessMode,
    availabilityMode: "always" as 'always' | 'scheduled',
    availableFrom: "",
    availableUntil: "",
    targetGroupIds: [] as string[],
    maxAttempts: "0",
    reviewOpen: false,
    listedOnBoard: true,
    showInPortal: true,
  })
  const [overrideTarget, setOverrideTarget] = useState<{ attemptId: string; name: string; current: number; total: number } | null>(null)
  const [overrideScore, setOverrideScore] = useState("")
  const [overrideReason, setOverrideReason] = useState("")
  const [expandedQuestions, setExpandedQuestions] = useState<string[]>([])
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const editorExamIdRef = useRef<string | null>(null)
  const editorCreatedAtRef = useRef("")
  const editorInitialFingerprintRef = useRef("")
  const examsRef = useRef<Exam[]>([])
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [previewTemplate, setPreviewTemplate] = useState<ExamTemplateId>("classic")
  const [previewDecorations, setPreviewDecorations] = useState(true)
  const [previewCompact, setPreviewCompact] = useState(false)
  const [previewMaxPages, setPreviewMaxPages] = useState<number | undefined>(undefined)
  const [previewOrnamentSize, setPreviewOrnamentSize] = useState(32)
  const [previewOrnamentDensity, setPreviewOrnamentDensity] = useState<OrnamentDensity>("medium")
  const [previewOrnamentOpacity, setPreviewOrnamentOpacity] = useState<number>(ORNAMENT_OPACITY_CHOICES[1].value)
  const [examForm, setExamForm] = useState({
    gradeId: "",
    groupId: "",
    title: "",
    month: new Date().getMonth() + 1,
    unit: "",
    academicYear: getStoredAcademicYear(),
    duration: 60,
    totalMarks: 0,
    questions: [] as Question[],
    templateId: "classic" as ExamTemplateId,
    showDecorations: true,
    ornamentSize: 32,
    ornamentDensity: "medium" as OrnamentDensity,
    ornamentOpacity: ORNAMENT_OPACITY_CHOICES[1].value,
    teacherName: TEACHER_NAME,
    schoolName: "",
    deliveryMode: "offline" as ExamDeliveryMode,
    onlineExamMode: "objective" as OnlineExamMode,
    allowOnline: false,
    accessMode: "members" as ExamAccessMode,
    autoHonorBoard: false,
    honorMinPercent: 100,
    availabilityMode: "always" as 'always' | 'scheduled',
    availableFrom: "",
    availableUntil: "",
    targetGroupIds: [] as string[],
    answerVisibility: "never" as 'never' | 'afterEach' | 'atEnd',
  })
  const examFormRef = useRef(examForm)

  /** أصل الموقع لرابط الاختبار المفتوح للجميع (يُحسب في المتصفح فقط) */
  const [siteOrigin, setSiteOrigin] = useState("")

  useEffect(() => {
    setGrades(getGrades())
    setExams(getExams())
    setSiteOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    examsRef.current = exams
  }, [exams])

  useEffect(() => {
    examFormRef.current = examForm
  }, [examForm])

  const examLink = (id: string) => `${siteOrigin}/exam/${id}`

  const copyExamLink = (id: string) => {
    const url = `${window.location.origin}/exam/${id}`
    navigator.clipboard.writeText(url).then(
      () => toast.success("تم نسخ رابط الاختبار — انشره للطلاب"),
      () => toast.error(url),
    )
  }

  // مجموعات الصف المختار فقط — لا تظهر مجموعات صف آخر أبداً
  // ===== لوحة تحكم الظهور والمحاولات لاختبار بعينه =====
  const openPanel = (exam: Exam) => {
    setPanelExam(exam)
    setPanelForm({
      allowOnline: !!exam.allowOnline,
      accessMode: exam.accessMode === "public" ? "public" : "members",
      availabilityMode: exam.availabilityMode || "always",
      availableFrom: toLocalInputValue(exam.availableFrom),
      availableUntil: toLocalInputValue(exam.availableUntil),
      reviewOpen: !!exam.reviewOpen,
      listedOnBoard: exam.listedOnBoard !== false,
      showInPortal: exam.showInPortal !== false,
      targetGroupIds: exam.targetGroupIds || [],
      maxAttempts: String(exam.maxAttempts && exam.maxAttempts > 0 ? exam.maxAttempts : 0),
    })
  }

  const savePanel = () => {
    if (!panelExam) return
    // الاختبارات القديمة لا تحمل deliveryMode؛ فتح لوحة النشر فيها يعني تحويلها
    // صراحةً إلى اختبار أونلاين عند الحفظ، من دون كسر الاختبارات السابقة.
    if (panelExam.deliveryMode === "offline") {
      toast.error("لوحة النشر متاحة للاختبارات الإلكترونية فقط")
      return
    }
    const readiness = getOnlineExamReadiness({
      questions: panelExam.questions,
      onlineExamMode: panelExam.onlineExamMode,
    })
    if (panelForm.allowOnline && !readiness.ready) {
      toast.error(`أكمل الاختبار قبل نشره: ${readiness.issues[0]}`)
      return
    }
    const scheduleIssue = scheduledAvailabilityIssue(
      panelForm.availabilityMode,
      panelForm.availableFrom,
      panelForm.availableUntil
    )
    if (panelForm.allowOnline && scheduleIssue) {
      toast.error(scheduleIssue)
      return
    }
    const maxN = Math.max(0, parseInt(panelForm.maxAttempts || "0", 10) || 0)
    const updatedExams: Exam[] = exams.map(e =>
      e.id === panelExam.id
        ? {
            ...e,
            deliveryMode: "online",
            allowOnline: panelForm.allowOnline,
            accessMode: panelForm.accessMode,
            availabilityMode: panelForm.availabilityMode,
            availableFrom: panelForm.availabilityMode === "scheduled"
              ? fromLocalInputValue(panelForm.availableFrom) : undefined,
            availableUntil: panelForm.availabilityMode === "scheduled"
              ? fromLocalInputValue(panelForm.availableUntil) : undefined,
            targetGroupIds: panelForm.targetGroupIds,
            maxAttempts: maxN > 0 ? maxN : undefined,
            reviewOpen: panelForm.reviewOpen,
            listedOnBoard: panelForm.listedOnBoard,
            showInPortal: panelForm.showInPortal,
            updatedAt: new Date().toISOString(),
          }
        : e
    )
    setExams(updatedExams)
    saveExams(updatedExams)
    setPanelExam(null)
    toast.success("تم حفظ لوحة التحكم — تظهر التغييرات للطلاب فوراً")
    forcePushAll().catch(() => {})
  }

  // فتح فوري لمدة محددة من الآن (ساعات)
  const quickOpenHours = (hours: number) => {
    const from = new Date()
    const until = new Date(from.getTime() + hours * 3600 * 1000)
    const fmt = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setPanelForm(prev => ({
      ...prev,
      allowOnline: true,
      availabilityMode: "scheduled",
      availableFrom: fmt(from),
      availableUntil: fmt(until),
    }))
    toast.success(`سيُفتح الاختبار الآن لمدة ${hours >= 24 ? `${hours / 24} يوم` : `${hours} ساعة`}`)
  }

  const groupsOfSelectedGrade = getGroupsOfGrade(grades, examForm.gradeId)

  // محاولات اختبار النتائج المفتوح (من التخزين المباشر لتتبع التعديلات فوراً)
  const resultsAttempts = resultsExam ? getExamAttempts().filter(a => a.examId === resultsExam.id) : []

  const applyOverride = () => {
    if (!overrideTarget || !resultsExam) return
    const score = parseFloat(overrideScore)
    if (isNaN(score) || score < 0 || score > overrideTarget.total) {
      toast.error(`أدخل درجة بين 0 و ${overrideTarget.total}`)
      return
    }
    const all = getExamAttempts()
    const updated = all.map(a =>
      a.id === overrideTarget.attemptId
        ? { ...a, manualOverride: { score, reason: overrideReason.trim() || undefined, at: new Date().toISOString() } }
        : a
    )
    saveExamAttempts(updated)
    setResultsVersion(version => version + 1)
    toast.success(`تم تعديل درجة ${overrideTarget.name} إلى ${score} — تظهر في تقريره فوراً`)
    setOverrideTarget(null)
    setOverrideScore("")
    setOverrideReason("")
  }

  const openAttemptReview = (attempt: ExamAttempt) => {
    const existingReviews: Record<string, ExamAttemptAnswerReview> = {}
    Object.entries(attempt.answers || {}).forEach(([answerId, answer]) => {
      if (answer.review) existingReviews[answerId] = { ...answer.review }
    })
    setReviewAttempt(attempt)
    setReviewDraft(existingReviews)
  }

  const updateReviewDraft = (answerId: string, patch: Partial<ExamAttemptAnswerReview>) => {
    setReviewDraft(previous => ({
      ...previous,
      [answerId]: { ...previous[answerId], ...patch },
    }))
  }

  const saveAttemptReview = (release = false) => {
    if (!reviewAttempt || !resultsExam) return
    const nextAnswers: ExamAttempt["answers"] = { ...reviewAttempt.answers }
    Object.entries(reviewDraft).forEach(([answerId, review]) => {
      nextAnswers[answerId] = { ...nextAnswers[answerId], review }
    })
    const summary = summarizeAttemptReview(resultsExam, nextAnswers)
    if (release && summary.pendingManualCount > 0) {
      toast.error(`لا يمكن إطلاق النتيجة: بقيت ${summary.pendingManualCount} إجابة مقالية دون تصحيح`)
      return
    }
    const now = new Date().toISOString()
    const nextAttempt: ExamAttempt = {
      ...reviewAttempt,
      answers: nextAnswers,
      score: summary.autoScore,
      totalMarks: summary.totalMarks || reviewAttempt.totalMarks,
      autoScore: summary.autoScore,
      autoTotal: summary.autoTotal,
      manualScore: summary.manualScore,
      manualTotal: summary.manualTotal,
      gradingStatus: release ? "released" : summary.status,
      reviewedAt: summary.reviewedManualCount > 0 ? now : reviewAttempt.reviewedAt,
      resultReleasedAt: release ? now : reviewAttempt.resultReleasedAt,
    }
    const updated = getExamAttempts().map(attempt => attempt.id === nextAttempt.id ? nextAttempt : attempt)
    saveExamAttempts(updated)
    setReviewAttempt(nextAttempt)
    setResultsVersion(version => version + 1)
    toast.success(release ? "تم حفظ المراجعة وإطلاق النتيجة للطالب" : "تم حفظ مراجعة الإجابات")
  }

  const releaseAllReviewed = () => {
    if (!resultsExam) return
    const now = new Date().toISOString()
    let released = 0
    const updated = getExamAttempts().map(attempt => {
      if (attempt.examId !== resultsExam.id || attempt.resultReleasedAt) return attempt
      const summary = summarizeAttemptReview(resultsExam, attempt.answers)
      if (summary.pendingManualCount > 0) return attempt
      released += 1
      return {
        ...attempt,
        score: summary.autoScore,
        totalMarks: summary.totalMarks || attempt.totalMarks,
        autoScore: summary.autoScore,
        autoTotal: summary.autoTotal,
        manualScore: summary.manualScore,
        manualTotal: summary.manualTotal,
        gradingStatus: "released" as const,
        resultReleasedAt: now,
      }
    })
    if (!released) {
      toast.error("لا توجد محاولات مكتملة المراجعة لإطلاقها")
      return
    }
    saveExamAttempts(updated)
    setResultsVersion(version => version + 1)
    toast.success(`تم إطلاق نتائج ${released} طالب`)
  }

  const toggleQuestion = (questionId: string) => {
    setExpandedQuestions(prev =>
      prev.includes(questionId)
        ? prev.filter(id => id !== questionId)
        : [...prev, questionId]
    )
  }

  const makeSubQuestion = (type: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, index: number): SubQuestion => {
    const id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`
    const sub: SubQuestion = {
      id,
      orderNumber: index + 1,
      questionText: "",
      marks: 1,
    }
    if (type === 1) {
      sub.choices = [
        { id: "1", choiceKey: "أ", choiceText: "", isCorrect: false },
        { id: "2", choiceKey: "ب", choiceText: "", isCorrect: false },
        { id: "3", choiceKey: "ج", choiceText: "", isCorrect: false },
        { id: "4", choiceKey: "د", choiceText: "", isCorrect: false },
      ]
    } else if (type === 2) {
      sub.parts = [
        { id: `${id}-p1`, partOrder: 1, partText: "", blankPosition: "between" },
        { id: `${id}-p2`, partOrder: 2, partText: "", blankPosition: "between" },
      ]
    } else if (type === 5) {
      sub.corrections = [
        { id: `${id}-c1`, wrongWord: "", correctAnswer: "", wordPosition: 0, wordCount: 0 },
      ]
      sub.answerLines = 1
    } else if (type === 4 || type === 6 || type === 7 || type === 8) {
      sub.answerLines = 1
    }
    return sub
  }

  const addQuestion = (
    type: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
    reasoningType?: "علل" | "بم تفسر" | "اذكر أهمية"
  ) => {
    const questionNumber = examForm.questions.length + 1
    let defaultHeader = ""
    if (type === 6) defaultHeader = "اكتب المصطلح العلمي الدال على كل عبارة مما يأتي:"
    else if (type === 7) defaultHeader = "ما المقصود بكل مما يأتي:"
    else if (type === 8) defaultHeader = "أجب عن الأسئلة الآتية:"

    const newQuestion: Question = {
      id: Date.now().toString() + "-" + Math.random().toString(36).slice(2, 6),
      questionType: type,
      questionNumber,
      orderNumber: questionNumber,
      headerText: defaultHeader,
      reasoningType: type === 4 ? reasoningType || "علل" : undefined,
      subQuestions: [0, 1, 2, 3].map(i => makeSubQuestion(type, i)),
    }
    setExamForm(prev => ({ ...prev, questions: [...prev.questions, newQuestion] }))
    setExpandedQuestions(prev => [...prev, newQuestion.id])
  }

  const updateReasoningType = (questionId: string, value: string) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q =>
        q.id === questionId ? { ...q, reasoningType: value as Question["reasoningType"] } : q
      ),
    }))
  }

  const addSubQuestion = (questionId: string) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => {
        if (q.id === questionId) {
          const newSub = makeSubQuestion(q.questionType, q.subQuestions.length)
          newSub.orderNumber = q.subQuestions.length + 1
          return { ...q, subQuestions: [...q.subQuestions, newSub] }
        }
        return q
      }),
    }))
  }

  const updateSubQuestion = (questionId: string, subQuestionId: string, field: string, value: unknown) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => {
        if (q.id === questionId) {
          return {
            ...q,
            subQuestions: q.subQuestions.map(sq =>
              sq.id === subQuestionId ? { ...sq, [field]: value } : sq
            ),
          }
        }
        return q
      }),
    }))
  }

  const updateChoice = (questionId: string, subQuestionId: string, choiceId: string, text: string) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => {
        if (q.id === questionId) {
          return {
            ...q,
            subQuestions: q.subQuestions.map(sq => {
              if (sq.id === subQuestionId && sq.choices) {
                return {
                  ...sq,
                  choices: sq.choices.map(c => (c.id === choiceId ? { ...c, choiceText: text } : c)),
                }
              }
              return sq
            }),
          }
        }
        return q
      }),
    }))
  }

  const setCorrectChoice = (questionId: string, subQuestionId: string, choiceId: string) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => {
        if (q.id === questionId) {
          return {
            ...q,
            subQuestions: q.subQuestions.map(sq => {
              if (sq.id === subQuestionId && sq.choices) {
                return {
                  ...sq,
                  choices: sq.choices.map(c => ({ ...c, isCorrect: c.id === choiceId })),
                }
              }
              return sq
            }),
          }
        }
        return q
      }),
    }))
  }

  const updatePartText = (questionId: string, subQuestionId: string, partOrder: number, text: string) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => {
        if (q.id === questionId) {
          return {
            ...q,
            subQuestions: q.subQuestions.map(sq => {
              if (sq.id === subQuestionId && sq.parts) {
                const exists = sq.parts.some(p => p.partOrder === partOrder)
                return {
                  ...sq,
                  parts: exists
                    ? sq.parts.map(p => (p.partOrder === partOrder ? { ...p, partText: text } : p))
                    : [...sq.parts, {
                        id: `${sq.id}-p${partOrder}`,
                        partOrder,
                        partText: text,
                        blankPosition: "between" as const,
                      }],
                }
              }
              return sq
            }),
          }
        }
        return q
      }),
    }))
  }

  const updateBlankPosition = (questionId: string, subQuestionId: string, position: "between" | "after") => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => {
        if (q.id === questionId) {
          return {
            ...q,
            subQuestions: q.subQuestions.map(sq => {
              if (sq.id === subQuestionId && sq.parts && sq.parts.length >= 2) {
                return {
                  ...sq,
                  parts: sq.parts.map((p, i) => (i === 1 ? { ...p, blankPosition: position } : p)),
                }
              }
              return sq
            }),
          }
        }
        return q
      }),
    }))
  }

  const updateCorrectionRange = (questionId: string, subQuestionId: string, wordPosition: number, wordCount: number) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => {
        if (q.id === questionId) {
          return {
            ...q,
            subQuestions: q.subQuestions.map(sq => {
              if (sq.id === subQuestionId) {
                const prevCorr = sq.corrections?.[0] || {
                  id: `${sq.id}-c1`,
                  wrongWord: "",
                  correctAnswer: "",
                  wordPosition: 0,
                  wordCount: 0,
                }
                return {
                  ...sq,
                  corrections: [
                    {
                      ...prevCorr,
                      wordPosition,
                      wordCount,
                    },
                  ],
                }
              }
              return sq
            }),
          }
        }
        return q
      }),
    }))
  }

  const updateCorrection = (questionId: string, subQuestionId: string, field: "wordPosition" | "wordCount", value: number) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => {
        if (q.id === questionId) {
          return {
            ...q,
            subQuestions: q.subQuestions.map(sq => {
              if (sq.id === subQuestionId && sq.corrections) {
                return {
                  ...sq,
                  corrections: sq.corrections.map(c => ({ ...c, [field]: value })),
                }
              }
              return sq
            }),
          }
        }
        return q
      }),
    }))
  }

  const removeSubQuestion = (questionId: string, subQuestionId: string) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => {
        if (q.id === questionId) {
          return {
            ...q,
            subQuestions: q.subQuestions
              .filter(sq => sq.id !== subQuestionId)
              .map((sq, index) => ({ ...sq, orderNumber: index + 1 })),
          }
        }
        return q
      }),
    }))
  }

  const removeQuestion = (questionId: string) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions
        .filter(q => q.id !== questionId)
        .map((q, index) => ({ ...q, questionNumber: index + 1, orderNumber: index + 1 })),
    }))
  }

  const emptyForm = (
    deliveryMode: ExamDeliveryMode = "offline",
    onlineExamMode: OnlineExamMode = "objective"
  ) => ({
    gradeId: "",
    groupId: "",
    title: "",
    month: new Date().getMonth() + 1,
    unit: "",
    academicYear: getStoredAcademicYear(),
    duration: 60,
    totalMarks: 0,
    questions: [] as Question[],
    templateId: "classic" as ExamTemplateId,
    showDecorations: true,
    ornamentSize: 32,
    ornamentDensity: "medium" as OrnamentDensity,
    ornamentOpacity: ORNAMENT_OPACITY_CHOICES[1].value,
    teacherName: TEACHER_NAME,
    schoolName: "",
    deliveryMode,
    onlineExamMode,
    allowOnline: false,
    accessMode: "members" as ExamAccessMode,
    autoHonorBoard: false,
    honorMinPercent: 100,
    availabilityMode: "always" as 'always' | 'scheduled',
    availableFrom: "",
    availableUntil: "",
    targetGroupIds: [] as string[],
    answerVisibility: "never" as 'never' | 'afterEach' | 'atEnd',
  })

  /**
   * يحول حالة المحرر إلى سجل قابل للحفظ، مع إبقاء المسودة غير مكتملة مخفية عن الطلاب.
   * إعدادات لوحة التحكم (حد المحاولات وفتح المراجعة) لا يملكها المحرر، فتُنقل
   * كما هي من السجل السابق. بدون ذلك كان أي حفظ/حفظ تلقائي من المحرر يمسح
   * maxAttempts فيصير الاختبار بلا حد محاولات على الخادم وفي البوابة معاً.
   */
  const buildExamFromForm = (
    form: typeof examForm,
    id: string,
    createdAt: string,
    protectIncompleteDraft = false,
    previous?: Exam
  ): Exam => {
    const online = form.deliveryMode === "online"
    const readiness = getOnlineExamReadiness({
      questions: form.questions,
      onlineExamMode: form.onlineExamMode,
    })
    const scheduleIssue = scheduledAvailabilityIssue(
      form.availabilityMode,
      form.availableFrom,
      form.availableUntil
    )
    const canPublish = online && form.allowOnline && readiness.ready && !scheduleIssue
    return {
      id,
      gradeId: form.gradeId === "__all" ? "" : form.gradeId,
      groupId: form.gradeId === "__all" ? undefined : (form.groupId || undefined),
      // عنوان مؤقت للمسودة كي لا تفشل المزامنة إن عاد المعلم قبل كتابة العنوان.
      title: form.title.trim() || "مسودة اختبار بدون عنوان",
      month: form.month,
      unit: form.unit || undefined,
      academicYear: form.academicYear,
      duration: form.duration,
      totalMarks: getExamTotalMarks(form.questions),
      questions: form.questions,
      templateId: form.templateId,
      showDecorations: form.showDecorations,
      ornamentSize: form.ornamentSize,
      ornamentDensity: form.ornamentDensity,
      ornamentOpacity: form.ornamentOpacity,
      teacherName: form.teacherName || undefined,
      schoolName: form.schoolName || undefined,
      deliveryMode: form.deliveryMode,
      onlineExamMode: online ? form.onlineExamMode : undefined,
      allowOnline: protectIncompleteDraft ? canPublish : (online ? form.allowOnline : false),
      accessMode: online ? form.accessMode : undefined,
      autoHonorBoard: online ? form.autoHonorBoard : false,
      honorMinPercent: online ? form.honorMinPercent : undefined,
      availabilityMode: online ? form.availabilityMode : undefined,
      availableFrom: online && form.availabilityMode === "scheduled"
        ? fromLocalInputValue(form.availableFrom) : undefined,
      availableUntil: online && form.availabilityMode === "scheduled"
        ? fromLocalInputValue(form.availableUntil) : undefined,
      targetGroupIds: online ? form.targetGroupIds : undefined,
      answerVisibility: online ? form.answerVisibility : undefined,
      // ===== إعدادات لوحة التحكم — يملكها panelForm وحده، ولا يجوز أن يمسحها المحرر =====
      maxAttempts: previous?.maxAttempts && previous.maxAttempts > 0 ? previous.maxAttempts : undefined,
      reviewOpen: !!previous?.reviewOpen,
      listedOnBoard: previous ? previous.listedOnBoard !== false : true,
      showInPortal: previous ? previous.showInPortal !== false : true,
      createdAt,
      updatedAt: new Date().toISOString(),
    }
  }

  const persistEditorDraft = (form: typeof examForm, reason: "auto" | "leave" = "auto") => {
    const id = editorExamIdRef.current
    if (!id) return
    const hasContent = !!form.title.trim() || !!form.gradeId || form.questions.length > 0
    if (!hasContent) return
    const current = examsRef.current
    const previous = current.find(exam => exam.id === id)
    const createdAt = previous?.createdAt || editorCreatedAtRef.current || new Date().toISOString()
    const draft = buildExamFromForm(form, id, createdAt, true, previous)
    const next = previous
      ? current.map(exam => exam.id === id ? draft : exam)
      : [...current, draft]
    examsRef.current = next
    setExams(next)
    saveExams(next)
    if (reason === "auto") setAutoSaveState("saved")
  }

  // كل تعديل في المحرر يُحفظ كمسودة بعد مهلة قصيرة. لا ننتظر ضغط زر الحفظ.
  useEffect(() => {
    if (!createDialogOpen || !editorExamIdRef.current) return
    const fingerprint = JSON.stringify(examForm)
    if (fingerprint === editorInitialFingerprintRef.current) return
    setAutoSaveState("saving")
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      persistEditorDraft(examForm)
      editorInitialFingerprintRef.current = fingerprint
      autoSaveTimerRef.current = null
    }, 650)
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
    // persistEditorDraft uses refs for the latest exam list; form is the intended snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examForm, createDialogOpen])

  // إن ضغط المعلم زر الرجوع أو أغلق التبويب، نحفظ آخر لقطة فوراً قبل المغادرة.
  useEffect(() => {
    if (!createDialogOpen) return
    const saveBeforeLeaving = () => {
      const current = examFormRef.current
      if (JSON.stringify(current) !== editorInitialFingerprintRef.current) {
        persistEditorDraft(current, "leave")
        editorInitialFingerprintRef.current = JSON.stringify(current)
      }
    }
    window.addEventListener("beforeunload", saveBeforeLeaving)
    window.addEventListener("popstate", saveBeforeLeaving)
    return () => {
      window.removeEventListener("beforeunload", saveBeforeLeaving)
      window.removeEventListener("popstate", saveBeforeLeaving)
    }
    // هذا الاشتراك يظل ثابتاً طوال فتح صفحة المحرر، وتُقرأ أحدث القيم من ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createDialogOpen])

  const openCreateDialog = (
    exam?: Exam,
    mode: ExamDeliveryMode = "offline",
    onlineMode: OnlineExamMode = "objective"
  ) => {
    const form = exam ? {
      gradeId: exam.gradeId,
      groupId: exam.groupId || "",
      title: exam.title === "مسودة اختبار بدون عنوان" ? "" : exam.title,
      month: exam.month || new Date().getMonth() + 1,
      unit: exam.unit || "",
      academicYear: exam.academicYear,
      duration: exam.duration || 60,
      totalMarks: exam.totalMarks || 0,
      questions: exam.questions,
      templateId: exam.templateId || "classic" as ExamTemplateId,
      showDecorations: exam.showDecorations !== false,
      ornamentSize: exam.ornamentSize ?? 32,
      ornamentDensity: (exam.ornamentDensity || "medium") as OrnamentDensity,
      ornamentOpacity: exam.ornamentOpacity ?? ORNAMENT_OPACITY_CHOICES[1].value,
      teacherName: exam.teacherName || TEACHER_NAME,
      schoolName: exam.schoolName || "",
      deliveryMode: examDeliveryMode(exam),
      onlineExamMode: getOnlineExamMode(exam),
      allowOnline: !!exam.allowOnline,
      accessMode: exam.accessMode === "public" ? "public" as ExamAccessMode : "members" as ExamAccessMode,
      autoHonorBoard: !!exam.autoHonorBoard,
      honorMinPercent: exam.honorMinPercent ?? 100,
      availabilityMode: (exam.availabilityMode || "always") as "always" | "scheduled",
      availableFrom: toLocalInputValue(exam.availableFrom),
      availableUntil: toLocalInputValue(exam.availableUntil),
      targetGroupIds: exam.targetGroupIds || [],
      answerVisibility: (exam.answerVisibility || "never") as "never" | "afterEach" | "atEnd",
    } : emptyForm(mode, onlineMode)

    setEditingExam(exam || null)
    editorExamIdRef.current = exam?.id || `exam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    editorCreatedAtRef.current = exam?.createdAt || new Date().toISOString()
    editorInitialFingerprintRef.current = JSON.stringify(form)
    setAutoSaveState("idle")
    setExamForm(form)
    setExpandedQuestions([])
    setCreateDialogOpen(true)
    // بداية الصفحة الكاملة دائماً من الأعلى، خصوصاً عند فتحها من هاتف.
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }), 0)
  }

  const openExamTypeDialog = () => {
    setExamTypeDialogOpen(true)
  }

  const chooseExamType = (mode: ExamDeliveryMode) => {
    setExamTypeDialogOpen(false)
    if (mode === "online") {
      setOnlineModeDialogOpen(true)
      return
    }
    openCreateDialog(undefined, "offline")
  }

  const chooseOnlineExamMode = (mode: OnlineExamMode) => {
    setOnlineModeDialogOpen(false)
    openCreateDialog(undefined, "online", mode)
  }

  const changeOnlineExamMode = (mode: OnlineExamMode) => {
    const allowed = allowedOnlineQuestionTypes(mode)
    if (examForm.questions.some(question => !allowed.includes(question.questionType))) {
      toast.error("احذف أو عدّل الأسئلة غير المتوافقة قبل تغيير نمط الاختبار")
      return
    }
    setExamForm(prev => ({ ...prev, onlineExamMode: mode }))
  }

  const saveExam = () => {
    if (!examForm.title.trim()) {
      toast.error("يرجى إدخال عنوان الاختبار")
      return
    }

    const online = examForm.deliveryMode === "online"
    const readiness = getOnlineExamReadiness({
      questions: examForm.questions,
      onlineExamMode: examForm.onlineExamMode,
    })
    // يمكن حفظ مسودة أونلاين في أي وقت، لكن لا نسمح بنشر اختبار ناقص للطلاب.
    if (online && examForm.allowOnline && !readiness.ready) {
      toast.error(`لا يمكن نشر الاختبار بعد: ${readiness.issues[0]}`)
      return
    }
    const scheduleIssue = scheduledAvailabilityIssue(
      examForm.availabilityMode,
      examForm.availableFrom,
      examForm.availableUntil
    )
    if (online && examForm.allowOnline && scheduleIssue) {
      toast.error(scheduleIssue)
      return
    }

    const id = editorExamIdRef.current || editingExam?.id || `exam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const previous = examsRef.current.find(exam => exam.id === id)
    const examData = buildExamFromForm(
      examForm,
      id,
      previous?.createdAt || editorCreatedAtRef.current || new Date().toISOString(),
      false,
      previous
    )
    const current = examsRef.current
    const updatedExams = current.some(exam => exam.id === id)
      ? current.map(exam => exam.id === id ? examData : exam)
      : [...current, examData]
    examsRef.current = updatedExams
    setExams(updatedExams)
    saveExams(updatedExams)
    editorInitialFingerprintRef.current = JSON.stringify(examForm)
    setCreateDialogOpen(false)
    setEditingExam(null)
    setAutoSaveState("saved")
    window.setTimeout(() => window.scrollTo(0, 0), 0)
    toast.success(
      editingExam
        ? "تم تحديث الاختبار بنجاح"
        : online
        ? (examForm.allowOnline ? "تم إنشاء ونشر الاختبار الإلكتروني بنجاح" : "تم حفظ مسودة الاختبار الإلكتروني بنجاح")
        : "تم إنشاء الاختبار الورقي بنجاح"
    )
  }

  const leaveEditor = () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    const current = examFormRef.current
    if (JSON.stringify(current) !== editorInitialFingerprintRef.current) {
      persistEditorDraft(current, "leave")
      editorInitialFingerprintRef.current = JSON.stringify(current)
    }
    setCreateDialogOpen(false)
    setEditingExam(null)
    setAutoSaveState("idle")
    window.setTimeout(() => window.scrollTo(0, 0), 0)
  }

  const deleteExam = (examId: string) => {
    if (confirm("هل أنت متأكد من حذف هذا الاختبار؟")) {
      const updatedExams = exams.filter(e => e.id !== examId)
      setExams(updatedExams)
      saveExams(updatedExams)
      toast.success("تم حذف الاختبار بنجاح")
    }
  }

  const previewExamHandler = (exam: Exam) => {
    setPreviewExam(exam)
    setPreviewTemplate(exam.templateId || "classic")
    setPreviewDecorations(exam.showDecorations !== false)
    setPreviewOrnamentSize(exam.ornamentSize ?? getOrnamentPreset(exam.templateId || "classic").size)
    setPreviewOrnamentDensity(exam.ornamentDensity ?? getOrnamentPreset(exam.templateId || "classic").density)
    setPreviewOrnamentOpacity(
      exam.ornamentOpacity ?? getOrnamentPreset(exam.templateId || "classic").opacity
    )
    setPreviewCompact(false)
    setPreviewMaxPages(undefined)
    setPreviewDialogOpen(true)
  }

  const getGradeName = (gradeId: string) => (!gradeId ? "عام — كل الصفوف" : grades.find(g => g.id === gradeId)?.name || "غير محدد")
  const getGroupName = (groupId: string) => {
    for (const grade of grades) {
      const group = grade.groups.find(g => g.id === groupId)
      if (group) return group.name
    }
    return "الكل"
  }

  const renderCompletePreview = (sq: SubQuestion) => {
    const { before, after, atEnd } = renderCompleteParts(sq)
    const blank = <span className="tracking-wide text-gray-400">....................</span>
    if (atEnd) return <>{before} {after} {blank}</>
    return <>{before} {blank} {after}</>
  }

  const renderCorrectionSentence = (sq: SubQuestion) => {
    const words = getUnderlinedWords(sq)
    if (words.length === 0) return null
    return words.map((w, i) => (
      <span key={i}>
        <span className={w.underlined ? "underline decoration-2 underline-offset-4" : undefined}>{w.word}</span>
        {i < words.length - 1 ? " " : ""}
      </span>
    ))
  }

  const totalSubQuestions = examForm.questions.reduce((s, q) => s + q.subQuestions.length, 0)
  const liveTotalMarks = getExamTotalMarks(examForm.questions)
  const selectedGradeName = getGradeName(examForm.gradeId)
  const isOnlineForm = examForm.deliveryMode === "online"
  const onlineReadiness = getOnlineExamReadiness({
    questions: examForm.questions,
    onlineExamMode: examForm.onlineExamMode,
  })
  const questionButtons = isOnlineForm
    ? QUESTION_BUTTONS.filter(btn => allowedOnlineQuestionTypes(examForm.onlineExamMode).includes(btn.type))
    : QUESTION_BUTTONS

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">الاختبارات</h1>
          <p className="text-gray-500 dark:text-gray-400">
            أنشئ اختباراً ورقياً للطباعة، أو اختباراً إلكترونياً يؤديه الطلاب من بوابتهم وتصل محاولاتهم إليك مباشرة
          </p>
        </div>
        <Button
          onClick={openExamTypeDialog}
          className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-lg"
        >
          <Plus className="w-5 h-5" />
          <span>إنشاء اختبار جديد</span>
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-900 rounded-2xl p-6"
      >
        <h3 className="font-bold text-gray-900 dark:text-white mb-4">
          أنواع الأسئلة (رأس كل سؤال يُكتب تلقائياً — وشارة ملوّنة تميّز نوعه)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {QUESTION_TYPES.map((type) => (
            <div
              key={type.id}
              className={`bg-white dark:bg-gray-900 rounded-xl p-4 border-2 ${type.border}`}
            >
              <div className={`w-8 h-8 bg-gradient-to-br ${type.color} rounded-lg flex items-center justify-center text-white font-bold mb-2 text-xs`}>
                {type.paperMark}
              </div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">{type.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{type.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {exams.map((exam, index) => {
            const online = isOnlineExam(exam)
            const onlineMode = getOnlineExamMode(exam)
            const tpl = getTemplate(exam.templateId)
            return (
              <motion.div
                key={exam.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.05 }}
                className="h-full"
              >
                {/*
                  بطاقات موحّدة الحجم دون إخفاء شيء: البطاقة تملأ ارتفاع صفّها
                  في الشبكة (h-full) فتصطف كل البطاقات على الطول نفسه، والعنوان
                  يلتف على أسطره كاملةً (بلا اقتصاص) مع مساحة ثابتة لسطرين
                  لمحاذاة البطاقات الأقصر، والشارات تأخذ الوسط ويتمدد، وأزرار
                  الإجراءات مثبّتة بأسفل البطاقة (mt-auto) في موضع واحد.
                */}
                <Card className="h-full flex flex-col bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader className="shrink-0 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle
                          className="text-lg leading-snug text-gray-900 dark:text-white break-words min-h-[3.25rem]"
                          title={exam.title}
                        >
                          {exam.title}
                        </CardTitle>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 break-words">
                          {getGradeName(exam.gradeId)}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
                        {exam.questions.length} سؤال
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col pt-0">
                    <div className="flex flex-wrap content-start items-start gap-2 flex-1 min-h-[6.5rem]">
                      {online ? (
                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          <Globe className="w-3 h-3 ml-1" />
                          اختبار إلكتروني
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          <Printer className="w-3 h-3 ml-1" />
                          اختبار ورقي
                        </Badge>
                      )}
                      {online && (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                          {ONLINE_MODE_LABELS[onlineMode]}
                        </Badge>
                      )}
                      {!online && (
                        <Badge variant="outline" className="bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                          <Palette className="w-3 h-3 ml-1" />
                          {tpl.name}
                        </Badge>
                      )}
                      {exam.month && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          <Calendar className="w-3 h-3 ml-1" />
                          {MONTHS[exam.month - 1]}
                        </Badge>
                      )}
                      {exam.unit && <Badge variant="outline">الوحدة: {exam.unit}</Badge>}
                      {exam.groupId && <Badge variant="outline">{getGroupName(exam.groupId)}</Badge>}
                      {exam.duration && <Badge variant="outline">{exam.duration} دقيقة</Badge>}
                      {!online && exam.showDecorations !== false && (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          <Sparkles className="w-3 h-3 ml-1" />
                          زخارف
                        </Badge>
                      )}
                      {online && (exam.allowOnline ? (
                        exam.accessMode === "public" ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            <Globe className="w-3 h-3 ml-1" />
                            مفتوح للجميع — بدون تسجيل
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            <UserCheck className="w-3 h-3 ml-1" />
                            منشور للأعضاء المسجلين
                          </Badge>
                        )
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          <EyeOff className="w-3 h-3 ml-1" />
                          مسودة غير منشورة
                        </Badge>
                      ))}
                      {online && !!exam.maxAttempts && exam.maxAttempts > 0 && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          المحاولات: {exam.maxAttempts} لكل طالب
                        </Badge>
                      )}
                      {(() => {
                        const av = examAvailability(exam)
                        if (!online || !exam.allowOnline) return null
                        return av.open ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                            <Timer className="w-3 h-3 ml-1" />
                            متاح الآن
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            <Timer className="w-3 h-3 ml-1" />
                            مغلق الآن
                          </Badge>
                        )
                      })()}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-auto pt-3 border-t border-gray-100 dark:border-gray-800">
                      <Button variant="outline" size="sm" onClick={() => previewExamHandler(exam)} className="min-w-[9rem] flex-1">
                        <Eye className="w-4 h-4" />
                        <span>معاينة</span>
                      </Button>
                      {online && exam.allowOnline && (
                        <Button
                          variant="outline"
                          size="sm"
                          title="نتائج الطلاب وتعديل الدرجات يدوياً"
                          onClick={() => setResultsExam(exam)}
                          className="h-10 w-10 shrink-0"
                        >
                          <ClipboardList className="w-4 h-4" />
                        </Button>
                      )}
                      {online && exam.allowOnline && (
                        <Button
                          variant="outline"
                          size="sm"
                          title={exam.accessMode === "public"
                            ? "نسخ رابط الاختبار — مفتوح للجميع (يُفتح بدون تسجيل)"
                            : "نسخ رابط الاختبار"}
                          onClick={() => copyExamLink(exam.id)}
                          className="h-10 w-10 shrink-0"
                        >
                          <Link2 className="w-4 h-4" />
                        </Button>
                      )}
                      {(online || exam.deliveryMode === undefined) && (
                        <Button
                          variant="outline"
                          size="sm"
                          title="لوحة تحكم الظهور والمحاولات"
                          onClick={() => openPanel(exam)}
                          className="h-10 w-10 shrink-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                        >
                          <Settings2 className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => openCreateDialog(exam)} className="h-10 w-10 shrink-0">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteExam(exam.id)}
                        className="h-10 w-10 shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {exams.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full text-center py-12">
            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-700" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">لا توجد اختبارات بعد</p>
            <Button onClick={openExamTypeDialog} className="bg-gradient-to-r from-red-500 to-rose-600">
              <Plus className="w-4 h-4" />
              <span>إنشاء أول اختبار</span>
            </Button>
          </motion.div>
        )}
      </div>

      {/* اختيار نوع الاختبار — يظهر قبل المحرر عند إنشاء اختبار جديد */}
      <Dialog open={examTypeDialogOpen} onOpenChange={setExamTypeDialogOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">اختر نوع الاختبار</DialogTitle>
            <DialogDescription>
              اختر طريقة أداء الطلاب أولاً؛ ستفتح لك واجهة مناسبة لكل نوع.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <button
              type="button"
              onClick={() => chooseExamType("offline")}
              className="group text-right rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-gray-900 p-5 transition-all hover:border-slate-500 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-lg transition-transform group-hover:scale-105">
                <Printer className="h-6 w-6" />
              </span>
              <span className="block text-lg font-extrabold text-gray-900 dark:text-white">اختبار ورقي</span>
              <span className="mt-2 block text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                الاختبار المعتاد: تكتب الأسئلة، تعاين الورقة، ثم تطبعها أو تحمّلها PDF لتوزيعها على الطلاب.
              </span>
              <span className="mt-4 inline-flex items-center rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                ورقة مطبوعة
              </span>
            </button>

            <button
              type="button"
              onClick={() => chooseExamType("online")}
              className="group text-right rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/30 p-5 transition-all hover:border-indigo-500 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25 transition-transform group-hover:scale-105">
                <Globe className="h-6 w-6" />
              </span>
              <span className="block text-lg font-extrabold text-gray-900 dark:text-white">اختبار إلكتروني</span>
              <span className="mt-2 block text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                يجيب الطلاب من بوابة الموقع؛ تضبط الإتاحة وطريقة الدخول ومفتاح التصحيح، وتصل النتائج إليك فوراً.
              </span>
              <span className="mt-4 inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                أداء إلكتروني ونتائج مباشرة
              </span>
            </button>
          </div>

          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            يمكنك حفظ الاختبار الإلكتروني كمسودة، ولن يظهر للطلاب حتى تفعّل النشر بعد استكمال الأسئلة ومفاتيح التصحيح.
          </p>
        </DialogContent>
      </Dialog>

      {/* اختيار نمط الاختبار الإلكتروني */}
      <Dialog open={onlineModeDialogOpen} onOpenChange={setOnlineModeDialogOpen}>
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">اختر نمط الاختبار الإلكتروني</DialogTitle>
            <DialogDescription>يمكنك تغييره لاحقاً ما دامت الأسئلة المتاحة متوافقة مع النمط الجديد.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-2">
            {([
              {
                key: "objective" as OnlineExamMode,
                title: "اختياري وصح وخطأ",
                lead: "تصحيح تلقائي بالكامل",
                text: "يسمح بالاختيار من متعدد وصح/خطأ فقط، وتظهر النتيجة حسب إعدادك.",
                tone: "border-emerald-200 hover:border-emerald-500 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20",
              },
              {
                key: "essay" as OnlineExamMode,
                title: "اختبار مقالي",
                lead: "تصحيح يدوي تفصيلي",
                text: "يكتب الطالب إجابته، وتمنح الدرجة والتعليق والتصحيح بعد المراجعة.",
                tone: "border-amber-200 hover:border-amber-500 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20",
              },
              {
                key: "mixed" as OnlineExamMode,
                title: "اختبار مختلط",
                lead: "تلقائي + مقالي",
                text: "اختياري وصح/خطأ مع أسئلة مقالية؛ تظهر نتيجة الجزء التلقائي وينتظر المقال المراجعة.",
                tone: "border-indigo-200 hover:border-indigo-500 bg-indigo-50/60 dark:border-indigo-900 dark:bg-indigo-950/20",
              },
            ]).map(option => (
              <button
                key={option.key}
                type="button"
                onClick={() => chooseOnlineExamMode(option.key)}
                className={`rounded-2xl border-2 p-4 text-right transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${option.tone}`}
              >
                <span className="block font-extrabold text-base text-gray-900 dark:text-white">{option.title}</span>
                <span className="block mt-1 text-sm font-bold text-indigo-700 dark:text-indigo-300">{option.lead}</span>
                <span className="block mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{option.text}</span>
              </button>
            ))}
          </div>
          <p className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
            جميع الأنماط تدعم النشر أو الإخفاء، تحديد الوقت، الأعضاء أو الجميع، عدد المحاولات، والتحكم في ظهور الإجابات والنتائج.
          </p>
        </DialogContent>
      </Dialog>

      {/* محرر الاختبار: صفحة كاملة مستقلة بصرياً، لا نافذة منبثقة */}
      {createDialogOpen && (
        <section className="fixed inset-0 z-[70] min-h-[100dvh] overflow-y-auto bg-gray-50 dark:bg-gray-950 font-arabic" dir="rtl">
          <div className="min-h-[100dvh]">
            <header className="sticky top-0 z-20 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-base sm:text-xl font-extrabold text-gray-900 dark:text-white truncate">
                      {editingExam ? "تعديل الاختبار" : "إنشاء اختبار جديد"}
                    </h1>
                    <Badge className={isOnlineForm ? "bg-indigo-600 text-white" : "bg-slate-700 text-white"}>
                      {isOnlineForm ? <Globe className="w-3 h-3 ml-1" /> : <Printer className="w-3 h-3 ml-1" />}
                      {isOnlineForm ? `إلكتروني — ${ONLINE_MODE_LABELS[examForm.onlineExamMode]}` : "ورقي"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                    {isOnlineForm
                      ? "اكتب الأسئلة واضبط النشر والتصحيح، ثم أطلقه للطلاب عندما يصبح جاهزاً."
                      : "اكتب ورقة الاختبار، ثم عاينها واطبعها أو حمّلها PDF."}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`hidden sm:inline text-xs font-bold ${
                    autoSaveState === "saving" ? "text-amber-600" : autoSaveState === "saved" ? "text-emerald-600" : "text-gray-400"
                  }`}>
                    {autoSaveState === "saving" ? "جارٍ الحفظ…" : autoSaveState === "saved" ? "✓ محفوظ تلقائياً" : ""}
                  </span>
                  <Button variant="outline" size="sm" onClick={leaveEditor} className="min-h-10">
                    <span className="hidden sm:inline">العودة للاختبارات</span>
                    <span className="sm:hidden">رجوع</span>
                  </Button>
                </div>
              </div>
              {autoSaveState !== "idle" && (
                <p className={`px-3 pb-2 text-[11px] font-bold sm:hidden ${autoSaveState === "saving" ? "text-amber-600" : "text-emerald-600"}`}>
                  {autoSaveState === "saving" ? "جارٍ حفظ التعديلات…" : "✓ تم الحفظ تلقائياً"}
                </p>
              )}
            </header>

            <main className="mx-auto max-w-6xl px-3 py-5 pb-28 sm:px-6 sm:py-7">
          <div className="space-y-7 py-2 [&_input]:min-h-11 [&_button]:min-h-10">
            {/* 1. Cascading grade → group */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">1</span>
                الصف والمجموعة
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>الصف *</Label>
                  <Select
                    value={examForm.gradeId}
                    onValueChange={(val) => setExamForm(prev => ({ ...prev, gradeId: val, groupId: "" }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="اختر الصف أولاً" />
                    </SelectTrigger>
                    <SelectContent>  <SelectItem value="__all">عام — كل الصفوف</SelectItem>
                      {grades.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>المجموعة (اختياري)</Label>
                  <Select
                    value={examForm.groupId || "all"}
                    disabled={!examForm.gradeId || examForm.gradeId === "__all"}
                    onValueChange={(val) =>
                      setExamForm(prev => ({ ...prev, groupId: val === "all" ? "" : val }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={examForm.gradeId ? "كل المجموعات" : "اختر الصف أولاً"} />
                    </SelectTrigger>
                    <SelectContent>
                      {!examForm.gradeId || examForm.gradeId === "__all" ? (
                        <SelectItem value="__none" disabled>اختر الصف أولاً</SelectItem>
                      ) : (
                        <>
                          <SelectItem value="all">كل المجموعات (للصف كله)</SelectItem>
                          {groupsOfSelectedGrade.length === 0 ? (
                            <SelectItem value="__empty" disabled>لا توجد مجموعات في هذا الصف</SelectItem>
                          ) : (
                            groupsOfSelectedGrade.map(group => (
                              <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                            ))
                          )}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-gray-400 mt-1">
                    تظهر مجموعات الصف المختار فقط — لن تظهر مجموعات صف آخر
                  </p>
                </div>
              </div>
            </section>

            {/* 2. Title / month */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">2</span>
                {isOnlineForm ? "بيانات الاختبار" : "بيانات الورقة"}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="examTitle">عنوان الاختبار *</Label>
                  <Input
                    id="examTitle"
                    placeholder="مثال: امتحان شهر أكتوبر — الوحدة الأولى"
                    value={examForm.title}
                    onChange={(e) => setExamForm(prev => ({ ...prev, title: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <Label>الشهر</Label>
                    <Select
                      value={examForm.month.toString()}
                      onValueChange={(val) => setExamForm(prev => ({ ...prev, month: parseInt(val) }))}
                    >
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((month, index) => (
                          <SelectItem key={index} value={(index + 1).toString()}>{month}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>الوحدة</Label>
                    <Input
                      placeholder="1"
                      value={examForm.unit}
                      onChange={(e) => setExamForm(prev => ({ ...prev, unit: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>المدة (د)</Label>
                    <Input
                      type="number"
                      value={examForm.duration}
                      onChange={(e) => setExamForm(prev => ({ ...prev, duration: parseInt(e.target.value) || 0 }))}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label>اسم المعلم (اختياري)</Label>
                  <Input
                    placeholder="يظهر في ترويسة الورقة"
                    value={examForm.teacherName}
                    onChange={(e) => setExamForm(prev => ({ ...prev, teacherName: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>اسم المدرسة / السنتر (اختياري)</Label>
                  <Input
                    placeholder="يظهر أعلى الورقة"
                    value={examForm.schoolName}
                    onChange={(e) => setExamForm(prev => ({ ...prev, schoolName: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
            </section>

            {/* 3. Templates — للأوف لاين فقط */}
            {!isOnlineForm && (
              <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">3</span>
                قالب الورقة (9 قوالب احترافية)
              </h3>
              <TemplatePicker
                value={examForm.templateId}
                onChange={(id) => setExamForm(prev => ({ ...prev, templateId: id }))}
              />
              <label className="flex items-center gap-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={examForm.showDecorations}
                  onChange={(e) => setExamForm(prev => ({ ...prev, showDecorations: e.target.checked }))}
                  className="w-4 h-4 accent-emerald-600"
                />
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">زخارف علمية ملوّنة حول الأسئلة</p>
                  <p className="text-xs text-gray-500">
                    ميكروسكوب وأدوات معمل وذرة ونبات… تتغيّر تلقائياً حسب الصف المختار
                    {examForm.gradeId ? ` (${selectedGradeName})` : " — اختر الصف لتحديدها"}
                  </p>
                </div>
              </label>
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300 ml-1">حجم الزخارف:</span>
                  {[24, 32, 44].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setExamForm(prev => ({ ...prev, ornamentSize: s }))}
                      className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${
                        examForm.ornamentSize === s
                          ? "border-indigo-500 bg-indigo-600 text-white"
                          : "border-gray-300 bg-white text-gray-600 hover:border-indigo-400 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700"
                      }`}
                    >
                      {s === 24 ? "صغير" : s === 32 ? "متوسط" : "كبير"}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300 ml-1">الكثافة:</span>
                  {(["low", "medium", "high"] as OrnamentDensity[]).map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setExamForm(prev => ({ ...prev, ornamentDensity: d }))}
                      className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${
                        examForm.ornamentDensity === d
                          ? "border-indigo-500 bg-indigo-600 text-white"
                          : "border-gray-300 bg-white text-gray-600 hover:border-indigo-400 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700"
                      }`}
                    >
                      {d === "low" ? "خفيف" : d === "medium" ? "متوسط" : "كثيف"}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300 ml-1">الشفافية:</span>
                  {ORNAMENT_OPACITY_CHOICES.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      title={`شفافية الزخارف ${Math.round(o.value * 100)}% — حتى لا تغطي نص الأسئلة`}
                      onClick={() => setExamForm(prev => ({ ...prev, ornamentOpacity: o.value }))}
                      className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${
                        Math.abs((examForm.ornamentOpacity ?? 0) - o.value) < 0.005
                          ? "border-indigo-500 bg-indigo-600 text-white"
                          : "border-gray-300 bg-white text-gray-600 hover:border-indigo-400 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                الزخارف شفافة وخلف الكلام دائماً (لا تغطي نص السؤال ولا رأسه ولا درجة السؤال)،
                وتبقى شفافتها محفوظة مع الاختبار في الطباعة وفي تصدير PDF.
              </p>
              </section>
            )}

            {/* إعدادات اختبار أونلاين — مسودة أو منشور للطلاب */}
            {isOnlineForm && (
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">3</span>
                  اختبار إلكتروني
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  اضبط طريقة الدخول والإتاحة ومفاتيح التصحيح. يمكنك حفظه كمسودة ثم نشره عندما تكتمل بياناته.
                </p>

                <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-gray-900 p-3">
                  <p className="text-sm font-bold text-gray-900 dark:text-white mb-2">نمط الاختبار الإلكتروني</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { key: "objective" as OnlineExamMode, title: "اختياري وصح وخطأ", desc: "تصحيح تلقائي بالكامل" },
                      { key: "essay" as OnlineExamMode, title: "مقالي", desc: "تصحيح يدوي بعد التسليم" },
                      { key: "mixed" as OnlineExamMode, title: "مختلط", desc: "تلقائي + مقالي" },
                    ]).map(option => {
                      const active = examForm.onlineExamMode === option.key
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => changeOnlineExamMode(option.key)}
                          className={`rounded-lg border-2 px-3 py-2 text-right transition-colors ${
                            active
                              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                              : "border-gray-200 dark:border-gray-700 hover:border-indigo-300"
                          }`}
                        >
                          <span className="block text-xs font-extrabold text-gray-900 dark:text-white">{option.title}</span>
                          <span className="block text-[11px] text-gray-500 mt-0.5">{option.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <label className="flex items-start gap-3 p-3 rounded-xl border-2 border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={examForm.allowOnline}
                  onChange={(e) => setExamForm(prev => ({ ...prev, allowOnline: e.target.checked }))}
                  className="w-4 h-4 accent-indigo-600 mt-1"
                />
                <Globe className="w-4 h-4 text-indigo-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">نشر الاختبار للطلاب على الموقع</p>
                  <p className="text-xs text-gray-500">
                    {examForm.allowOnline
                      ? "سيظهر للطلاب وفق إعدادات الدخول والإتاحة أدناه بعد الحفظ"
                      : "مسودة خاصة بك — يمكنك استكمالها الآن ثم نشرها عندما تصبح جاهزة"}
                  </p>
                </div>
              </label>

              <div className={`rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${
                onlineReadiness.ready
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
              }`}>
                <p className="font-extrabold">
                  {onlineReadiness.ready ? "✓ الاختبار جاهز للنشر" : "أكمل هذه العناصر قبل النشر"}
                </p>
                {onlineReadiness.ready ? (
                  <p className="mt-1">{onlineReadiness.notes.join(" • ") || "الأسئلة ومفاتيح التصحيح مكتملة"}</p>
                ) : (
                  <ul className="mt-1 list-disc pr-4 space-y-0.5">
                    {onlineReadiness.issues.slice(0, 3).map(issue => <li key={issue}>{issue}</li>)}
                    {onlineReadiness.issues.length > 3 && <li>و{onlineReadiness.issues.length - 3} عناصر أخرى</li>}
                  </ul>
                )}
              </div>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={examForm.autoHonorBoard}
                    onChange={(e) => setExamForm(prev => ({ ...prev, autoHonorBoard: e.target.checked }))}
                    className="w-4 h-4 accent-amber-600 mt-1"
                  />
                  <Sparkles className="w-4 h-4 text-amber-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">إضافة المتفوقين تلقائياً إلى لوحة الشرف</p>
                    <p className="text-xs text-gray-500 mb-2">اختياري حسب درجة الاختبار الإلكتروني</p>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">الحد الأدنى للنسبة %</Label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={examForm.honorMinPercent}
                        onChange={(e) => setExamForm(prev => ({ ...prev, honorMinPercent: Math.min(100, Math.max(1, parseInt(e.target.value) || 100)) }))}
                        className="h-8 w-20"
                      />
                    </div>
                  </div>
                </label>

              <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-4">
                  {/* من يستطيع فتح الاختبار */}
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">من يستطيع فتح الاختبار؟</p>
                    <div className="grid grid-cols-1 gap-2">
                      {([
                        {
                          key: "members" as ExamAccessMode,
                          icon: <Users className="w-4 h-4" />,
                          label: "للأعضاء المسجلين فقط",
                          desc: "يظهر للطالب في بوابته حسب صفه — اسمه وصفه ومجموعته تُعبأ تلقائياً من حسابه ولا يملأ أي بيانات، يجيب عن الأسئلة فقط",
                        },
                        {
                          key: "public" as ExamAccessMode,
                          icon: <Globe className="w-4 h-4" />,
                          label: "مفتوح لأي أحد بدون تسجيل",
                          desc: "يظهر في لوحة الإعلانات (الصفحة الرئيسية) ويمكنك نشر رابطه — يُدخل الزائر اسمه ورقم هاتفه (إجباريان)، والصف ثابت من الاختبار ويختار مجموعته من مجموعات صفه المتاحة فقط، ثم يبدأ",
                        },
                      ]).map(opt => {
                        const on = examForm.accessMode === opt.key
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setExamForm(prev => ({ ...prev, accessMode: opt.key }))}
                            className={`text-right rounded-xl border-2 p-3 transition-all bg-white dark:bg-gray-900 ${
                              on
                                ? "border-indigo-500 shadow"
                                : "border-gray-200 dark:border-gray-700"
                            }`}
                          >
                            <span className="flex items-center gap-2 font-bold text-sm text-gray-900 dark:text-white">
                              <span className={on ? "text-indigo-600" : "text-gray-400"}>{opt.icon}</span>
                              {opt.label}
                              {on && <span className="mr-auto text-[11px] text-indigo-600 shrink-0">✓ محدد</span>}
                            </span>
                            <span className="block text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* الإتاحة الزمنية */}
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">إتاحة الاختبار</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {([
                        { key: 'always' as const, label: 'مفتوح دائماً' },
                        { key: 'scheduled' as const, label: 'فترة محددة' },
                      ]).map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setExamForm(prev => ({ ...prev, availabilityMode: opt.key }))}
                          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                            examForm.availabilityMode === opt.key
                              ? 'bg-indigo-600 text-white shadow'
                              : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {examForm.availabilityMode === 'scheduled' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">يُفتح في</Label>
                          <Input
                            type="datetime-local"
                            value={examForm.availableFrom}
                            onChange={(e) => setExamForm(prev => ({ ...prev, availableFrom: e.target.value }))}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">يُغلق في</Label>
                          <Input
                            type="datetime-local"
                            value={examForm.availableUntil}
                            onChange={(e) => setExamForm(prev => ({ ...prev, availableUntil: e.target.value }))}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* المجموعات المستهدفة */}
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">المجموعات المستهدفة</p>
                    <p className="text-xs text-gray-500 mb-2">اتركها فارغة ليظهر الاختبار لكل مجموعات الصف — العزل تام: لا يراه طالب من صف آخر إطلاقاً</p>
                    <div className="flex flex-wrap gap-2">
                      {groupsOfSelectedGrade.map(g => {
                        const active = examForm.targetGroupIds.includes(g.id)
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => setExamForm(prev => ({
                              ...prev,
                              targetGroupIds: active
                                ? prev.targetGroupIds.filter(id => id !== g.id)
                                : [...prev.targetGroupIds, g.id],
                            }))}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                              active
                                ? 'bg-emerald-600 text-white shadow'
                                : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {active ? '✓ ' : ''}{g.name}
                          </button>
                        )
                      })}
                      {examForm.gradeId === "__all" && (
                        <p className="text-xs text-emerald-600">اختبار عام — يظهر لطلاب كل الصفوف ولا تحتاج لتحديد مجموعات</p>
                      )}
                      {groupsOfSelectedGrade.length === 0 && examForm.gradeId !== "__all" && (
                        <p className="text-xs text-amber-600">اختر الصف أولاً لعرض مجموعاته</p>
                      )}
                    </div>
                  </div>

                  {/* إظهار الإجابة الصحيحة */}
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">إظهار الإجابة الصحيحة للطالب</p>
                    <div className="flex flex-wrap gap-2">
                      {([
                        { key: 'never' as const, label: 'مغلقة نهائياً', desc: 'لا يرى الطالب الإجابات أبداً' },
                        { key: 'afterEach' as const, label: 'بعد الإجابة على السؤال', desc: 'يظهر الصحيح/الخطأ فوراً' },
                        { key: 'atEnd' as const, label: 'في نهاية الاختبار', desc: 'مراجعة كاملة بعد التسليم' },
                      ]).map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setExamForm(prev => ({ ...prev, answerVisibility: opt.key }))}
                          title={opt.desc}
                          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                            examForm.answerVisibility === opt.key
                              ? 'bg-purple-600 text-white shadow'
                              : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {examForm.answerVisibility === 'never' && 'الأكثر أماناً — لا يمكن للطالب معرفة الإجابات بأي شكل'}
                      {examForm.answerVisibility === 'afterEach' && 'تنبيه: الإجابات الصحيحة تكون ظاهرة أثناء الاختبار نفسه'}
                      {examForm.answerVisibility === 'atEnd' && 'آمن نسبياً — المراجعة تظهر بعد تسليم الاختبار فقط'}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* 4. Add questions */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">4</span>
                إضافة سؤال رئيسي
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {questionButtons.map((btn, i) => {
                  const meta = getQuestionTypeMeta(btn.type)
                  return (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      onClick={() => addQuestion(btn.type, btn.reasoningType)}
                      className={`text-xs justify-start border-2 ${meta.border}`}
                    >
                      <span
                        className="inline-flex items-center justify-center min-w-[1.6rem] h-5 rounded text-[10px] font-extrabold text-white ml-1"
                        style={{ background: meta.accent }}
                      >
                        {meta.paperMark}
                      </span>
                      <span>{isOnlineForm && btn.type === 8 ? "سؤال مقالي" : btn.label}</span>
                    </Button>
                  )
                })}
              </div>
              {isOnlineForm && (
                <p className="text-xs text-indigo-700 dark:text-indigo-300 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 px-3 py-2">
                  نمط {ONLINE_MODE_LABELS[examForm.onlineExamMode]}: تظهر لك أنواع الأسئلة المعتمدة لهذا النمط فقط.
                </p>
              )}
            </section>

            {/* Questions editor */}
            <div className="space-y-6">
              {examForm.questions.map((question, qIndex) => {
                const meta = getQuestionTypeMeta(question.questionType)
                const expanded = expandedQuestions.includes(question.id)
                return (
                  <React.Fragment key={question.id}>
                    {qIndex > 0 && (
                      <div className="flex items-center gap-3 px-2">
                        <div className="flex-1 h-px bg-gradient-to-l from-transparent via-gray-300 dark:via-gray-700 to-transparent" />
                        <span className="text-[11px] text-gray-400 flex items-center gap-1">
                          <ScienceIcon kind="atom" size={12} />
                          فاصل السؤال
                        </span>
                        <div className="flex-1 h-px bg-gradient-to-l from-transparent via-gray-300 dark:via-gray-700 to-transparent" />
                      </div>
                    )}
                    <Card className={`border-2 ${meta.border} overflow-hidden`}>
                      <CardHeader
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors py-3"
                        onClick={() => toggleQuestion(question.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span
                              className="inline-flex items-center justify-center min-w-[2.6rem] h-7 px-2 rounded-md text-[11px] font-extrabold text-white"
                              style={{ background: meta.accent }}
                            >
                              {meta.paperMark}
                            </span>
                            <Badge className={`bg-gradient-to-br ${meta.color}`}>
                              السؤال {ARABIC_ORDINALS[qIndex] || qIndex + 1}
                            </Badge>
                            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                              {getQuestionHeader(question)}
                            </span>
                            <span className="text-xs text-gray-500">
                              ({question.subQuestions.length} فرعي)
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                              onClick={(e) => {
                                e.stopPropagation()
                                removeQuestion(question.id)
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </div>
                        </div>
                      </CardHeader>

                      {expanded && (
                        <CardContent className="space-y-4 pt-0">
                          {/* رأس / عنوان السؤال — قابل للتعديل بحرية */}
                          <div className="space-y-1.5 pb-2 border-b border-gray-200 dark:border-gray-800">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                                {question.questionType === 8 ? "عنوان / رأس السؤال المخصص *" : "رأس السؤال (يمكنك تعديل نصه):"}
                              </Label>
                              {question.questionType === 4 && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-gray-500">الصياغة:</span>
                                  <Select
                                    value={question.reasoningType || "علل"}
                                    onValueChange={(val) => {
                                      updateReasoningType(question.id, val)
                                      setExamForm(prev => ({
                                        ...prev,
                                        questions: prev.questions.map(q =>
                                          q.id === question.id
                                            ? {
                                                ...q,
                                                headerText:
                                                  val === "بم تفسر"
                                                    ? "بم تفسر:"
                                                    : val === "اذكر أهمية"
                                                    ? "اذكر أهمية:"
                                                    : "علل لما يأتي:",
                                              }
                                            : q
                                        ),
                                      }))
                                    }}
                                  >
                                    <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="علل">علل لما يأتي</SelectItem>
                                      <SelectItem value="بم تفسر">بم تفسر</SelectItem>
                                      <SelectItem value="اذكر أهمية">اذكر أهمية</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                            <Input
                              value={question.headerText}
                              placeholder={getQuestionHeader(question)}
                              onChange={(e) => {
                                const val = e.target.value
                                setExamForm(prev => ({
                                  ...prev,
                                  questions: prev.questions.map(q =>
                                    q.id === question.id ? { ...q, headerText: val } : q
                                  ),
                                }))
                              }}
                              className="h-9 text-sm"
                            />
                            {isOnlineForm && question.questionType === 8 && (
                              <div className="pt-1">
                                <Label className="text-xs font-bold text-gray-700 dark:text-gray-300">وسم توجيهي اختياري للمقال</Label>
                                <Input
                                  value={question.essayLabel || ""}
                                  placeholder="مثل: علل، فسر، قارن، أو اتركه عاماً"
                                  onChange={(e) => {
                                    const essayLabel = e.target.value
                                    setExamForm(previous => ({
                                      ...previous,
                                      questions: previous.questions.map(item =>
                                        item.id === question.id ? { ...item, essayLabel } : item
                                      ),
                                    }))
                                  }}
                                  className="mt-1 h-9 text-sm"
                                />
                                <p className="mt-1 text-[11px] text-gray-500">هذا مجرد وسم للسؤال المقالي الموحد، وليس نوع سؤال جديداً.</p>
                              </div>
                            )}
                          </div>

                          <div className="space-y-4">
                            {question.subQuestions.map((sq, index) => (
                              <div key={sq.id}>
                                {index > 0 && (
                                  <div className="flex items-center gap-2 my-2">
                                    <div className="flex-1 border-t-2 border-dashed" style={{ borderColor: `${meta.accent}55` }} />
                                    <span className="text-[10px] font-bold" style={{ color: meta.accent }}>
                                      {index + 1}
                                    </span>
                                    <div className="flex-1 border-t-2 border-dashed" style={{ borderColor: `${meta.accent}55` }} />
                                  </div>
                                )}
                                <div
                                  className="rounded-xl p-3 space-y-3"
                                  style={{ background: `${meta.accent}0d`, border: `1px solid ${meta.accent}33` }}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <Badge variant="outline" className={`text-xs ${meta.badge}`}>
                                      السؤال الفرعي {index + 1}
                                    </Badge>
                                    <div className="flex items-center gap-2">
                                      <Label className="text-[11px] text-gray-500">الدرجة</Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        value={sq.marks || 1}
                                        onChange={(e) => updateSubQuestion(question.id, sq.id, "marks", parseInt(e.target.value) || 1)}
                                        className="h-7 w-16 text-sm"
                                      />
                                      {question.subQuestions.length > 1 && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                                          onClick={() => removeSubQuestion(question.id, sq.id)}
                                        >
                                          <X className="w-3 h-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>

                                  {/* 1. اختر الإجابة الصحيحة */}
                                  {question.questionType === 1 && (
                                    <>
                                      <div>
                                        <Label className="text-xs">نص السؤال</Label>
                                        <Input
                                          placeholder="مثال: القمر يدور حول"
                                          value={sq.questionText}
                                          onChange={(e) => updateSubQuestion(question.id, sq.id, "questionText", e.target.value)}
                                          className="mt-1"
                                        />
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {sq.choices?.map((choice) => (
                                          <div key={choice.id} className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-gray-500 w-4 shrink-0">{choice.choiceKey} -</span>
                                            <Input
                                              placeholder={`الخيار ${choice.choiceKey}`}
                                              value={choice.choiceText}
                                              onChange={(e) => updateChoice(question.id, sq.id, choice.id, e.target.value)}
                                              className="h-11 sm:h-8 text-sm"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                      {isOnlineForm && (
                                        <div className="flex items-center gap-2">
                                          <Label className="text-xs shrink-0">مفتاح التصحيح:</Label>
                                          <Select
                                            value={sq.choices?.find(c => c.isCorrect)?.id}
                                            onValueChange={(val) => setCorrectChoice(question.id, sq.id, val)}
                                          >
                                            <SelectTrigger className="w-56 h-8"><SelectValue placeholder="حدد الإجابة الصحيحة" /></SelectTrigger>
                                            <SelectContent>
                                              {sq.choices?.map(c => (
                                                <SelectItem key={c.id} value={c.id}>
                                                  {c.choiceKey} - {c.choiceText || `الخيار ${c.choiceKey}`}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {/* 2. أكمل */}
                                  {question.questionType === 2 && sq.parts && (
                                    <>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <div>
                                          <Label className="text-xs">الجملة الأولى</Label>
                                          <Input
                                            placeholder="مثال: القمر يدور حول"
                                            value={sq.parts[0]?.partText || ""}
                                            onChange={(e) => updatePartText(question.id, sq.id, 1, e.target.value)}
                                            className="mt-1 h-8 text-sm"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs">الجملة الثانية</Label>
                                          <Input
                                            placeholder="مثال: الأرض"
                                            value={sq.parts[1]?.partText || ""}
                                            onChange={(e) => updatePartText(question.id, sq.id, 2, e.target.value)}
                                            className="mt-1 h-8 text-sm"
                                          />
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Label className="text-xs shrink-0">موضع الفراغ:</Label>
                                        <Select
                                          value={sq.parts[1]?.blankPosition || "between"}
                                          onValueChange={(val) => updateBlankPosition(question.id, sq.id, val as "between" | "after")}
                                        >
                                          <SelectTrigger className="w-56 h-8"><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="between">في منتصف الجملتين</SelectItem>
                                            <SelectItem value="after">في نهاية الجملة</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <p className="text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 rounded-md p-2 border border-gray-100 dark:border-gray-800">
                                        {renderCompletePreview(sq)}
                                      </p>
                                      {isOnlineForm && (
                                        <div>
                                          <Label className="text-xs">مفتاح التصحيح</Label>
                                          <Input
                                            placeholder="الكلمة أو الجملة الناقصة"
                                            value={sq.correctAnswer || ""}
                                            onChange={(e) => updateSubQuestion(question.id, sq.id, "correctAnswer", e.target.value)}
                                            className="mt-1 h-8 text-sm"
                                          />
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {/* 3. صح أو خطأ */}
                                  {question.questionType === 3 && (
                                    <>
                                      <div>
                                        <Label className="text-xs">نص العبارة (سيُضاف (   ) في نهايتها تلقائياً)</Label>
                                        <Input
                                          placeholder="مثال: القمر يدور حول الأرض"
                                          value={sq.questionText}
                                          onChange={(e) => updateSubQuestion(question.id, sq.id, "questionText", e.target.value)}
                                          className="mt-1"
                                        />
                                      </div>
                                      {isOnlineForm && (
                                        <div className="flex items-center gap-2">
                                          <Label className="text-xs shrink-0">مفتاح التصحيح:</Label>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant={sq.isTrue === true ? "default" : "outline"}
                                            onClick={() => updateSubQuestion(question.id, sq.id, "isTrue", true)}
                                          >
                                            صح
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant={sq.isTrue === false ? "default" : "outline"}
                                            onClick={() => updateSubQuestion(question.id, sq.id, "isTrue", false)}
                                          >
                                            خطأ
                                          </Button>
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {/* 4 و 6 و 7 و 8: علل / المصطلح العلمي / ما المقصود / سؤال حر */}
                                  {(question.questionType === 4 || question.questionType === 6 || question.questionType === 7 || question.questionType === 8) && (
                                    <>
                                      <div>
                                        <Label className="text-xs">
                                          {question.questionType === 6
                                            ? "نص العبارة / المفهوم العلمي"
                                            : question.questionType === 7
                                            ? "المصطلح أو المفهوم المراد تعريفه"
                                            : question.questionType === 8
                                            ? "نص السؤال الفرعي"
                                            : "نص العبارة"}
                                        </Label>
                                        <Input
                                          placeholder={
                                            question.questionType === 6
                                              ? "مثال: المسافة المقطوعة خلال وحدة الزمن"
                                              : question.questionType === 7
                                              ? "مثال: السرعة المتجهة"
                                              : question.questionType === 8
                                              ? "مثال: قارن بين التكاثر الجنسي واللاجنسي من حيث..."
                                              : "مثال: الشروق يكون من الشرق"
                                          }
                                          value={sq.questionText}
                                          onChange={(e) => updateSubQuestion(question.id, sq.id, "questionText", e.target.value)}
                                          className="mt-1"
                                        />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Label className="text-xs shrink-0">سطور الإجابة (النقاط):</Label>
                                        <Select
                                          value={(sq.answerLines ?? 1).toString()}
                                          onValueChange={(val) => updateSubQuestion(question.id, sq.id, "answerLines", parseInt(val))}
                                        >
                                          <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="1">سطر واحد (افتراضي)</SelectItem>
                                            <SelectItem value="2">سطران</SelectItem>
                                            <SelectItem value="3">3 أسطر</SelectItem>
                                            <SelectItem value="4">4 أسطر</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      {isOnlineForm && (
                                        <div>
                                          <Label className="text-xs">
                                            {question.questionType === 4
                                              ? "نموذج إجابة (اختياري — للمراجعة اليدوية)"
                                              : question.questionType === 8
                                              ? "مفتاح التصحيح (اختياري؛ اتركه فارغاً للمراجعة اليدوية)"
                                              : "مفتاح التصحيح"}
                                          </Label>
                                          <Input
                                            placeholder={
                                              question.questionType === 6
                                                ? "المصطلح العلمي الصحيح (مثال: السرعة)"
                                                : question.questionType === 7
                                                ? "التعريف النموذجي"
                                                : question.questionType === 4
                                                ? "إجابة استرشادية للمراجعة اليدوية"
                                                : "الإجابة النموذجية"
                                            }
                                            value={sq.correctAnswer || ""}
                                            onChange={(e) => updateSubQuestion(question.id, sq.id, "correctAnswer", e.target.value)}
                                            className="mt-1 h-8 text-sm"
                                          />
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {/* 5. صوب ما تحته خط — نظام تفاعلي حديث باختيار الكلمات بالضغط المباشر */}
                                  {question.questionType === 5 && (() => {
                                    const words = (sq.questionText || "").trim().split(/\s+/).filter(Boolean)
                                    const currentCorr = sq.corrections?.[0]
                                    const startIdx = currentCorr && currentCorr.wordPosition > 0 ? currentCorr.wordPosition - 1 : -1
                                    const count = currentCorr?.wordCount && currentCorr.wordCount > 0 ? currentCorr.wordCount : (startIdx >= 0 ? 1 : 0)

                                    const toggleWord = (wi: number) => {
                                      if (startIdx === -1 || count === 0) {
                                        updateCorrectionRange(question.id, sq.id, wi + 1, 1)
                                      } else if (wi >= startIdx && wi < startIdx + count) {
                                        if (count === 1) {
                                          updateCorrectionRange(question.id, sq.id, 0, 0)
                                        } else if (wi === startIdx) {
                                          updateCorrectionRange(question.id, sq.id, startIdx + 2, count - 1)
                                        } else if (wi === startIdx + count - 1) {
                                          updateCorrectionRange(question.id, sq.id, startIdx + 1, count - 1)
                                        } else {
                                          updateCorrectionRange(question.id, sq.id, wi + 1, 1)
                                        }
                                      } else {
                                        const newStart = Math.min(startIdx, wi)
                                        const newEnd = Math.max(startIdx + count - 1, wi)
                                        updateCorrectionRange(question.id, sq.id, newStart + 1, newEnd - newStart + 1)
                                      }
                                    }

                                    return (
                                      <>
                                        <div>
                                          <Label className="text-xs">
                                            نص الجملة <span className="text-rose-600 font-normal dark:text-rose-400">(اكتب الجملة ثم اضغط مباشرة على الكلمة المراد وضع خط تحتها)</span>:
                                          </Label>
                                          <Input
                                            placeholder="مثال: الشمس تشرق من الغرب"
                                            value={sq.questionText}
                                            onChange={(e) => updateSubQuestion(question.id, sq.id, "questionText", e.target.value)}
                                            className="mt-1"
                                          />
                                        </div>

                                        {words.length > 0 && (
                                          <div className="p-3 bg-white dark:bg-gray-900 rounded-xl border border-rose-200 dark:border-rose-900/60 space-y-2">
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                                                👇 اضغط على الكلمة / الكلمات لوضع خط تحتها:
                                              </span>
                                              {startIdx >= 0 && (
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-6 text-[11px] text-gray-500 hover:text-rose-600 px-2"
                                                  onClick={() => updateCorrectionRange(question.id, sq.id, 0, 0)}
                                                >
                                                  إلغاء التحديد
                                                </Button>
                                              )}
                                            </div>

                                            <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 dark:bg-gray-800/60 rounded-lg">
                                              {words.map((word, wi) => {
                                                const isUnderlined = startIdx >= 0 && wi >= startIdx && wi < startIdx + count
                                                return (
                                                  <button
                                                    key={wi}
                                                    type="button"
                                                    onClick={() => toggleWord(wi)}
                                                    className={`px-3 py-1 rounded-md text-sm transition-all cursor-pointer select-none ${
                                                      isUnderlined
                                                        ? "bg-rose-600 text-white font-bold underline decoration-2 underline-offset-4 shadow-sm ring-2 ring-rose-400"
                                                        : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-rose-50 dark:hover:bg-rose-950/60 border border-gray-200 dark:border-gray-700"
                                                    }`}
                                                  >
                                                    {word}
                                                  </button>
                                                )
                                              })}
                                            </div>

                                            {startIdx >= 0 ? (
                                              <div className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5 rounded-md">
                                                <span className="font-bold">المحدد تحته خط:</span>
                                                <span className="font-extrabold underline decoration-rose-500 underline-offset-4">
                                                  {words.slice(startIdx, startIdx + count).join(" ")}
                                                </span>
                                              </div>
                                            ) : (
                                              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                                💡 اضغط على الكلمة المراد وضع خط تحتها ليراها الطالب بخط سفلي في ورقة الامتحان.
                                              </p>
                                            )}
                                          </div>
                                        )}

                                        {isOnlineForm && (
                                          <div>
                                            <Label className="text-xs">مفتاح التصحيح</Label>
                                            <Input
                                              placeholder="الكلمة الصحيحة بدل ما تحته خط"
                                              value={sq.corrections?.[0]?.correctAnswer || ""}
                                              onChange={(e) => {
                                                const val = e.target.value
                                                setExamForm(prev => ({
                                                  ...prev,
                                                  questions: prev.questions.map(q =>
                                                    q.id !== question.id ? q : {
                                                      ...q,
                                                      subQuestions: q.subQuestions.map(s =>
                                                        s.id !== sq.id || !s.corrections ? s : {
                                                          ...s,
                                                          corrections: s.corrections.map(c => ({ ...c, correctAnswer: val })),
                                                        }
                                                      ),
                                                    }
                                                  ),
                                                }))
                                              }}
                                              className="mt-1 h-8 text-sm"
                                            />
                                          </div>
                                        )}
                                      </>
                                    )
                                  })()}
                                </div>
                              </div>
                            ))}

                            <Button variant="outline" size="sm" onClick={() => addSubQuestion(question.id)} className="w-full">
                              <Plus className="w-4 h-4" />
                              <span>إضافة سؤال فرعي جديد ({question.subQuestions.length + 1})</span>
                            </Button>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  </React.Fragment>
                )
              })}
            </div>

            {examForm.questions.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>لم تتم إضافة أي أسئلة بعد</p>
                <p className="text-xs mt-1">اختر نوع السؤال من الأزرار أعلاه وسيتم تجهيز 4 أسئلة فرعية تحت رأسه</p>
              </div>
            )}

            {examForm.questions.length > 0 && (
              <p className="text-xs text-gray-400 text-center">
                إجمالي: {examForm.questions.length} سؤال رئيسي • {totalSubQuestions} فرعي • {liveTotalMarks} درجة
              </p>
            )}
          </div>
            </main>
            <footer className="sticky bottom-0 z-20 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-6">
                <p className="hidden sm:block text-xs text-gray-500">
                  تُحفظ الأسئلة والتعديلات تلقائياً أثناء الكتابة.
                </p>
                <div className="mr-auto flex items-center gap-2">
                  <Button variant="outline" onClick={leaveEditor}>حفظ كمسودة والعودة</Button>
                  <Button
                    onClick={saveExam}
                    className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700"
                  >
                    {editingExam ? "حفظ التعديلات والعودة" : "حفظ الاختبار والعودة"}
                  </Button>
                </div>
              </div>
            </footer>
          </div>
        </section>
      )}

      {/* Preview */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="w-[96vw] max-w-4xl max-h-[92vh] overflow-y-auto p-3 sm:p-6 mx-auto">
          <DialogHeader className="no-print">
            <DialogTitle>معاينة الورقة — A4</DialogTitle>
          </DialogHeader>
          {previewExam && (
            <>
              <div className="no-print w-full max-w-full mx-auto mb-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300">تبديل القالب — شاهد الشكل قبل الطباعة أو التصدير:</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-indigo-600"
                        checked={previewDecorations}
                        onChange={e => setPreviewDecorations(e.target.checked)}
                      />
                      الزخارف
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-indigo-600"
                        checked={previewCompact}
                        onChange={e => {
                          setPreviewCompact(e.target.checked)
                          setPreviewMaxPages(e.target.checked ? 2 : undefined)
                        }}
                      />
                      صفحتان فقط (ضغط)
                    </label>
                  </div>
                </div>
                <TemplateSwitcher value={previewTemplate} onChange={setPreviewTemplate} />
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 ml-1">حجم الزخارف:</span>
                    {[24, 32, 44].map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setPreviewOrnamentSize(s)}
                        className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${
                          previewOrnamentSize === s
                            ? "border-indigo-500 bg-indigo-600 text-white"
                            : "border-gray-300 bg-white text-gray-600 hover:border-indigo-400 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700"
                        }`}
                      >
                        {s === 24 ? "صغير" : s === 32 ? "متوسط" : "كبير"}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 ml-1">الكثافة:</span>
                    {(["low", "medium", "high"] as OrnamentDensity[]).map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPreviewOrnamentDensity(d)}
                        className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${
                          previewOrnamentDensity === d
                            ? "border-indigo-500 bg-indigo-600 text-white"
                            : "border-gray-300 bg-white text-gray-600 hover:border-indigo-400 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700"
                        }`}
                      >
                        {d === "low" ? "خفيف" : d === "medium" ? "متوسط" : "كثيف"}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 ml-1">الشفافية:</span>
                    {ORNAMENT_OPACITY_CHOICES.map(o => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setPreviewOrnamentOpacity(o.value)}
                        className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${
                          Math.abs(previewOrnamentOpacity - o.value) < 0.005
                            ? "border-indigo-500 bg-indigo-600 text-white"
                            : "border-gray-300 bg-white text-gray-600 hover:border-indigo-400 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div id="exam-preview-content" className="w-full max-w-full mx-auto bg-white dark:bg-gray-950 rounded-lg overflow-hidden py-1">
                <ExamPaper
                  exam={previewExam}
                  gradeName={getGradeName(previewExam.gradeId)}
                  groupName={previewExam.groupId ? getGroupName(previewExam.groupId) : undefined}
                  templateId={previewTemplate}
                  showDecorations={previewDecorations}
                  compact={previewCompact}
                  maxPages={previewMaxPages}
                  ornamentSize={previewOrnamentSize}
                  ornamentDensity={previewOrnamentDensity}
                  ornamentOpacity={previewOrnamentOpacity}
                />
              </div>
            </>
          )}
          <DialogFooter className="no-print gap-2">
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>إغلاق</Button>
            <Button
              variant="outline"
              onClick={() => {
                try {
                  printElement("exam-preview-content")
                } catch {
                  toast.error("تعذر فتح نافذة الطباعة")
                }
              }}
              className="border-indigo-500 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة A4</span>
            </Button>
            <Button
              onClick={async () => {
                try {
                  await exportToPDF(
                    "exam-preview-content",
                    `${previewExam?.title || "اختبار"}-${new Date().toLocaleDateString("ar-EG")}`,
                    { orientation: "portrait" }
                  )
                  toast.success("تم تحميل الاختبار بنجاح")
                } catch (err: any) {
                  toast.error(`حدث خطأ أثناء التصدير: ${err?.message || err}`)
                }
              }}
              className="bg-gradient-to-r from-purple-500 to-pink-600"
            >
              <Download className="w-4 h-4" />
              <span>تحميل PDF</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== نتائج الاختبار: قائمة المحاولات + التعديل اليدوي للدرجات ===== */}
      <Dialog open={!!resultsExam} onOpenChange={(o) => !o && setResultsExam(null)}>
        <DialogContent className="w-[96vw] max-w-3xl max-h-[88vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <ClipboardList className="w-6 h-6 text-indigo-600" />
              نتائج: {resultsExam?.title}
            </DialogTitle>
            <DialogDescription>
              افتح مراجعة المحاولة لتصحيح كل إجابة، ومنح كامل أو نصف الدرجة أو الصفر، وإضافة تعليق أو تصحيح للطالب.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 px-3 py-2">
            <p className="text-xs text-indigo-800 dark:text-indigo-200">تُعرض التعليقات ودرجات المقال للطالب فقط بعد إطلاق النتيجة.</p>
            <Button size="sm" variant="outline" onClick={releaseAllReviewed} className="shrink-0 border-indigo-300 text-indigo-700">
              إطلاق كل النتائج المكتملة
            </Button>
          </div>

          <div className="space-y-2">
            {resultsAttempts.length === 0 ? (
              <p className="text-center text-gray-500 py-8">لا توجد محاولات بعد — تظهر هنا فور أداء الطلاب للاختبار</p>
            ) : (
              resultsAttempts.slice().reverse().map(a => {
                // resultsVersion يعيد رسم القائمة فور حفظ مراجعة أو تعليق.
                void resultsVersion
                const summary = resultsExam ? summarizeAttemptReview(resultsExam, a.answers) : null
                const finalScore = effectiveAttemptScore(a)
                const overridden = !!a.manualOverride
                const pending = summary?.pendingManualCount || 0
                const statusLabel = a.resultReleasedAt
                  ? "النتيجة مُطلقة"
                  : pending > 0
                  ? `بانتظار تصحيح ${pending} إجابة`
                  : "مراجعة مكتملة — بانتظار الإطلاق"
                return (
                  <div key={a.id} className={`rounded-xl border p-3 ${overridden ? "border-purple-300 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20" : "border-gray-200 dark:border-gray-800"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">
                          {a.studentName}
                          {!a.studentId && (
                            <Badge className="mr-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">زائر — بلا حساب</Badge>
                          )}
                          {overridden && (
                            <Badge className="mr-2 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">درجة معدلة يدوياً</Badge>
                          )}
                          <Badge className={`mr-2 ${
                            a.resultReleasedAt
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : pending > 0
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                          }`}>{statusLabel}</Badge>
                        </p>
                        {summary && (
                          <p className="text-[11px] text-gray-500 mt-1">
                            تلقائي: {summary.autoScore} / {summary.autoTotal} • يدوي: {summary.manualScore} / {summary.manualTotal}
                          </p>
                        )}
                        <p className="text-xs text-gray-400">
                          {a.submittedAt ? new Date(a.submittedAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : ""}
                          {a.durationSeconds ? ` — مدة ${Math.round(a.durationSeconds / 60)} دقيقة` : ""}
                        </p>
                        {a.phone && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5" dir="rtl">
                            <Phone className="w-3 h-3" />
                            <span dir="ltr">{a.phone}</span>
                          </p>
                        )}
                        {overridden && a.manualOverride?.reason && (
                          <p className="text-xs text-purple-600 mt-1">سبب التعديل: {a.manualOverride.reason}</p>
                        )}
                        {/* من هذا الجهاز؟ يظهر حين يخالف الاسم المكتوب صاحبَ الجهاز المعروف */}
                        <DeviceOwnerBadge card={a.deviceCard} fpHash={a.deviceFp} writtenName={a.studentName} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-extrabold text-lg ${finalScore >= (a.totalMarks || 1) * 0.5 ? "text-green-600" : "text-red-600"}`}>
                          {finalScore} / {a.totalMarks || 0}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAttemptReview(a)}
                          className="border-indigo-300 text-indigo-700 dark:text-indigo-300"
                        >
                          مراجعة الإجابات
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setOverrideTarget({ attemptId: a.id, name: a.studentName, current: finalScore, total: a.totalMarks || 0 })
                            setOverrideScore(String(finalScore))
                            setOverrideReason(a.manualOverride?.reason || "")
                          }}
                        >
                          تعديل الدرجة
                        </Button>
                        {a.deviceCard && resultsExam && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-emerald-300 text-emerald-700 dark:text-emerald-300"
                            title="يمنح جهاز هذا الطالب محاولة إضافية في هذا الاختبار فقط"
                            onClick={async () => {
                              const res = await grantDeviceAttempt(resultsExam.id, a.deviceCard!, a.studentName)
                              if (res.ok) toast.success("تم منح محاولة إضافية لهذا الجهاز")
                              else toast.error(res.error || "تعذر منح المحاولة")
                            }}
                          >
                            محاولة إضافية
                          </Button>
                        )}
                        <BanDeviceButton
                          card={a.deviceCard}
                          fpHash={a.deviceFp}
                          writtenName={a.studentName}
                          label={`محاولة اختبار: ${resultsExam?.title || ""}`}
                        />
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== مراجعة إجابات محاولة واحدة: تصحيح، نصف درجة، وتعليق ===== */}
      <Dialog open={!!reviewAttempt} onOpenChange={(open) => !open && setReviewAttempt(null)}>
        <DialogContent className="w-[96vw] max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">مراجعة إجابات: {reviewAttempt?.studentName}</DialogTitle>
            <DialogDescription>
              صحّح كل إجابة، أضف تعليقاً أو تصحيحاً، ثم احفظ المراجعة أو أطلق النتيجة للطالب.
            </DialogDescription>
          </DialogHeader>

          {reviewAttempt && resultsExam && (() => {
            const summary = summarizeAttemptReview(resultsExam, {
              ...reviewAttempt.answers,
              ...Object.fromEntries(Object.entries(reviewDraft).map(([id, review]) => [
                id,
                { ...reviewAttempt.answers[id], review },
              ])),
            })
            const detailById = new Map(summary.details.map(detail => [detail.subQuestionId, detail]))
            return (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-center text-xs">
                  <div><p className="text-gray-500">التلقائي</p><p className="font-extrabold">{summary.autoScore} / {summary.autoTotal}</p></div>
                  <div><p className="text-gray-500">المقالي</p><p className="font-extrabold">{summary.manualScore} / {summary.manualTotal}</p></div>
                  <div><p className="text-gray-500">النهائي الحالي</p><p className="font-extrabold text-indigo-700">{summary.score} / {summary.totalMarks}</p></div>
                  <div><p className="text-gray-500">بانتظار التصحيح</p><p className={`font-extrabold ${summary.pendingManualCount ? "text-amber-600" : "text-emerald-600"}`}>{summary.pendingManualCount}</p></div>
                </div>

                {resultsExam.questions.flatMap((question, qIndex) => question.subQuestions.map((sq, sqIndex) => {
                  const detail = detailById.get(sq.id)
                  if (!detail) return null
                  const answer = reviewAttempt.answers[sq.id] || {}
                  const review = reviewDraft[sq.id] || answer.review || {}
                  const answerText = question.questionType === 1
                    ? sq.choices?.find(choice => choice.id === answer.choiceId)?.choiceText || "لم يُجب"
                    : question.questionType === 3
                    ? answer.isTrue === true ? "صح" : answer.isTrue === false ? "خطأ" : "لم يُجب"
                    : answer.text?.trim() || "لم يُجب"
                  const automatic = detail.auto
                  const currentAward = typeof review.awardedMarks === "number" ? review.awardedMarks : detail.awarded
                  return (
                    <article key={sq.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 sm:p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-indigo-600">السؤال {qIndex + 1} — الفرعي {sqIndex + 1}</p>
                          <p className="font-bold text-gray-900 dark:text-white mt-1">{sq.questionText}</p>
                          <p className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                            <span className="font-bold">إجابة الطالب: </span>{answerText}
                          </p>
                        </div>
                        <Badge className={automatic ? "w-fit bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "w-fit bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}>
                          {automatic ? "مصَحّح تلقائياً" : "يحتاج تصحيحاً يدوياً"} — {detail.marks} د
                        </Badge>
                      </div>

                      <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 space-y-3">
                        <p className="text-xs font-extrabold text-gray-700 dark:text-gray-200">
                          {automatic ? "يمكنك تعديل الدرجة الآلية لهذه الإجابة عند الحاجة" : "قرار التصحيح اليدوي"}
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            { key: "correct" as const, label: "صحيحة", className: "border-emerald-300 text-emerald-700 hover:bg-emerald-50" },
                            { key: "half" as const, label: "نصف حل", className: "border-amber-300 text-amber-700 hover:bg-amber-50" },
                            { key: "incorrect" as const, label: "خاطئة", className: "border-rose-300 text-rose-700 hover:bg-rose-50" },
                          ]).map(option => (
                            <Button
                              key={option.key}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => updateReviewDraft(sq.id, {
                                verdict: option.key,
                                awardedMarks: marksForReviewVerdict(option.key, detail.marks),
                                reviewedAt: new Date().toISOString(),
                              })}
                              className={`${option.className} ${review.verdict === option.key ? "ring-2 ring-offset-1 ring-indigo-400" : ""}`}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[auto_8rem] items-end gap-2">
                          <div>
                            <Label className="text-xs">تعليق للطالب (يظهر بعد إطلاق النتيجة)</Label>
                            <textarea
                              value={review.comment || ""}
                              onChange={event => updateReviewDraft(sq.id, { comment: event.target.value })}
                              placeholder="مثال: إجابتك جيدة، لكن اذكر السبب العلمي كاملاً."
                              className="mt-1 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">الدرجة من {detail.marks}</Label>
                            <Input
                              type="number"
                              min={0}
                              max={detail.marks}
                              step="0.5"
                              value={currentAward}
                              onChange={event => updateReviewDraft(sq.id, {
                                verdict: "custom",
                                awardedMarks: Math.max(0, Math.min(detail.marks, parseFloat(event.target.value) || 0)),
                                reviewedAt: new Date().toISOString(),
                              })}
                              className="mt-1 text-center"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">تصحيح أو إجابة نموذجية للطالب (اختياري)</Label>
                          <textarea
                            value={review.correction || ""}
                            onChange={event => updateReviewDraft(sq.id, { correction: event.target.value })}
                            placeholder="اكتب التصحيح الذي تريد أن يراه الطالب بعد إطلاق النتيجة."
                            className="mt-1 min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    </article>
                  )
                }))}
              </div>
            )
          })()}

          <DialogFooter className="sticky bottom-0 bg-background/95 pt-3">
            <Button variant="outline" onClick={() => setReviewAttempt(null)}>إغلاق</Button>
            <Button variant="outline" onClick={() => saveAttemptReview(false)}>حفظ المراجعة</Button>
            <Button onClick={() => saveAttemptReview(true)} className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
              حفظ وإطلاق النتيجة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== حوار تعديل درجة محاولة ===== */}
      <Dialog open={!!overrideTarget} onOpenChange={(o) => !o && setOverrideTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل درجة «{overrideTarget?.name}»</DialogTitle>
            <DialogDescription>
              الدرجة الآلية كانت {overrideTarget?.current} من {overrideTarget?.total} — أدخل الدرجة التي تراها عادلة
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>الدرجة الجديدة (من {overrideTarget?.total})</Label>
              <Input
                type="number"
                min={0}
                max={overrideTarget?.total || 0}
                value={overrideScore}
                onChange={e => setOverrideScore(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>سبب التعديل (اختياري — يظهر في تقرير الطالب)</Label>
              <Input
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="مثال: الإجابة صحيحة معنوياً واختلفت في الصياغة"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideTarget(null)}>إلغاء</Button>
            <Button onClick={applyOverride} className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
              حفظ الدرجة المعدلة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* لوحة تحكم الظهور والمحاولات */}
      <Dialog open={!!panelExam} onOpenChange={open => { if (!open) setPanelExam(null) }}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-indigo-600" />
              لوحة تحكم الاختبار
            </DialogTitle>
            <p className="text-sm text-gray-500">
              {panelExam?.title} — {getGradeName(panelExam?.gradeId || "")}
            </p>
          </DialogHeader>

          {panelExam && (
            <div className="space-y-5 py-2">
              {/* الإظهار للطلاب */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                <div>
                  <p className="font-bold text-sm text-gray-900 dark:text-white">إظهار الاختبار للطلاب</p>
                  <p className="text-xs text-gray-500">
                    {panelForm.allowOnline ? "يظهر لصفه ومجموعاته المستهدفة في بوابة الطالب" : "مخفي تماماً — لا يراه أي طالب"}
                  </p>
                </div>
                <Switch checked={panelForm.allowOnline} onCheckedChange={v => setPanelForm(prev => ({ ...prev, allowOnline: v }))} />
              </div>

              {/* فتح المراجعة للجميع — مرحلة ما بعد الاختبار */}
              <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-3">
                <div>
                  <p className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-amber-600" />
                    تم الامتحان — فتح المراجعة للجميع
                  </p>
                  <p className="text-xs text-gray-500">
                    {panelForm.reviewOpen
                      ? "الاختبار انتهى: لا يستطيع أي طالب بدء محاولة جديدة، ويرى الطلاب أسئلة الاختبار وإجاباتهم ومفاتيح الأسئلة الموضوعية؛ أما درجات المقال والتعليقات فلا تظهر إلا بعد إطلاق نتيجة كل طالب"
                      : "فعّلها بعد امتحان جميع الطلاب — تُغلق المحاولات الجديدة نهائياً وتظهر عين المراجعة بجانب الاختبار من دون كشف ملاحظات المقال غير المُطلقة"}
                  </p>
                </div>
                <Switch checked={panelForm.reviewOpen} onCheckedChange={v => setPanelForm(prev => ({ ...prev, reviewOpen: v }))} />
              </div>

              {panelForm.allowOnline && (
                <>
                  {/* من يستطيع فتح الاختبار: الأعضاء فقط أم مفتوح للجميع */}
                  <div className="space-y-2">
                    <p className="font-bold text-sm text-gray-900 dark:text-white">من يستطيع فتح الاختبار؟</p>
                    <div className="grid grid-cols-1 gap-2">
                      {([
                        {
                          key: "members" as ExamAccessMode,
                          icon: <Users className="w-4 h-4" />,
                          label: "للأعضاء المسجلين فقط",
                          desc: "يظهر للطالب في بوابته حسب صفه — اسمه وصفه ومجموعته تُعبأ تلقائياً من حسابه ولا يملأ أي بيانات، يجيب عن الأسئلة فقط",
                        },
                        {
                          key: "public" as ExamAccessMode,
                          icon: <Globe className="w-4 h-4" />,
                          label: "مفتوح لأي أحد بدون تسجيل",
                          desc: "يظهر في لوحة الإعلانات (الصفحة الرئيسية) ويمكنك نشر رابطه — يُدخل الزائر اسمه ورقم هاتفه (إجباريان)، والصف ثابت من الاختبار ويختار مجموعته من مجموعات صفه المتاحة فقط، ثم يبدأ",
                        },
                      ]).map(opt => {
                        const on = panelForm.accessMode === opt.key
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setPanelForm(prev => ({ ...prev, accessMode: opt.key }))}
                            className={`text-right rounded-xl border-2 p-3 transition-colors ${
                              on
                                ? "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30"
                                : "border-gray-200 dark:border-gray-800 hover:border-gray-300"
                            }`}
                          >
                            <span className="flex items-center gap-2 font-bold text-sm text-gray-900 dark:text-white">
                              <span className={on ? "text-indigo-600" : "text-gray-400"}>{opt.icon}</span>
                              {opt.label}
                              {on && <span className="mr-auto text-[11px] text-indigo-600 shrink-0">✓ محدد</span>}
                            </span>
                            <span className="block text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-gray-400">
                      {panelForm.accessMode === "public"
                        ? "الزوار يفتحون الاختبار من الصفحة الرئيسية أو من رابطه المباشر — تصلك محاولاتهم بالاسم ورقم الهاتف والمجموعة"
                        : "لا يفتح الاختبار إلا طالب مسجَّل الدخول من صفه — هويته تلقائية من حسابه"}
                    </p>

                    {/* أين يظهر الاختبار — «بالرابط فقط» يخفيه عن الجميع إلا من يملك الرابط */}
                    <div className="space-y-2 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                      <p className="font-bold text-sm text-gray-900 dark:text-white">أين يظهر الاختبار؟</p>
                      {panelForm.accessMode === "public" && (
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">في لوحة الإعلانات (الصفحة الرئيسية)</p>
                            <p className="text-xs text-gray-500">
                              {panelForm.listedOnBoard
                                ? "يراه كل زائر للصفحة الرئيسية"
                                : "مخفي عن اللوحة — لا يفتحه إلا من أرسلتَ له الرابط"}
                            </p>
                          </div>
                          <Switch
                            checked={panelForm.listedOnBoard}
                            onCheckedChange={v => setPanelForm(prev => ({ ...prev, listedOnBoard: v }))}
                          />
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-gray-800 dark:text-gray-100">في بوابة الطالب المسجَّل («اختباراتي»)</p>
                          <p className="text-xs text-gray-500">
                            {panelForm.showInPortal
                              ? "يظهر لطلاب صفه ومجموعاته المستهدفة"
                              : "مخفي من البوابة — بالرابط فقط"}
                          </p>
                        </div>
                        <Switch
                          checked={panelForm.showInPortal}
                          onCheckedChange={v => setPanelForm(prev => ({ ...prev, showInPortal: v }))}
                        />
                      </div>
                      {!panelForm.listedOnBoard && !panelForm.showInPortal && (
                        <p className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                          بالرابط فقط: انسخ الرابط وأرسله في قناة الواتساب — لن يظهر الاختبار في أي قائمة.
                        </p>
                      )}
                    </div>

                    {/* رابط النشر — للمفتوح للجميع، ولأي اختبار مخفي يُفتح بالرابط */}
                    {(panelForm.accessMode === "public" || !panelForm.showInPortal) && (
                      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 space-y-2">
                        <p className="text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5" />
                          رابط الاختبار — انشره في أي مكان
                        </p>
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            dir="ltr"
                            value={examLink(panelExam.id)}
                            onFocus={e => e.currentTarget.select()}
                            className="h-9 text-xs bg-white dark:bg-gray-900"
                          />
                          <Button size="sm" variant="outline" className="shrink-0" onClick={() => copyExamLink(panelExam.id)}>
                            <Link2 className="w-4 h-4" />
                            <span>نسخ</span>
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500">
                          يفتحه الطالب بدون تسجيل: يُدخل اسمه ورقم هاتفه، والصف ثابت، ويختار مجموعته ثم يبدأ.
                          <br />
                          ويظهر أيضاً تلقائياً في لوحة الإعلانات بالصفحة الرئيسية.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* المجموعات المستهدفة */}
                  <div className="space-y-2">
                    <p className="font-bold text-sm text-gray-900 dark:text-white">يظهر لمجموعات:</p>
                    <div className="flex flex-wrap gap-2">
                      {getGroupsOfGrade(grades, panelExam.gradeId).map(g => {
                        const on = panelForm.targetGroupIds.includes(g.id)
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => setPanelForm(prev => ({
                              ...prev,
                              targetGroupIds: on
                                ? prev.targetGroupIds.filter(x => x !== g.id)
                                : [...prev.targetGroupIds, g.id],
                            }))}
                            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                              on
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                            }`}
                          >
                            {g.name}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-gray-400">
                      {panelForm.targetGroupIds.length === 0
                        ? "لا مجموعات محددة → يظهر لكل مجموعات الصف"
                        : `يظهر لـ ${panelForm.targetGroupIds.length} مجموعة فقط`}
                    </p>
                  </div>

                  {/* أوقات الظهور */}
                  <div className="space-y-2">
                    <p className="font-bold text-sm text-gray-900 dark:text-white">أوقات الظهور</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={panelForm.availabilityMode === "always" ? "default" : "outline"}
                        onClick={() => setPanelForm(prev => ({ ...prev, availabilityMode: "always" }))}
                        className="flex-1"
                      >
                        فور النشر — دائماً متاح
                      </Button>
                      <Button
                        size="sm"
                        variant={panelForm.availabilityMode === "scheduled" ? "default" : "outline"}
                        onClick={() => setPanelForm(prev => ({ ...prev, availabilityMode: "scheduled" }))}
                        className="flex-1"
                      >
                        فترة محددة
                      </Button>
                    </div>

                    {panelForm.availabilityMode === "scheduled" && (
                      <div className="space-y-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">يفتح في</Label>
                            <Input
                              type="datetime-local"
                              dir="ltr"
                              value={panelForm.availableFrom}
                              onChange={e => setPanelForm(prev => ({ ...prev, availableFrom: e.target.value }))}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">يُغلق في</Label>
                            <Input
                              type="datetime-local"
                              dir="ltr"
                              value={panelForm.availableUntil}
                              onChange={e => setPanelForm(prev => ({ ...prev, availableUntil: e.target.value }))}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-500 mb-1.5">فتح سريع من الآن لمدة:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { label: "ساعة", h: 1 },
                              { label: "6 ساعات", h: 6 },
                              { label: "24 ساعة", h: 24 },
                              { label: "3 أيام", h: 72 },
                              { label: "أسبوع", h: 168 },
                            ].map(q => (
                              <Button key={q.h} size="sm" variant="outline" className="h-7 text-xs" onClick={() => quickOpenHours(q.h)}>
                                {q.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* عدد مرات الاجتياز */}
              <div className="space-y-2">
                <p className="font-bold text-sm text-gray-900 dark:text-white">عدد مرات اجتياز الاختبار لكل طالب</p>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    dir="ltr"
                    value={panelForm.maxAttempts}
                    onChange={e => setPanelForm(prev => ({ ...prev, maxAttempts: e.target.value }))}
                    className="w-24"
                  />
                  <p className="text-xs text-gray-500">
                    {parseInt(panelForm.maxAttempts || "0", 10) > 0
                      ? `يستطيع كل طالب أداءه ${panelForm.maxAttempts} مرة — بعدها يُقفل`
                      : "0 = بلا حد على عدد المحاولات"}
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  المحاولات المسجلة حتى الآن لهذا الاختبار: {getExamAttempts().filter(a => a.examId === panelExam.id).length}
                </p>
              </div>

              {/* حالة الإتاحة الحالية — تعكس ما سيُحفظ الآن، لا الحالة القديمة */}
              {(() => {
                const preview: Exam = {
                  ...panelExam,
                  deliveryMode: "online",
                  allowOnline: panelForm.allowOnline,
                  availabilityMode: panelForm.availabilityMode,
                  availableFrom: panelForm.availabilityMode === "scheduled"
                    ? fromLocalInputValue(panelForm.availableFrom) : undefined,
                  availableUntil: panelForm.availabilityMode === "scheduled"
                    ? fromLocalInputValue(panelForm.availableUntil) : undefined,
                  reviewOpen: panelForm.reviewOpen,
                }
                const av = examAvailability(preview)
                return (
                  <div className={`rounded-xl border p-3 text-sm font-bold ${
                    panelForm.allowOnline && av.open
                      ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800 text-green-700 dark:text-green-300"
                      : "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300"
                  }`}>
                    {!panelForm.allowOnline
                      ? "الحالة الآن: مخفي من الطلاب"
                      : av.open
                      ? "الحالة الآن: متاح للأداء ✅"
                      : `الحالة الآن: مغلق — ${av.reason || ""}`}
                  </div>
                )
              })()}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPanelExam(null)}>تراجع</Button>
            <Button onClick={savePanel} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
              <Settings2 className="w-4 h-4" />
              <span>حفظ لوحة التحكم</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
