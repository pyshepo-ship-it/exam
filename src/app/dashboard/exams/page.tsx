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
import { ExamPaper, TemplatePicker } from "@/components/exam/exam-paper"
import { ScienceIcon } from "@/components/exam/science-ornaments"

export default function ExamsPage() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)
  const [previewExam, setPreviewExam] = useState<Exam | null>(null)
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
    autoHonorBoard: false,
    honorMinPercent: 100,
  })

  useEffect(() => {
    setGrades(getGrades())
    setExams(getExams())
  }, [])

  // مجموعات الصف المختار فقط — لا تظهر مجموعات صف آخر أبداً
  const groupsOfSelectedGrade = getGroupsOfGrade(grades, examForm.gradeId)

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
    autoHonorBoard: false,
    honorMinPercent: 100,
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
        autoHonorBoard: !!exam.autoHonorBoard,
        honorMinPercent: exam.honorMinPercent ?? 100,
      })
    } else {
      setEditingExam(null)
      setExamForm(emptyForm())
    }
    setExpandedQuestions([])
    setCreateDialogOpen(true)
  }

  const saveExam = () => {
    if (!examForm.gradeId || !examForm.title) {
      toast.error("يرجى ملء جميع الحقول المطلوبة")
      return
    }
    const totalMarks = getExamTotalMarks(examForm.questions)
    const examData: Exam = {
      id: editingExam?.id || Date.now().toString(),
      gradeId: examForm.gradeId,
      groupId: examForm.groupId || undefined,
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
      autoHonorBoard: examForm.autoHonorBoard,
      honorMinPercent: examForm.honorMinPercent,
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

  const getGradeName = (gradeId: string) => grades.find(g => g.id === gradeId)?.name || "غير محدد"
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
                      {exam.allowOnline && (
                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          <Globe className="w-3 h-3 ml-1" />
                          منشور للطلاب
                        </Badge>
                      )}
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
                          title="نسخ رابط الاختبار"
                          onClick={() => {
                            const url = `${window.location.origin}/exam/${exam.id}`
                            navigator.clipboard.writeText(url).then(
                              () => toast.success("تم نسخ رابط الاختبار"),
                              () => toast.error(url),
                            )
                          }}
                        >
                          <Link2 className="w-4 h-4" />
                        </Button>
                      )}
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
                    <SelectContent>
                      {grades.length === 0 ? (
                        <SelectItem value="__none" disabled>لا توجد صفوف — أضف صفاً أولاً</SelectItem>
                      ) : (
                        grades.map(grade => (
                          <SelectItem key={grade.id} value={grade.id}>{grade.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>المجموعة (اختياري)</Label>
                  <Select
                    value={examForm.groupId || "all"}
                    disabled={!examForm.gradeId}
                    onValueChange={(val) =>
                      setExamForm(prev => ({ ...prev, groupId: val === "all" ? "" : val }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={examForm.gradeId ? "كل المجموعات" : "اختر الصف أولاً"} />
                    </SelectTrigger>
                    <SelectContent>
                      {!examForm.gradeId ? (
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
                              <span>إضافة سؤال فرعي ({question.subQuestions.length})</span>
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

    </div>
  )
}
