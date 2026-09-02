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
  BookOpen,
  Calendar
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
import { exportToPDF } from "@/lib/pdf-utils"
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
  getAllGroups,
  getGrades,
  getExams,
  saveExams,
  getStoredAcademicYear,
} from "@/lib/data-storage"

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
]

// أنواع الأسئلة الرئيسية (رأس السؤال يُكتب تلقائياً حسب النوع)
const QUESTION_TYPES = [
  { id: 1, label: "اختر الإجابة الصحيحة", desc: "جمل فرعية، لكل منها 4 خيارات (أ، ب، ج، د) مع تحديد الإجابة الصحيحة" },
  { id: 2, label: "أكمل", desc: "جمل مقسومة لجزأين والفراغ في المنتصف أو في النهاية" },
  { id: 3, label: "صح أو خطأ", desc: "جمل يضع الطالب أمامها (صح) أو (خطأ)" },
  { id: 4, label: "علل / بم تفسر / اذكر أهمية", desc: "جمل مع سطر أو سطرين من النقاط لكتابة الإجابة" },
  { id: 5, label: "صحح ما تحته خط", desc: "جمل مع تحديد عدد الكلمات تحتها خط وخط النقاط للإجابة" },
]

// أزرار إضافة السؤال (النوع 4 مقسم لثلاثة أنواع فرعية)
const QUESTION_BUTTONS: { type: 1 | 2 | 3 | 4 | 5; label: string; reasoningType?: "علل" | "بم تفسر" | "اذكر أهمية" }[] = [
  { type: 1, label: "اختر الإجابة الصحيحة" },
  { type: 2, label: "أكمل" },
  { type: 3, label: "صح أو خطأ" },
  { type: 4, label: "علل لما يأتي", reasoningType: "علل" },
  { type: 4, label: "بم تفسر", reasoningType: "بم تفسر" },
  { type: 4, label: "اذكر أهمية", reasoningType: "اذكر أهمية" },
  { type: 5, label: "صحح ما تحته خط" },
]

const ARABIC_ORDINALS = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"]

const DOTS_LINE = "................................................................"

// رأس السؤال يُكتب تلقائياً حسب النوع (النص المخصص القديم له الأولوية)
const getQuestionHeader = (q: Question): string => {
  if (q.headerText && q.headerText.trim()) return q.headerText
  switch (q.questionType) {
    case 1: return "اختر الإجابة الصحيحة"
    case 2: return "أكمل"
    case 3: return "ضع علامة (صح) أو (خطأ)"
    case 4:
      if (q.reasoningType === "بم تفسر") return "بم تفسر:"
      if (q.reasoningType === "اذكر أهمية") return "اذكر أهمية:"
      return "علل لما يأتي:"
    case 5: return "صحح ما تحته خط"
    default: return ""
  }
}

export default function ExamsPage() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)
  const [previewExam, setPreviewExam] = useState<Exam | null>(null)
  const [expandedQuestions, setExpandedQuestions] = useState<string[]>([])

  // Exam form
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
  })

  useEffect(() => {
    setGrades(getGrades())
    setExams(getExams())
  }, [])

  // كل المجموعات في جميع الصفوف (مع اسم الصف)
  const allGroups = getAllGroups(grades)

  // Toggle question expansion
  const toggleQuestion = (questionId: string) => {
    setExpandedQuestions(prev =>
      prev.includes(questionId)
        ? prev.filter(id => id !== questionId)
        : [...prev, questionId]
    )
  }

  // إنشاء سؤال فرعي فارغ حسب النوع
  const makeSubQuestion = (type: 1 | 2 | 3 | 4 | 5, index: number): SubQuestion => {
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
      // جملة أولى + جملة ثانية، والفراغ في المنتصف (between) أو في النهاية (after)
      sub.parts = [
        { id: `${id}-p1`, partOrder: 1, partText: "", blankPosition: "between" },
        { id: `${id}-p2`, partOrder: 2, partText: "", blankPosition: "between" },
      ]
    } else if (type === 5) {
      sub.corrections = [
        { id: `${id}-c1`, wrongWord: "", correctAnswer: "", wordPosition: 1, wordCount: 1 },
      ]
    } else if (type === 4) {
      sub.answerLines = 2
    }
    return sub
  }

  // Add new question (4 أسئلة فرعية جاهزة)
  const addQuestion = (type: 1 | 2 | 3 | 4 | 5, reasoningType?: "علل" | "بم تفسر" | "اذكر أهمية") => {
    const questionNumber = examForm.questions.length + 1
    const newQuestion: Question = {
      id: Date.now().toString() + "-" + Math.random().toString(36).slice(2, 6),
      questionType: type,
      questionNumber,
      orderNumber: questionNumber,
      headerText: "",
      reasoningType: type === 4 ? reasoningType || "علل" : undefined,
      subQuestions: [0, 1, 2, 3].map(i => makeSubQuestion(type, i)),
    }

    setExamForm(prev => ({
      ...prev,
      questions: [...prev.questions, newQuestion],
    }))
    setExpandedQuestions(prev => [...prev, newQuestion.id])
  }

  // Update reasoning type (type 4)
  const updateReasoningType = (questionId: string, value: string) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q =>
        q.id === questionId ? { ...q, reasoningType: value as Question["reasoningType"] } : q
      ),
    }))
  }

  // Add sub-question
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

  // Update sub-question text
  const updateSubQuestion = (questionId: string, subQuestionId: string, field: string, value: any) => {
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

  // Update choice text
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

  // Set the correct choice
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

  // Update part text (type 2) — يضيف الجزء تلقائياً إن لم يوجد (بيانات قديمة)
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

  // Update blank position (type 2): between | after
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

  // Update correction fields (type 5)
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

  // Remove sub-question
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

  // Remove question
  const removeQuestion = (questionId: string) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions
        .filter(q => q.id !== questionId)
        .map((q, index) => ({ ...q, questionNumber: index + 1, orderNumber: index + 1 })),
    }))
  }

  // Open create dialog
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
      })
    } else {
      setEditingExam(null)
      setExamForm({
        gradeId: "",
        groupId: "",
        title: "",
        month: new Date().getMonth() + 1,
        unit: "",
        academicYear: getStoredAcademicYear(),
        duration: 60,
        totalMarks: 0,
        questions: [],
      })
    }
    setExpandedQuestions([])
    setCreateDialogOpen(true)
  }

  // Save exam
  const saveExam = () => {
    if (!examForm.gradeId || !examForm.title) {
      toast.error("يرجى ملء جميع الحقول المطلوبة")
      return
    }

    const examData: Exam = {
      id: editingExam?.id || Date.now().toString(),
      gradeId: examForm.gradeId,
      groupId: examForm.groupId || undefined,
      title: examForm.title,
      month: examForm.month,
      unit: examForm.unit || undefined,
      academicYear: examForm.academicYear,
      duration: examForm.duration,
      totalMarks: examForm.totalMarks,
      questions: examForm.questions,
      createdAt: editingExam?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    let updatedExams: Exam[]
    if (editingExam) {
      updatedExams = exams.map(e => e.id === editingExam.id ? examData : e)
    } else {
      updatedExams = [...exams, examData]
    }

    setExams(updatedExams)
    saveExams(updatedExams)
    setCreateDialogOpen(false)
    toast.success(editingExam ? "تم تحديث الاختبار بنجاح" : "تم إنشاء الاختبار بنجاح")
  }

  // Delete exam
  const deleteExam = (examId: string) => {
    if (confirm("هل أنت متأكد من حذف هذا الاختبار؟")) {
      const updatedExams = exams.filter(e => e.id !== examId)
      setExams(updatedExams)
      saveExams(updatedExams)
      toast.success("تم حذف الاختبار بنجاح")
    }
  }

  // Preview exam
  const previewExamHandler = (exam: Exam) => {
    setPreviewExam(exam)
    setPreviewDialogOpen(true)
  }

  // Get names
  const getGradeName = (gradeId: string) => grades.find(g => g.id === gradeId)?.name || 'غير محدد'
  const getGroupName = (groupId: string) => {
    for (const grade of grades) {
      const group = grade.groups.find(g => g.id === groupId)
      if (group) return group.name
    }
    return 'الكل'
  }

  // ---- معاينة: نوع 2 (أكمل) ----
  const renderComplete = (sq: SubQuestion) => {
    const parts = sq.parts || []
    const blank = <span className="tracking-wide text-gray-500">....................</span>
    if (parts.length >= 2) {
      const p1 = parts[0].partText
      const p2 = parts[1].partText
      const atEnd = parts[1].blankPosition === "after"
      if (atEnd) {
        return (
          <>
            {p1} {p2} <span className="tracking-wide text-gray-500">....................</span>
          </>
        )
      }
      return (
        <>
          {p1} <span className="tracking-wide text-gray-500">....................</span> {p2}
        </>
      )
    }
    // بيانات قديمة: أجزاء مفصولة بفراغات
    return parts.map((part, i) => (
      <span key={part.id}>
        {part.partText}
        {i < parts.length - 1 && " .................... "}
      </span>
    ))
  }

  // ---- معاينة: نوع 5 (صحح ما تحته خط) ----
  const renderCorrectionSentence = (sq: SubQuestion) => {
    const words = sq.questionText.split(/\s+/).filter(Boolean)
    if (words.length === 0) return null
    const corr = sq.corrections?.[0]
    const start = corr && corr.wordPosition > 0 ? corr.wordPosition - 1 : 0
    const count = corr?.wordCount && corr.wordCount > 0 ? corr.wordCount : 1
    return words.map((w, i) => (
      <span
        key={i}
        className={
          i >= start && i < start + count
            ? "underline decoration-2 underline-offset-4"
            : undefined
        }
      >
        {w}
        {i < words.length - 1 && " "}
      </span>
    ))
  }

  // عدد إجمالي الأسئلة الفرعية
  const totalSubQuestions = examForm.questions.reduce((s, q) => s + q.subQuestions.length, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            الاختبارات
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            إنشاء وإدارة الاختبارات وتحويلها لـ PDF
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

      {/* Question Types Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-900 rounded-2xl p-6"
      >
        <h3 className="font-bold text-gray-900 dark:text-white mb-4">
          أنواع الأسئلة (رأس كل سؤال يُكتب تلقائياً حسب النوع)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {QUESTION_TYPES.map((type) => (
            <div
              key={type.id}
              className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold mb-2">
                {type.id}
              </div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">{type.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{type.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Exams List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {exams.map((exam, index) => (
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
                    {exam.month && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        <Calendar className="w-3 h-3 ml-1" />
                        {MONTHS[exam.month - 1]}
                      </Badge>
                    )}
                    {exam.unit && (
                      <Badge variant="outline">الوحدة: {exam.unit}</Badge>
                    )}
                    {exam.groupId && (
                      <Badge variant="outline">{getGroupName(exam.groupId)}</Badge>
                    )}
                    {exam.duration && (
                      <Badge variant="outline">{exam.duration} دقيقة</Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => previewExamHandler(exam)}
                      className="flex-1"
                    >
                      <Eye className="w-4 h-4" />
                      <span>معاينة</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openCreateDialog(exam)}
                    >
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
          ))}
        </AnimatePresence>

        {exams.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="col-span-full text-center py-12"
          >
            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-700" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">لا توجد اختبارات بعد</p>
            <Button 
              onClick={() => openCreateDialog()}
              className="bg-gradient-to-r from-red-500 to-rose-600"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء أول اختبار</span>
            </Button>
          </motion.div>
        )}
      </div>

      {/* Create/Edit Exam Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingExam ? "تعديل الاختبار" : "إنشاء اختبار جديد"}
            </DialogTitle>
            <DialogDescription>
              اختر الصف والمجموعة والشهر ثم أضف الأسئلة، والأسئلة الفرعية تحت كل رأس سؤال
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>الصف *</Label>
                <Select 
                  value={examForm.gradeId} 
                  onValueChange={(val) => setExamForm(prev => ({ ...prev, gradeId: val, groupId: "" }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر الصف" />
                  </SelectTrigger>
                  <SelectContent>
                    {grades.map(grade => (
                      <SelectItem key={grade.id} value={grade.id}>{grade.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>المجموعة (اختياري)</Label>
                <Select 
                  value={examForm.groupId || "all"} 
                  onValueChange={(val) => {
                    if (val === "all") {
                      setExamForm(prev => ({ ...prev, groupId: "" }))
                    } else {
                      const group = allGroups.find(g => g.id === val)
                      setExamForm(prev => ({
                        ...prev,
                        gradeId: group ? group.gradeId : prev.gradeId,
                        groupId: val,
                      }))
                    }
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="كل المجموعات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل المجموعات (للصف كله)</SelectItem>
                    {allGroups.map(group => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.gradeName} - {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="examTitle">عنوان الاختبار *</Label>
                <Input
                  id="examTitle"
                  placeholder="مثال: اختبار شهر سبتمبر"
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
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month, index) => (
                        <SelectItem key={index} value={(index + 1).toString()}>
                          {month}
                        </SelectItem>
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
            </div>

            {/* Add Question Buttons */}
            <div>
              <Label>إضافة سؤال رئيسي (رأس السؤال يُكتب تلقائياً)</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                {QUESTION_BUTTONS.map((btn, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => addQuestion(btn.type, btn.reasoningType)}
                    className="text-xs"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{btn.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-4">
              {examForm.questions.map((question, qIndex) => (
                <Card key={question.id} className="border-gray-200 dark:border-gray-800">
                  <CardHeader 
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors py-3"
                    onClick={() => toggleQuestion(question.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge className="bg-gradient-to-br from-indigo-500 to-purple-600">
                          السؤال {ARABIC_ORDINALS[qIndex] || qIndex + 1}
                        </Badge>
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                          {getQuestionHeader(question)}
                        </span>
                        <span className="text-xs text-gray-500">
                          ({question.subQuestions.length} سؤال فرعي)
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
                        {expandedQuestions.includes(question.id) ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  {expandedQuestions.includes(question.id) && (
                    <CardContent className="space-y-4 pt-0">
                      {/* Type 4: reasoning type selector */}
                      {question.questionType === 4 && (
                        <div className="flex items-center gap-3">
                          <Label className="shrink-0">نوع السؤال:</Label>
                          <Select
                            value={question.reasoningType || "علل"}
                            onValueChange={(val) => updateReasoningType(question.id, val)}
                          >
                            <SelectTrigger className="w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="علل">علل لما يأتي</SelectItem>
                              <SelectItem value="بم تفسر">بم تفسر</SelectItem>
                              <SelectItem value="اذكر أهمية">اذكر أهمية</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Sub Questions */}
                      <div className="space-y-3">
                        {question.subQuestions.map((sq, index) => (
                          <div key={sq.id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 space-y-3 bg-gray-50/50 dark:bg-gray-800/30">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-xs">
                                السؤال الفرعي {index + 1}
                              </Badge>
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

                            {/* ===== Type 1: اختر الإجابة الصحيحة ===== */}
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
                                <div className="grid grid-cols-2 gap-2">
                                  {sq.choices?.map((choice) => (
                                    <div key={choice.id} className="flex items-center gap-2">
                                      <span className="text-sm font-bold text-gray-500 w-4 shrink-0">{choice.choiceKey} -</span>
                                      <Input
                                        placeholder={`الخيار ${choice.choiceKey}`}
                                        value={choice.choiceText}
                                        onChange={(e) => updateChoice(question.id, sq.id, choice.id, e.target.value)}
                                        className="h-8 text-sm"
                                      />
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs shrink-0">الإجابة الصحيحة:</Label>
                                  <Select
                                    value={sq.choices?.find(c => c.isCorrect)?.id || ""}
                                    onValueChange={(val) => setCorrectChoice(question.id, sq.id, val)}
                                  >
                                    <SelectTrigger className="w-56 h-8">
                                      <SelectValue placeholder="حدد الإجابة الصحيحة" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {sq.choices?.map(c => (
                                        <SelectItem key={c.id} value={c.id}>
                                          {c.choiceKey} - {c.choiceText || `الخيار ${c.choiceKey}`}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </>
                            )}

                            {/* ===== Type 2: أكمل ===== */}
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
                                    <SelectTrigger className="w-56 h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="between">في منتصف الجملتين</SelectItem>
                                      <SelectItem value="after">في نهاية الجملة</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {/* معاينة مصغرة */}
                                <p className="text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 rounded-md p-2 border border-gray-100 dark:border-gray-800">
                                  {renderComplete(sq)}
                                </p>
                              </>
                            )}

                            {/* ===== Type 3: صح أو خطأ ===== */}
                            {question.questionType === 3 && (
                              <div>
                                <Label className="text-xs">نص العبارة (سيُضاف (   ) في نهايتها تلقائياً)</Label>
                                <Input
                                  placeholder="مثال: القمر يدور حول الأرض"
                                  value={sq.questionText}
                                  onChange={(e) => updateSubQuestion(question.id, sq.id, "questionText", e.target.value)}
                                  className="mt-1"
                                />
                              </div>
                            )}

                            {/* ===== Type 4: علل / بم تفسر / اذكر أهمية ===== */}
                            {question.questionType === 4 && (
                              <>
                                <div>
                                  <Label className="text-xs">نص العبارة</Label>
                                  <Input
                                    placeholder="مثال: الشروق يكون من الشرق"
                                    value={sq.questionText}
                                    onChange={(e) => updateSubQuestion(question.id, sq.id, "questionText", e.target.value)}
                                    className="mt-1"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs shrink-0">أسطر الإجابة:</Label>
                                  <Select
                                    value={(sq.answerLines || 2).toString()}
                                    onValueChange={(val) => updateSubQuestion(question.id, sq.id, "answerLines", parseInt(val))}
                                  >
                                    <SelectTrigger className="w-32 h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="1">سطر واحد</SelectItem>
                                      <SelectItem value="2">سطران</SelectItem>
                                      <SelectItem value="3">ثلاثة أسطر</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </>
                            )}

                            {/* ===== Type 5: صحح ما تحته خط ===== */}
                            {question.questionType === 5 && (
                              <>
                                <div>
                                  <Label className="text-xs">نص الجملة</Label>
                                  <Input
                                    placeholder="مثال: الشمس تشرق من الغرب"
                                    value={sq.questionText}
                                    onChange={(e) => updateSubQuestion(question.id, sq.id, "questionText", e.target.value)}
                                    className="mt-1"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-xs">الخط يبدأ من كلمة رقم</Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      value={sq.corrections?.[0]?.wordPosition || 1}
                                      onChange={(e) => updateCorrection(question.id, sq.id, "wordPosition", parseInt(e.target.value) || 1)}
                                      className="mt-1 h-8 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">عدد الكلمات تحتها خط</Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      value={sq.corrections?.[0]?.wordCount || 1}
                                      onChange={(e) => updateCorrection(question.id, sq.id, "wordCount", parseInt(e.target.value) || 1)}
                                      className="mt-1 h-8 text-sm"
                                    />
                                  </div>
                                </div>
                                {sq.questionText && (
                                  <p className="text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 rounded-md p-2 border border-gray-100 dark:border-gray-800">
                                    {renderCorrectionSentence(sq)}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        ))}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addSubQuestion(question.id)}
                          className="w-full"
                        >
                          <Plus className="w-4 h-4" />
                          <span>إضافة سؤال فرعي ({question.subQuestions.length})</span>
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
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
                إجمالي الأسئلة: {examForm.questions.length} سؤال رئيسي • {totalSubQuestions} سؤال فرعي
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={saveExam}
              className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700"
            >
              {editingExam ? "حفظ التعديلات" : "حفظ الاختبار"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>معاينة الاختبار</DialogTitle>
          </DialogHeader>
          {previewExam && (
            <div id="exam-preview-content" className="py-4 space-y-6 bg-white text-gray-900 p-6 rounded-lg">
              {/* Exam Header */}
              <div className="text-center border-b border-gray-300 pb-4">
                <h2 className="text-2xl font-bold">
                  {previewExam.title}
                </h2>
                <p className="text-gray-600 mt-1">
                  {getGradeName(previewExam.gradeId)}
                  {previewExam.groupId && ` - ${getGroupName(previewExam.groupId)}`}
                  {previewExam.unit && ` - الوحدة ${previewExam.unit}`}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  العام الدراسي: {previewExam.academicYear} • المدة: {previewExam.duration} دقيقة
                </p>
              </div>

              {/* Questions */}
              <div className="space-y-7">
                {previewExam.questions.map((question, qi) => (
                  <div key={question.id} className="space-y-3">
                    <h3 className="font-bold text-lg">
                      السؤال {ARABIC_ORDINALS[qi] || qi + 1}: {getQuestionHeader(question)}
                    </h3>

                    <div className="space-y-4 pr-5">
                      {question.subQuestions.map((sq, index) => (
                        <div key={sq.id}>
                          {/* Type 1 */}
                          {question.questionType === 1 && (
                            <div className="space-y-1">
                              <p>
                                <span className="font-bold">{index + 1} -</span> {sq.questionText}
                              </p>
                              <div className="flex flex-wrap gap-x-8 gap-y-1 pr-6">
                                {sq.choices?.map(choice => (
                                  <span key={choice.id}>
                                    {choice.choiceKey} - {choice.choiceText}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Type 2 */}
                          {question.questionType === 2 && (
                            <p>
                              <span className="font-bold">{index + 1} -</span> {renderComplete(sq)}
                            </p>
                          )}

                          {/* Type 3 */}
                          {question.questionType === 3 && (
                            <p>
                              <span className="font-bold">{index + 1} -</span> {sq.questionText}{" "}
                              <span className="text-gray-500">(    )</span>
                            </p>
                          )}

                          {/* Type 4 */}
                          {question.questionType === 4 && (
                            <div className="space-y-2">
                              <p>
                                <span className="font-bold">{index + 1} -</span> {sq.questionText}
                              </p>
                              {Array.from({ length: sq.answerLines || 2 }).map((_, li) => (
                                <p key={li} className="pr-6 text-gray-400 tracking-wider">
                                  {DOTS_LINE}
                                </p>
                              ))}
                            </div>
                          )}

                          {/* Type 5 */}
                          {question.questionType === 5 && (
                            <div className="space-y-2">
                              <p>
                                <span className="font-bold">{index + 1} -</span> {renderCorrectionSentence(sq)}
                              </p>
                              <p className="pr-6 text-gray-400 tracking-wider">{DOTS_LINE}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              إغلاق
            </Button>
            <Button 
              onClick={async () => {
                try {
                  await exportToPDF('exam-preview-content', `${previewExam?.title || 'اختبار'}-${new Date().toLocaleDateString('ar-EG')}`, {
                    orientation: 'portrait',
                    scale: 2,
                  })
                  toast.success('تم تحميل الاختبار بنجاح')
                } catch (error) {
                  toast.error('حدث خطأ أثناء التصدير')
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
