"use client"

import React, { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Calendar, 
  Plus, 
  Clock, 
  Users, 
  Edit2, 
  Trash2, 
  Search,
  BookOpen,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Printer,
  FileDown,
  Share2,
  AlertTriangle,
  CalendarX2
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import toast from "react-hot-toast"
import { Grade, Group, getGrades, saveGrades, getStudents, getStoredAcademicYear } from "@/lib/data-storage"
import {
  findScheduleConflicts,
  buildConflictMessage,
  isTimeAfter,
  type ScheduleConflict,
} from "@/lib/schedule"
import { SchedulePublishDialog } from "@/components/schedule-publish-dialog"
import { SchedulePrintDialog } from "@/components/schedule-print-dialog"
import type { SchedulePrintOptions } from "@/lib/schedule-print"
import SampleDataBanner from "@/components/sample-data-banner"
import { TimePicker } from "@/components/time-picker"
import { formatTime12, addDuration } from "@/lib/utils"

// Days of week
const DAYS = [
  { value: "السبت", label: "السبت" },
  { value: "الأحد", label: "الأحد" },
  { value: "الاثنين", label: "الاثنين" },
  { value: "الثلاثاء", label: "الثلاثاء" },
  { value: "الأربعاء", label: "الأربعاء" },
  { value: "الخميس", label: "الخميس" },
  { value: "الجمعة", label: "الجمعة" },
]

// Day colors
const dayColors: Record<string, string> = {
  "السبت": "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  "الأحد": "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  "الاثنين": "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  "الثلاثاء": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  "الأربعاء": "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  "الخميس": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  "الجمعة": "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
}

export default function GradesPage() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [expandedGrades, setExpandedGrades] = useState<string[]>([])
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [editingGrade, setEditingGrade] = useState<Grade | null>(null)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [selectedGradeId, setSelectedGradeId] = useState<string>("")
  const [showSchedule, setShowSchedule] = useState(false)

  // نشر الجدول للطلاب + حوارات الطباعة
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [printOptions, setPrintOptions] = useState<SchedulePrintOptions | null>(null)
  const [printMode, setPrintMode] = useState<"teacher" | "student">("teacher")

  const openPrintDialog = (mode: "teacher" | "student") => {
    setPrintMode(mode)
    setPrintOptions({
      mode,
      grades,
      students: getStudents(),
      academicYear: getStoredAcademicYear(),
    })
    setPrintDialogOpen(true)
  }

  
  const [gradeForm, setGradeForm] = useState({
    name: "",
    academicYear: getStoredAcademicYear(),
  })
  
  const [groupForm, setGroupForm] = useState({
    name: "",
    days: [] as string[],
    startTime: "16:00",
    endTime: "18:00",
    monthlyFee: 0,
  })

  // Load data
  useEffect(() => {
    setGrades(getGrades())
  }, [])

  // ---- منع تسجيل مجموعتين في نفس الموعد ----
  // فحص فوري أثناء إدخال البيانات: يكفي أن يتطابق يوم واحد مع تقاطع
  // في الوقت مع أي مجموعة أخرى (في أي صف) ليُعتبر الموعد محجوزاً.
  const liveConflicts: ScheduleConflict[] = useMemo(() => {
    if (!groupDialogOpen) return []
    return findScheduleConflicts(
      grades,
      { days: groupForm.days, startTime: groupForm.startTime, endTime: groupForm.endTime },
      { groupId: editingGroup?.id }
    )
  }, [groupDialogOpen, grades, groupForm.days, groupForm.startTime, groupForm.endTime, editingGroup])

  // Filter grades
  const filteredGrades = grades.filter(grade =>
    grade.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Toggle grade expansion
  const toggleGrade = (gradeId: string) => {
    setExpandedGrades(prev =>
      prev.includes(gradeId)
        ? prev.filter(id => id !== gradeId)
        : [...prev, gradeId]
    )
  }

  // Update student counts
  const updateStudentCounts = (gradesList: Grade[]) => {
    const students = getStudents()
    const updated = gradesList.map(grade => ({
      ...grade,
      groups: grade.groups.map(group => ({
        ...group,
        studentsCount: students.filter(s => s.groupId === group.id && s.status === 'active').length,
      })),
    }))
    return updated
  }

  // Open grade dialog
  const openGradeDialog = (grade?: Grade) => {
    if (grade) {
      setEditingGrade(grade)
      setGradeForm({
        name: grade.name,
        academicYear: grade.academicYear,
      })
    } else {
      setEditingGrade(null)
      setGradeForm({ name: "", academicYear: getStoredAcademicYear() })
    }
    setGradeDialogOpen(true)
  }

  // Save grade
  const saveGrade = () => {
    if (!gradeForm.name.trim()) return

    let updatedGrades: Grade[]
    if (editingGrade) {
      updatedGrades = grades.map(g =>
        g.id === editingGrade.id
          ? { ...g, name: gradeForm.name, academicYear: gradeForm.academicYear }
          : g
      )
    } else {
      const newGrade: Grade = {
        id: Date.now().toString(),
        name: gradeForm.name,
        academicYear: gradeForm.academicYear,
        createdAt: new Date().toISOString(),
        groups: [],
      }
      updatedGrades = [...grades, newGrade]
    }

    updatedGrades = updateStudentCounts(updatedGrades)
    setGrades(updatedGrades)
    saveGrades(updatedGrades)
    setGradeDialogOpen(false)
    toast.success(editingGrade ? "تم تحديث الصف بنجاح" : "تم إضافة الصف بنجاح")
  }

  // Delete grade
  const deleteGrade = (gradeId: string) => {
    if (confirm("هل أنت متأكد من حذف هذا الصف وجميع مجموعاته؟")) {
      const updatedGrades = grades.filter(g => g.id !== gradeId)
      setGrades(updatedGrades)
      saveGrades(updatedGrades)
      toast.success("تم حذف الصف بنجاح")
    }
  }

  // Open group dialog
  const openGroupDialog = (gradeId: string, group?: Group) => {
    setSelectedGradeId(gradeId)
    if (group) {
      setEditingGroup(group)
      setGroupForm({
        name: group.name,
        days: group.days,
        startTime: group.startTime,
        endTime: group.endTime,
        monthlyFee: group.monthlyFee,
      })
    } else {
      setEditingGroup(null)
      setGroupForm({
        name: "",
        days: [],
        startTime: "16:00",
        endTime: "18:00",
        monthlyFee: 0,
      })
    }
    setGroupDialogOpen(true)
  }

  // Toggle day selection
  const toggleDay = (day: string) => {
    setGroupForm(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter(d => d !== day)
        : [...prev.days, day],
    }))
  }

  // Save group
  const saveGroup = () => {
    if (!groupForm.name.trim() || groupForm.days.length === 0 || !groupForm.startTime || !groupForm.endTime) {
      toast.error("يرجى ملء جميع الحقول المطلوبة")
      return
    }

    // ---- تحقق: وقت النهاية يجب أن يكون بعد وقت البداية ----
    if (!isTimeAfter(groupForm.startTime, groupForm.endTime)) {
      toast.error("وقت النهاية يجب أن يكون بعد وقت البداية")
      return
    }

    // ---- حماية نهائية: لا يمكن تسجيل مجموعتين في نفس الموعد ----
    // يفحص كل المجموعات في جميع الصفوف — يكفي يوم واحد متعارض لمنع الحفظ
    const conflicts = findScheduleConflicts(
      grades,
      { days: groupForm.days, startTime: groupForm.startTime, endTime: groupForm.endTime },
      { groupId: editingGroup?.id }
    )
    if (conflicts.length > 0) {
      toast.error(buildConflictMessage(conflicts), { duration: 8000 })
      return
    }

    const groupData: Group = {
      id: editingGroup?.id || Date.now().toString(),
      name: groupForm.name,
      days: groupForm.days,
      startTime: groupForm.startTime,
      endTime: groupForm.endTime,
      monthlyFee: groupForm.monthlyFee,
      studentsCount: editingGroup?.studentsCount || 0,
    }

    let updatedGrades = grades.map(grade => {
      if (grade.id === selectedGradeId) {
        if (editingGroup) {
          return {
            ...grade,
            groups: grade.groups.map(g =>
              g.id === editingGroup.id ? groupData : g
            ),
          }
        } else {
          return {
            ...grade,
            groups: [...grade.groups, groupData],
          }
        }
      }
      return grade
    })

    updatedGrades = updateStudentCounts(updatedGrades)
    setGrades(updatedGrades)
    saveGrades(updatedGrades)
    setGroupDialogOpen(false)
    toast.success(editingGroup ? "تم تحديث المجموعة بنجاح" : "تم إضافة المجموعة بنجاح")
  }

  // Delete group
  const deleteGroup = (gradeId: string, groupId: string) => {
    if (confirm("هل أنت متأكد من حذف هذه المجموعة؟")) {
      let updatedGrades = grades.map(grade => {
        if (grade.id === gradeId) {
          return {
            ...grade,
            groups: grade.groups.filter(g => g.id !== groupId),
          }
        }
        return grade
      })

      updatedGrades = updateStudentCounts(updatedGrades)
      setGrades(updatedGrades)
      saveGrades(updatedGrades)
      toast.success("تم حذف المجموعة بنجاح")
    }
  }

  // Calculate stats
  const totalGrades = grades.length
  const totalGroups = grades.reduce((sum, g) => sum + g.groups.length, 0)
  const totalStudents = grades.reduce(
    (sum, g) => sum + g.groups.reduce((s, gr) => s + gr.studentsCount, 0),
    0
  )

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
            الصفوف والمواعيد
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            إدارة الصفوف الدراسية والمجموعات والمواعيد
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline"
            onClick={() => setShowSchedule(!showSchedule)}
            className="border-purple-500 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950"
          >
            <Calendar className="w-5 h-5" />
            <span>{showSchedule ? 'عرض القوائم' : 'الجدول الأسبوعي'}</span>
          </Button>
          <Button 
            onClick={() => openGradeDialog()}
            className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 shadow-lg"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة صف جديد</span>
          </Button>
          <Button
            onClick={() => setPublishDialogOpen(true)}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg"
          >
            <Share2 className="w-5 h-5" />
            <span>نشر الجدول للطلاب</span>
          </Button>
          <Button
            onClick={() => openPrintDialog("student")}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg"
          >
            <FileDown className="w-5 h-5" />
            <span>طباعة الجدول للطلاب (PDF)</span>
          </Button>
          <Button
            onClick={() => openPrintDialog("teacher")}
            className="bg-gradient-to-r from-gray-700 to-gray-900 hover:from-gray-800 hover:to-black shadow-lg"
          >
            <Printer className="w-5 h-5" />
            <span>طباعة الجدول التفصيلي الخاص بالمدرس</span>
          </Button>
        </div>
      </motion.div>

      {/* تنبيه البيانات التجريبية */}
      <SampleDataBanner onRemoved={() => setGrades(getGrades())} />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: BookOpen, label: "الصفوف", value: totalGrades, color: "from-purple-500 to-pink-600" },
          { icon: Calendar, label: "المجموعات", value: totalGroups, color: "from-blue-500 to-indigo-600" },
          { icon: Users, label: "إجمالي الطلاب", value: totalStudents, color: "from-green-500 to-emerald-600" },
        ].map((stat, index) => {
          const Icon = stat.icon
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg mb-4`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
            </motion.div>
          )
        })}
      </div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="relative"
      >
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <Input
          placeholder="ابحث عن صف..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pr-12 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg h-12"
        />
      </motion.div>

      {/* Weekly Schedule View */}
      {showSchedule && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg"
        >
          <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-500" />
            الجدول الأسبوعي
          </h3>
          <div className="overflow-x-auto">
            <div className="grid grid-cols-7 gap-2 min-w-[700px]">
              {DAYS.map(day => {
                const dayGroups = grades.flatMap(g => 
                  g.groups
                    .filter(gr => gr.days.includes(day.value))
                    .map(gr => ({ ...gr, gradeName: g.name }))
                ).sort((a, b) => a.startTime.localeCompare(b.startTime))
                
                return (
                  <div key={day.value} className="space-y-2">
                    <div className={`${dayColors[day.value]} rounded-lg p-2 text-center font-bold`}>
                      {day.label}
                    </div>
                    <div className="space-y-2 min-h-[200px]">
                      {dayGroups.length === 0 ? (
                        <p className="text-center text-gray-400 text-xs py-4">لا توجد حصص</p>
                      ) : (
                        dayGroups.map(group => (
                          <div
                            key={group.id}
                            className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-700 text-xs"
                          >
                            <p className="font-semibold text-gray-900 dark:text-white truncate">
                              {group.gradeName}
                            </p>
                            <p className="text-gray-500 truncate">{group.name}</p>
                            <p className="text-indigo-600 dark:text-indigo-400 font-medium mt-1">
                              {formatTime12(group.startTime)} - {formatTime12(group.endTime)}
                            </p>
                            <p className="text-gray-500 mt-1">
                              {group.studentsCount} طالب • {group.monthlyFee} ج.م
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Grades List */}
      {!showSchedule && (
      <div className="space-y-4">
        <AnimatePresence>
          {filteredGrades.map((grade, index) => {
            const isExpanded = expandedGrades.includes(grade.id)
            
            return (
              <motion.div
                key={grade.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg">
                  <CardHeader 
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => toggleGrade(grade.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
                          <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-xl text-gray-900 dark:text-white">
                            {grade.name}
                          </CardTitle>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            العام الدراسي: {grade.academicYear} • {grade.groups.length} مجموعة • {grade.groups.reduce((s, g) => s + g.studentsCount, 0)} طالب
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            openGradeDialog(grade)
                          }}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                        >
                          <Edit2 className="w-5 h-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteGrade(grade.id)
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <CardContent className="pt-0">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                              المجموعات ({grade.groups.length})
                            </h3>
                            <Button
                              size="sm"
                              onClick={() => openGroupDialog(grade.id)}
                              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                            >
                              <Plus className="w-4 h-4" />
                              <span>إضافة مجموعة</span>
                            </Button>
                          </div>

                          {grade.groups.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                              <p>لا توجد مجموعات في هذا الصف</p>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openGroupDialog(grade.id)}
                                className="mt-3"
                              >
                                <Plus className="w-4 h-4" />
                                <span>إضافة أول مجموعة</span>
                              </Button>
                            </div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>اسم المجموعة</TableHead>
                                  <TableHead>الأيام</TableHead>
                                  <TableHead>الوقت</TableHead>
                                  <TableHead>السعر الشهري</TableHead>
                                  <TableHead>عدد الطلاب</TableHead>
                                  <TableHead className="text-left">إجراءات</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {grade.groups.map((group) => (
                                  <TableRow key={group.id}>
                                    <TableCell className="font-medium text-gray-900 dark:text-white">
                                      {group.name}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-wrap gap-1">
                                        {group.days.map((day) => (
                                          <Badge
                                            key={day}
                                            variant="outline"
                                            className={dayColors[day]}
                                          >
                                            {day}
                                          </Badge>
                                        ))}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-gray-600 dark:text-gray-400">
                                      <div className="flex items-center gap-1 font-medium">
                                        <Clock className="w-4 h-4 text-indigo-500" />
                                        {formatTime12(group.startTime)} - {formatTime12(group.endTime)}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-gray-900 dark:text-white font-semibold">
                                      <div className="flex items-center gap-1">
                                        <DollarSign className="w-4 h-4" />
                                        {group.monthlyFee} ج.م
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                        {group.studentsCount} طالب
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => openGroupDialog(grade.id, group)}
                                          className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => deleteGroup(grade.id, group.id)}
                                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {filteredGrades.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"
          >
            <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-700" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {grades.length === 0 ? "لا توجد صفوف بعد" : "لا توجد نتائج مطابقة"}
            </p>
            {grades.length === 0 && (
              <Button onClick={() => openGradeDialog()} className="bg-gradient-to-r from-purple-500 to-pink-600">
                <Plus className="w-4 h-4" />
                <span>إضافة أول صف</span>
              </Button>
            )}
          </motion.div>
        )}
      </div>
      )}

      {/* Grade Dialog */}
      <Dialog open={gradeDialogOpen} onOpenChange={setGradeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingGrade ? "تعديل الصف" : "إضافة صف جديد"}
            </DialogTitle>
            <DialogDescription>
              {editingGrade ? "قم بتعديل بيانات الصف" : "أدخل بيانات الصف الجديد"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="gradeName">اسم الصف *</Label>
              <Input
                id="gradeName"
                placeholder="مثال: الصف الرابع الابتدائي"
                value={gradeForm.name}
                onChange={(e) => setGradeForm(prev => ({ ...prev, name: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="academicYear">العام الدراسي *</Label>
              <Input
                id="academicYear"
                placeholder="مثال: 2026-2027"
                value={gradeForm.academicYear}
                onChange={(e) => setGradeForm(prev => ({ ...prev, academicYear: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGradeDialogOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={saveGrade}
              className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
            >
              {editingGrade ? "حفظ التعديلات" : "إضافة الصف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? "تعديل المجموعة" : "إضافة مجموعة جديدة"}
            </DialogTitle>
            <DialogDescription>
              {editingGroup ? "قم بتعديل بيانات المجموعة" : "أدخل بيانات المجموعة الجديدة"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="groupName">اسم المجموعة *</Label>
              <Input
                id="groupName"
                placeholder="مثال: مجموعة 1"
                value={groupForm.name}
                onChange={(e) => setGroupForm(prev => ({ ...prev, name: e.target.value }))}
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>أيام الدرس *</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                {DAYS.map((day) => (
                  <div
                    key={day.value}
                    className="flex items-center space-x-2 space-x-reverse"
                  >
                    <Checkbox
                      id={`day-${day.value}`}
                      checked={groupForm.days.includes(day.value)}
                      onCheckedChange={() => toggleDay(day.value)}
                    />
                    <Label htmlFor={`day-${day.value}`} className="cursor-pointer">
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TimePicker
                  label="وقت البداية"
                  value={groupForm.startTime || "16:00"}
                  onChange={(val) => {
                    setGroupForm(prev => {
                      const currentStart = prev.startTime || "16:00"
                      const currentEnd = prev.endTime || "18:00"
                      // تحديث تلقائي لوقت النهاية ليحافظ على الفارق إذا رغب المعلم
                      return {
                        ...prev,
                        startTime: val,
                        endTime: currentEnd ? currentEnd : addDuration(val, 120),
                      }
                    })
                  }}
                  required
                />
                <div className="space-y-1.5">
                  <TimePicker
                    label="وقت النهاية"
                    value={groupForm.endTime || "18:00"}
                    onChange={(val) => setGroupForm(prev => ({ ...prev, endTime: val }))}
                    required
                  />
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className="text-[10px] text-gray-500 font-medium">مدة الحصة:</span>
                    <button
                      type="button"
                      onClick={() => setGroupForm(prev => ({ ...prev, endTime: addDuration(prev.startTime || "16:00", 60) }))}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                    >
                      ساعة
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupForm(prev => ({ ...prev, endTime: addDuration(prev.startTime || "16:00", 90) }))}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                    >
                      ساعة ونصف
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupForm(prev => ({ ...prev, endTime: addDuration(prev.startTime || "16:00", 120) }))}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                    >
                      ساعتان
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* تنبيه فوري: وقت النهاية قبل البداية */}
            {groupForm.startTime && groupForm.endTime && !isTimeAfter(groupForm.startTime, groupForm.endTime) && (
              <div className="rounded-xl border-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
                <p className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  وقت النهاية يجب أن يكون بعد وقت البداية — عدّل الوقت قبل الحفظ
                </p>
              </div>
            )}

            {/* تنبيه فوري: منع تسجيل مجموعتين في نفس الموعد */}
            {liveConflicts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border-2 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 space-y-2"
              >
                <p className="font-bold text-red-700 dark:text-red-300 flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  لا يمكن حفظ المجموعة — الموعد محجوز لمجموعة أخرى
                </p>
                <ul className="space-y-1.5 pr-2">
                  {liveConflicts.slice(0, 6).map((c, i) => (
                    <li key={`${c.group.id}-${c.day}-${i}`} className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                      • يوم «{c.day}» من{" "}
                      {formatTime12(c.group.startTime)} إلى {formatTime12(c.group.endTime)} مسجَّل
                      بالفعل لمجموعة «{c.group.name}» في {c.gradeName} (مواعيدها:{" "}
                      {c.group.days.join(" و")} — {formatTime12(c.group.startTime)} إلى{" "}
                      {formatTime12(c.group.endTime)})
                    </li>
                  ))}
                  {liveConflicts.length > 6 && (
                    <li className="text-xs text-red-600 font-semibold">
                      و {liveConflicts.length - 6} تعارضات أخرى...
                    </li>
                  )}
                </ul>
                <p className="text-[11px] text-red-600/80 dark:text-red-400/80 flex items-center gap-1.5">
                  <CalendarX2 className="w-3.5 h-3.5 shrink-0" />
                  كل موعد (نفس اليوم ونفس الوقت) مخصص لمجموعة واحدة فقط — حتى لو تطابق يوم واحد
                  فقط من أيام المجموعة.
                </p>
              </motion.div>
            )}

            <div>
              <Label htmlFor="monthlyFee">السعر الشهري (ج.م) *</Label>
              <Input
                id="monthlyFee"
                type="number"
                placeholder="150"
                value={groupForm.monthlyFee || ""}
                onChange={(e) => setGroupForm(prev => ({ ...prev, monthlyFee: parseFloat(e.target.value) || 0 }))}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={saveGroup}
              disabled={liveConflicts.length > 0 || (!!groupForm.startTime && !!groupForm.endTime && !isTimeAfter(groupForm.startTime, groupForm.endTime))}
              title={liveConflicts.length > 0 ? "الموعد محجوز لمجموعة أخرى — غيّر اليوم أو الوقت" : undefined}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {liveConflicts.length > 0 ? (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  <span>الموعد محجوز لمجموعة أخرى</span>
                </>
              ) : (
                <span>{editingGroup ? "حفظ التعديلات" : "إضافة المجموعة"}</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* حوار نشر الجدول للطلاب */}
      <SchedulePublishDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        grades={grades}
      />

      {/* حوار معاينة وطباعة الجدول (نسخة المدرس التفصيلية / نسخة الطلاب) */}
      <SchedulePrintDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        options={printOptions}
        title={
          printMode === "teacher"
            ? "طباعة الجدول التفصيلي الخاص بالمدرس"
            : "طباعة الجدول للطلاب"
        }
        description={
          printMode === "teacher"
            ? "نسخة كاملة تتضمن كل مجموعة بالأيام والوقت والسعر الشهري وأسماء الطلاب وأرقامهم وأرصدتهم المالية — خاصة بك ولا تُنشر للطلاب."
            : "نسخة آمنة للتوزيع تعرض المواعيد فقط (الصف، المجموعة، الأيام، الوقت) — بدون أسعار أو أسماء طلاب أو أرقام هواتف."
        }
      />
    </div>
  )
}
