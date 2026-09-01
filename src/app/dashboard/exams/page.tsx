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
  getGrades,
  getExams,
  saveExams,
} from "@/lib/data-storage"

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
]

const QUESTION_TYPES = [
  { id: 1, label: "اختر الإجابة الصحيحة", desc: "سؤال متعدد الخيارات" },
  { id: 2, label: "أكمل", desc: "إكمال الجمل الناقصة" },
  { id: 3, label: "صح أو خطأ", desc: "ضع علامة صح أو خطأ" },
  { id: 4, label: "علل / بم تفسر / اذكر أهمية", desc: "أسئلة التعليل والتفسير" },
  { id: 5, label: "صحح ما تحته خط", desc: "تصحيح الكلمات الخاطئة" },
]

const SUBTYPE_4 = [
  { id: "علل", label: "علل لما يأتي" },
  { id: "بم تفسر", label: "بم تفسر" },
  { id: "اذكر أهمية", label: "اذكر أهمية" },
]

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
    academicYear: "2025-2026",
    duration: 60,
    totalMarks: 0,
    questions: [] as Question[],
  })

  useEffect(() => {
    setGrades(getGrades())
    setExams(getExams())
  }, [])

  // Available groups
  const availableGroups = grades.find(g => g.id === examForm.gradeId)?.groups || []

  // Toggle question expansion
  const toggleQuestion = (questionId: string) => {
    setExpandedQuestions(prev =>
      prev.includes(questionId)
        ? prev.filter(id => id !== questionId)
        : [...prev, questionId]
    )
  }

  // Add new question
  const addQuestion = (type: 1 | 2 | 3 | 4 | 5) => {
    const questionNumber = examForm.questions.length + 1
    const newQuestion: Question = {
      id: Date.now().toString(),
      questionType: type,
      questionNumber,
      orderNumber: questionNumber,
      headerText: "",
      subQuestions: [
        {
          id: Date.now().toString() + "-1",
          orderNumber: 1,
          questionText: "",
          marks: 1,
          choices: type === 1 ? [
            { id: "1", choiceKey: "أ", choiceText: "", isCorrect: false },
            { id: "2", choiceKey: "ب", choiceText: "", isCorrect: false },
            { id: "3", choiceKey: "ج", choiceText: "", isCorrect: false },
            { id: "4", choiceKey: "د", choiceText: "", isCorrect: false },
          ] : undefined,
          parts: type === 2 ? [
            { id: "1", partOrder: 1, partText: "", blankPosition: "after" },
          ] : undefined,
          corrections: type === 5 ? [
            { id: "1", wrongWord: "", correctAnswer: "", wordPosition: 0 },
          ] : undefined,
        },
      ],
    }

    setExamForm(prev => ({
      ...prev,
      questions: [...prev.questions, newQuestion],
    }))
    setExpandedQuestions(prev => [...prev, newQuestion.id])
  }

  // Update question header
  const updateQuestionHeader = (questionId: string, text: string) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q =>
        q.id === questionId ? { ...q, headerText: text } : q
      ),
    }))
  }

  // Add sub-question
  const addSubQuestion = (questionId: string) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => {
        if (q.id === questionId) {
          const newSubQuestion: SubQuestion = {
            id: Date.now().toString(),
            orderNumber: q.subQuestions.length + 1,
            questionText: "",
            marks: 1,
            choices: q.questionType === 1 ? [
              { id: "1", choiceKey: "أ", choiceText: "", isCorrect: false },
              { id: "2", choiceKey: "ب", choiceText: "", isCorrect: false },
              { id: "3", choiceKey: "ج", choiceText: "", isCorrect: false },
              { id: "4", choiceKey: "د", choiceText: "", isCorrect: false },
            ] : undefined,
            parts: q.questionType === 2 ? [
              { id: "1", partOrder: 1, partText: "", blankPosition: "after" },
            ] : undefined,
            corrections: q.questionType === 5 ? [
              { id: "1", wrongWord: "", correctAnswer: "", wordPosition: 0 },
            ] : undefined,
          }
          return { ...q, subQuestions: [...q.subQuestions, newSubQuestion] }
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

  // Update choice
  const updateChoice = (questionId: string, subQuestionId: string, choiceId: string, field: string, value: any) => {
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
                  choices: sq.choices.map(c =>
                    c.id === choiceId ? { ...c, [field]: value } : c
                  ),
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

  // Update part
  const updatePart = (questionId: string, subQuestionId: string, partId: string, field: string, value: any) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => {
        if (q.id === questionId) {
          return {
            ...q,
            subQuestions: q.subQuestions.map(sq => {
              if (sq.id === subQuestionId && sq.parts) {
                return {
                  ...sq,
                  parts: sq.parts.map(p =>
                    p.id === partId ? { ...p, [field]: value } : p
                  ),
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

  // Add part
  const addPart = (questionId: string, subQuestionId: string) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => {
        if (q.id === questionId) {
          return {
            ...q,
            subQuestions: q.subQuestions.map(sq => {
              if (sq.id === subQuestionId && sq.parts) {
                return {
                  ...sq,
                  parts: [...sq.parts, {
                    id: Date.now().toString(),
                    partOrder: sq.parts.length + 1,
                    partText: "",
                    blankPosition: "after",
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
        academicYear: "2025-2026",
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
          أنواع الأسئلة المتاحة (5 أنواع)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
              قم بملء بيانات الاختبار وإضافة الأسئلة
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
                  value={examForm.groupId} 
                  onValueChange={(val) => setExamForm(prev => ({ ...prev, groupId: val }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="كل المجموعات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">كل المجموعات</SelectItem>
                    {availableGroups.map(group => (
                      <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="examTitle">عنوان الاختبار *</Label>
                <Input
                  id="examTitle"
                  placeholder="مثال: اختبار شهر أغسطس"
                  value={examForm.title}
                  onChange={(e) => setExamForm(prev => ({ ...prev, title: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
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
              <Label>إضافة سؤال</Label>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mt-2">
                {QUESTION_TYPES.map(type => (
                  <Button
                    key={type.id}
                    variant="outline"
                    size="sm"
                    onClick={() => addQuestion(type.id as 1 | 2 | 3 | 4 | 5)}
                    className="text-xs"
                  >
                    <Plus className="w-3 h-3" />
                    <span>النوع {type.id}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-4">
              {examForm.questions.map((question) => (
                <Card key={question.id} className="border-gray-200 dark:border-gray-800">
                  <CardHeader 
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors py-3"
                    onClick={() => toggleQuestion(question.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge className="bg-gradient-to-br from-indigo-500 to-purple-600">
                          السؤال {question.questionNumber}
                        </Badge>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {QUESTION_TYPES.find(t => t.id === question.questionType)?.label}
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
                      {/* Question Header */}
                      <div>
                        <Label>رأس السؤال (نص السؤال الرئيسي)</Label>
                        <Input
                          placeholder={
                            question.questionType === 1 ? "السؤال الأول: اختر الإجابة الصحيحة" :
                            question.questionType === 2 ? "السؤال الثاني: أكمل ما يأتي" :
                            question.questionType === 3 ? "السؤال الثالث: ضع علامة (صح) أو (خطأ)" :
                            question.questionType === 4 ? "السؤال الرابع: علل لما يأتي" :
                            "السؤال الخامس: صحح ما تحته خط"
                          }
                          value={question.headerText}
                          onChange={(e) => updateQuestionHeader(question.id, e.target.value)}
                          className="mt-1"
                        />
                      </div>

                      {/* Sub Questions */}
                      <div className="space-y-3">
                        {question.subQuestions.map((sq, index) => (
                          <div key={sq.id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-xs">
                                {index + 1})
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

                            {/* Question Text */}
                            <div>
                              <Label className="text-xs">نص السؤال</Label>
                              <Input
                                placeholder={
                                  question.questionType === 4 ? "مثال: علل: شروق الشمس من الشرق" :
                                  question.questionType === 5 ? "مثال: الشمس تشرق من الغرب" :
                                  "أدخل نص السؤال"
                                }
                                value={sq.questionText}
                                onChange={(e) => updateSubQuestion(question.id, sq.id, "questionText", e.target.value)}
                                className="mt-1"
                              />
                            </div>

                            {/* Type 1: Choices */}
                            {question.questionType === 1 && sq.choices && (
                              <div className="grid grid-cols-2 gap-2">
                                {sq.choices.map((choice) => (
                                  <div key={choice.id} className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-500 w-4">{choice.choiceKey})</span>
                                    <Input
                                      placeholder={`الخيار ${choice.choiceKey}`}
                                      value={choice.choiceText}
                                      onChange={(e) => updateChoice(question.id, sq.id, choice.id, "choiceText", e.target.value)}
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Type 2: Parts */}
                            {question.questionType === 2 && sq.parts && (
                              <div className="space-y-2">
                                {sq.parts.map((part) => (
                                  <div key={part.id} className="flex items-center gap-2">
                                    <Input
                                      placeholder={`الجزء ${part.partOrder}`}
                                      value={part.partText}
                                      onChange={(e) => updatePart(question.id, sq.id, part.id, "partText", e.target.value)}
                                      className="h-8 text-sm"
                                    />
                                    <span className="text-red-500 font-bold">___</span>
                                  </div>
                                ))}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => addPart(question.id, sq.id)}
                                  className="text-xs"
                                >
                                  <Plus className="w-3 h-3" />
                                  إضافة جزء
                                </Button>
                              </div>
                            )}

                            {/* Type 5: Corrections */}
                            {question.questionType === 5 && sq.corrections && (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs">الكلمة الخطأ</Label>
                                  <Input
                                    placeholder="الكلمة التي تحتها خط"
                                    className="h-8 text-sm mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">التصحيح</Label>
                                  <Input
                                    placeholder="الإجابة الصحيحة"
                                    className="h-8 text-sm mt-1"
                                  />
                                </div>
                              </div>
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
                          <span>إضافة سؤال فرعي</span>
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
                <p className="text-xs">اختر نوع السؤال من الأزرار أعلاه</p>
              </div>
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
            <div id="exam-preview-content" className="py-4 space-y-6 bg-white dark:bg-gray-900 p-6 rounded-lg">
              {/* Exam Header */}
              <div className="text-center border-b border-gray-300 dark:border-gray-700 pb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {previewExam.title}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  {getGradeName(previewExam.gradeId)}
                  {previewExam.unit && ` - الوحدة ${previewExam.unit}`}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  المدة: {previewExam.duration} دقيقة
                </p>
              </div>

              {/* Questions */}
              <div className="space-y-6">
                {previewExam.questions.map((question) => (
                  <div key={question.id} className="space-y-3">
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                      {question.headerText || `${QUESTION_TYPES.find(t => t.id === question.questionType)?.label}`}
                    </h3>

                    <div className="space-y-3 pr-4">
                      {question.subQuestions.map((sq, index) => (
                        <div key={sq.id} className="space-y-2">
                          <p className="text-gray-800 dark:text-gray-200">
                            <span className="font-bold">{index + 1})</span> {sq.questionText}
                          </p>

                          {/* Type 1: Choices */}
                          {question.questionType === 1 && sq.choices && (
                            <div className="flex flex-wrap gap-4 pr-4">
                              {sq.choices.map(choice => (
                                <span key={choice.id} className="text-gray-700 dark:text-gray-300">
                                  {choice.choiceKey}) {choice.choiceText}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Type 2: Parts */}
                          {question.questionType === 2 && sq.parts && (
                            <p className="text-gray-700 dark:text-gray-300 pr-4">
                              {sq.parts.map((part, i) => (
                                <span key={part.id}>
                                  {part.partText}
                                  {i < sq.parts!.length - 1 && <span className="text-red-500 font-bold mx-1">___</span>}
                                </span>
                              ))}
                            </p>
                          )}

                          {/* Type 3: True/False */}
                          {question.questionType === 3 && (
                            <p className="text-gray-700 dark:text-gray-300 pr-4">
                              (    )
                            </p>
                          )}

                          {/* Type 4: Reasoning */}
                          {question.questionType === 4 && (
                            <div className="pr-4 space-y-1">
                              <div className="border-b border-dotted border-gray-400 w-full h-6"></div>
                              <div className="border-b border-dotted border-gray-400 w-full h-6"></div>
                            </div>
                          )}

                          {/* Type 5: Correction */}
                          {question.questionType === 5 && (
                            <div className="pr-4 space-y-1">
                              <p className="text-gray-700 dark:text-gray-300">التصحيح: ........................</p>
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
              className="bg-gradient-to-r from-blue-500 to-indigo-600"
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
