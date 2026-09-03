"use client"

import React, { useState, useEffect } from "react"
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
  Question,
  SubQuestion,
  ExamAccessMode,
  ExamTemplateId,
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
} from "@/lib/exam-templates"
import { getExamAttempts, saveExamAttempts } from "@/lib/data-storage"
import { examAvailability, effectiveAttemptScore } from "@/lib/portal-content"
import { forcePushAll } from "@/lib/supabase/sync"
import { Switch } from "@/components/ui/switch"
import { ExamPaper, TemplatePicker } from "@/components/exam/exam-paper"
import { ScienceIcon } from "@/components/exam/science-ornaments"

export default function ExamsPage() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)
  const [previewExam, setPreviewExam] = useState<Exam | null>(null)
  const [resultsExam, setResultsExam] = useState<Exam | null>(null)
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
  })
  const [overrideTarget, setOverrideTarget] = useState<{ attemptId: string; name: string; current: number; total: number } | null>(null)
  const [overrideScore, setOverrideScore] = useState("")
  const [overrideReason, setOverrideReason] = useState("")
  const [expandedQuestions, setExpandedQuestions] = useState<string[]>([])

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
    teacherName: TEACHER_NAME,
    schoolName: "",
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

  /** أصل الموقع لرابط الاختبار المفتوح للجميع (يُحسب في المتصفح فقط) */
  const [siteOrigin, setSiteOrigin] = useState("")

  useEffect(() => {
    setGrades(getGrades())
    setExams(getExams())
    setSiteOrigin(window.location.origin)
  }, [])

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
      availableFrom: (exam.availableFrom || "").slice(0, 16),
      availableUntil: (exam.availableUntil || "").slice(0, 16),
      reviewOpen: !!exam.reviewOpen,
      targetGroupIds: exam.targetGroupIds || [],
      maxAttempts: String(exam.maxAttempts && exam.maxAttempts > 0 ? exam.maxAttempts : 0),
    })
  }

  const savePanel = () => {
    if (!panelExam) return
    const maxN = Math.max(0, parseInt(panelForm.maxAttempts || "0", 10) || 0)
    const updatedExams = exams.map(e =>
      e.id === panelExam.id
        ? {
            ...e,
            allowOnline: panelForm.allowOnline,
            accessMode: panelForm.allowOnline ? panelForm.accessMode : undefined,
            availabilityMode: panelForm.allowOnline ? panelForm.availabilityMode : undefined,
            availableFrom: panelForm.allowOnline && panelForm.availabilityMode === "scheduled" && panelForm.availableFrom
              ? new Date(panelForm.availableFrom).toISOString() : undefined,
            availableUntil: panelForm.allowOnline && panelForm.availabilityMode === "scheduled" && panelForm.availableUntil
              ? new Date(panelForm.availableUntil).toISOString() : undefined,
            targetGroupIds: panelForm.allowOnline ? panelForm.targetGroupIds : undefined,
            maxAttempts: maxN > 0 ? maxN : undefined,
            reviewOpen: panelForm.reviewOpen,
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
    toast.success(`تم تعديل درجة ${overrideTarget.name} إلى ${score} — تظهر في تقريره فوراً`)
    setOverrideTarget(null)
    setOverrideScore("")
    setOverrideReason("")
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

  const emptyForm = () => ({
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
    teacherName: TEACHER_NAME,
    schoolName: "",
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

  const openCreateDialog = (exam?: Exam) => {
    if (exam) {
      setEditingExam(exam)
      setExamForm({
        gradeId: exam.gradeId,
        groupId: exam.groupId || "",
        title: exam.title,
        month: exam.month || new Date().getMonth() + 1,
        unit: exam.unit || "",
        academicYear: exam.academicYear,
        duration: exam.duration || 60,
        totalMarks: exam.totalMarks || 0,
        questions: exam.questions,
        templateId: exam.templateId || "classic",
        showDecorations: exam.showDecorations !== false,
        teacherName: exam.teacherName || TEACHER_NAME,
        schoolName: exam.schoolName || "",
        allowOnline: !!exam.allowOnline,
        accessMode: exam.accessMode === "public" ? "public" : "members",
        autoHonorBoard: !!exam.autoHonorBoard,
        honorMinPercent: exam.honorMinPercent ?? 100,
        availabilityMode: exam.availabilityMode || "always",
        availableFrom: (exam.availableFrom || "").slice(0, 16),
        availableUntil: (exam.availableUntil || "").slice(0, 16),
        targetGroupIds: exam.targetGroupIds || [],
        answerVisibility: exam.answerVisibility || "never",
      })
    } else {
      setEditingExam(null)
      setExamForm(emptyForm())
    }
    setExpandedQuestions([])
    setCreateDialogOpen(true)
  }

  const saveExam = () => {
    if (!examForm.title) {
      toast.error("يرجى إدخال عنوان الاختبار")
      return
    }
    const totalMarks = getExamTotalMarks(examForm.questions)
    const examData: Exam = {
      id: editingExam?.id || Date.now().toString(),
      gradeId: examForm.gradeId === "__all" ? "" : examForm.gradeId,
      groupId: examForm.gradeId === "__all" ? undefined : (examForm.groupId || undefined),
      title: examForm.title,
      month: examForm.month,
      unit: examForm.unit || undefined,
      academicYear: examForm.academicYear,
      duration: examForm.duration,
      totalMarks,
      questions: examForm.questions,
      templateId: examForm.templateId,
      showDecorations: examForm.showDecorations,
      teacherName: examForm.teacherName || undefined,
      schoolName: examForm.schoolName || undefined,
      allowOnline: examForm.allowOnline,
      accessMode: examForm.allowOnline ? examForm.accessMode : undefined,
      autoHonorBoard: examForm.autoHonorBoard,
      honorMinPercent: examForm.honorMinPercent,
      availabilityMode: examForm.allowOnline ? examForm.availabilityMode : undefined,
      availableFrom: examForm.allowOnline && examForm.availabilityMode === "scheduled" && examForm.availableFrom
        ? new Date(examForm.availableFrom).toISOString() : undefined,
      availableUntil: examForm.allowOnline && examForm.availabilityMode === "scheduled" && examForm.availableUntil
        ? new Date(examForm.availableUntil).toISOString() : undefined,
      targetGroupIds: examForm.allowOnline ? examForm.targetGroupIds : undefined,
      answerVisibility: examForm.allowOnline ? examForm.answerVisibility : undefined,
      createdAt: editingExam?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const updatedExams = editingExam
      ? exams.map(e => (e.id === editingExam.id ? examData : e))
      : [...exams, examData]
    setExams(updatedExams)
    saveExams(updatedExams)
    setCreateDialogOpen(false)
    toast.success(editingExam ? "تم تحديث الاختبار بنجاح" : "تم إنشاء الاختبار بنجاح")
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
            ورقة امتحان للطباعة والتوزيع على الطلاب — من الجوال أو الكمبيوتر، بصيغة A4 والعربية
          </p>
        </div>
        <Button
          onClick={() => openCreateDialog()}
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
            const tpl = getTemplate(exam.templateId)
            return (
              <motion.div
                key={exam.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg text-gray-900 dark:text-white">
                          {exam.title}
                        </CardTitle>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {getGradeName(exam.gradeId)}
                        </p>
                      </div>
                      <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
                        {exam.questions.length} سؤال
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <Badge variant="outline" className="bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                        <Palette className="w-3 h-3 ml-1" />
                        {tpl.name}
                      </Badge>
                      {exam.month && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          <Calendar className="w-3 h-3 ml-1" />
                          {MONTHS[exam.month - 1]}
                        </Badge>
                      )}
                      {exam.unit && <Badge variant="outline">الوحدة: {exam.unit}</Badge>}
                      {exam.groupId && <Badge variant="outline">{getGroupName(exam.groupId)}</Badge>}
                      {exam.duration && <Badge variant="outline">{exam.duration} دقيقة</Badge>}
                      {exam.showDecorations !== false && (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          <Sparkles className="w-3 h-3 ml-1" />
                          زخارف
                        </Badge>
                      )}
                      {exam.allowOnline ? (
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
                        <Badge variant="outline" className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          <EyeOff className="w-3 h-3 ml-1" />
                          مخفي من الطلاب
                        </Badge>
                      )}
                      {!!exam.maxAttempts && exam.maxAttempts > 0 && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          المحاولات: {exam.maxAttempts} لكل طالب
                        </Badge>
                      )}
                      {(() => {
                        const av = examAvailability(exam)
                        if (!exam.allowOnline) return null
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
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => previewExamHandler(exam)} className="flex-1">
                        <Eye className="w-4 h-4" />
                        <span>معاينة</span>
                      </Button>
                      {exam.allowOnline && (
                        <Button
                          variant="outline"
                          size="sm"
                          title="نتائج الطلاب وتعديل الدرجات يدوياً"
                          onClick={() => setResultsExam(exam)}
                        >
                          <ClipboardList className="w-4 h-4" />
                        </Button>
                      )}
                      {exam.allowOnline && (
                        <Button
                          variant="outline"
                          size="sm"
                          title={exam.accessMode === "public"
                            ? "نسخ رابط الاختبار — مفتوح للجميع (يُفتح بدون تسجيل)"
                            : "نسخ رابط الاختبار"}
                          onClick={() => copyExamLink(exam.id)}
                        >
                          <Link2 className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        title="لوحة تحكم الظهور والمحاولات"
                        onClick={() => openPanel(exam)}
                        className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                      >
                        <Settings2 className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openCreateDialog(exam)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteExam(exam.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
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
            <Button onClick={() => openCreateDialog()} className="bg-gradient-to-r from-red-500 to-rose-600">
              <Plus className="w-4 h-4" />
              <span>إنشاء أول اختبار</span>
            </Button>
          </motion.div>
        )}
      </div>

      {/* Create / Edit */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="inset-0 left-0 top-0 h-[100dvh] w-[100dvw] max-w-none max-h-[100dvh] translate-x-0 translate-y-0 rounded-none p-3 pb-28 overflow-y-auto sm:inset-auto sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[92vh] sm:w-full sm:max-w-6xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:p-6 sm:pb-6">
          <DialogHeader>
            <DialogTitle>{editingExam ? "تعديل الاختبار" : "إنشاء اختبار جديد"}</DialogTitle>
            <DialogDescription>
              ورقة للطباعة والتوزيع — اكتب الأسئلة من الجوال بسهولة ثم عاينها قبل التصدير
            </DialogDescription>
          </DialogHeader>

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
                بيانات الورقة
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

            {/* 3. Templates */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">3</span>
                قالب الورقة (5 قوالب احترافية)
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
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-gray-400 text-white text-xs flex items-center justify-center">3ب</span>
                اختبار إلكتروني (تجريبي — حجر أساس)
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                الورقة المطبوعة لا تحتاج إجابة نموذجية. الاختبار على الموقع تجريبي ولن يُنشر الآن،
                وسيُطوَّر لاحقاً ليكون اختياراً من متعدد فقط.
              </p>
              <label className="flex items-start gap-3 p-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={examForm.allowOnline}
                  onChange={(e) => setExamForm(prev => ({ ...prev, allowOnline: e.target.checked }))}
                  className="w-4 h-4 accent-indigo-600 mt-1"
                />
                <Globe className="w-4 h-4 text-indigo-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">تفعيل الأساس التجريبي على الموقع</p>
                  <p className="text-xs text-gray-500">لا تستخدمه مع الطلاب الآن — للتطوير لاحقاً</p>
                </div>
              </label>
              {examForm.allowOnline && (
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
              )}

              {examForm.allowOnline && (
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
              )}
            </section>

            {/* 4. Add questions */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">4</span>
                إضافة سؤال رئيسي
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {QUESTION_BUTTONS.map((btn, i) => {
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
                      <span>{btn.label}</span>
                    </Button>
                  )
                })}
              </div>
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
                                      {examForm.allowOnline && (
                                        <div className="flex items-center gap-2">
                                          <Label className="text-xs shrink-0">مفتاح التصحيح (تجريبي):</Label>
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
                                      {examForm.allowOnline && (
                                        <div>
                                          <Label className="text-xs">مفتاح التصحيح (تجريبي)</Label>
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
                                      {examForm.allowOnline && (
                                        <div className="flex items-center gap-2">
                                          <Label className="text-xs shrink-0">مفتاح التصحيح (تجريبي):</Label>
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
                                      {examForm.allowOnline && (
                                        <div>
                                          <Label className="text-xs">مفتاح التصحيح (تجريبي)</Label>
                                          <Input
                                            placeholder={
                                              question.questionType === 6
                                                ? "المصطلح العلمي الصحيح (مثال: السرعة)"
                                                : question.questionType === 7
                                                ? "التعريف النموذجي"
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

                                        {examForm.allowOnline && (
                                          <div>
                                            <Label className="text-xs">مفتاح التصحيح (تجريبي)</Label>
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

          <DialogFooter className="sticky bottom-0 bg-background/95 backdrop-blur border-t pt-3 sm:static sm:border-0 sm:bg-transparent sm:backdrop-blur-none">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={saveExam}
              className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700"
            >
              {editingExam ? "حفظ التعديلات" : "حفظ الاختبار"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="w-[96vw] max-w-4xl max-h-[92vh] overflow-y-auto p-3 sm:p-6 mx-auto">
          <DialogHeader className="no-print">
            <DialogTitle>معاينة الورقة — A4</DialogTitle>
          </DialogHeader>
          {previewExam && (
            <div id="exam-preview-content" className="w-full max-w-full mx-auto bg-white dark:bg-gray-950 rounded-lg overflow-hidden py-1">
              <ExamPaper
                exam={previewExam}
                gradeName={getGradeName(previewExam.gradeId)}
                groupName={previewExam.groupId ? getGroupName(previewExam.groupId) : undefined}
              />
            </div>
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <ClipboardList className="w-6 h-6 text-indigo-600" />
              نتائج: {resultsExam?.title}
            </DialogTitle>
            <DialogDescription>
              اضغط «تعديل الدرجة» إذا شعرت أن التصحيح الآلي لم يكن عادلاً — الدرجة المعدلة تظهر للطالب وفي تقريره فوراً
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {resultsAttempts.length === 0 ? (
              <p className="text-center text-gray-500 py-8">لا توجد محاولات بعد — تظهر هنا فور أداء الطلاب للاختبار</p>
            ) : (
              resultsAttempts.slice().reverse().map(a => {
                const finalScore = effectiveAttemptScore(a)
                const overridden = !!a.manualOverride
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
                        </p>
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
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-extrabold text-lg ${finalScore >= (a.totalMarks || 1) * 0.5 ? "text-green-600" : "text-red-600"}`}>
                          {finalScore} / {a.totalMarks || 0}
                        </span>
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
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
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
                      ? "الطلاب يرون أسئلة الاختبار وإجاباتهم والأجوبة الصحيحة ودرجاتهم في أي وقت"
                      : "فعّلها بعد امتحان جميع الطلاب — تظهر عين المراجعة بجانب الاختبار"}
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

                    {/* رابط النشر — للاختبار المفتوح للجميع */}
                    {panelForm.accessMode === "public" && (
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

              {/* حالة الإتاحة الحالية */}
              {(() => {
                const av = examAvailability(panelExam)
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
