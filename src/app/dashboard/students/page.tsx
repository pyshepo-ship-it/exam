"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Users, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  Phone, 
  BookOpen,
  Eye,
  Filter,
  UserCheck,
  UserX,
  DollarSign,
  Download,
  X,
  FileText,
  CheckCircle,
  AlertCircle,
  Ban,
  GraduationCap,
  KeyRound,
  Copy,
  MessageCircleQuestion
} from "lucide-react"
import {
  isStudentPortalActive,
  setStudentPortalActive,
  resetStudentPasswordByTeacher,
  updateStudentByTeacher,
} from "@/lib/student-accounts"
import { forcePushAll } from "@/lib/supabase/sync"
import { isInquiryChannelClosed, setStudentInquiryChannel } from "@/lib/inquiries"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import toast from "react-hot-toast"
import { exportToPDF } from "@/lib/pdf-utils"
import {
  Grade,
  Student,
  getAllGroups,
  getGrades,
  getStudents,
  saveStudents,
  saveGrades,
  getStudentBalance,
  getDues,
  getPayments,
  getStudentAccounts,
  deleteStudentCascade,
} from "@/lib/data-storage"

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
]

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterGrade, setFilterGrade] = useState<string>("all")
  const [filterGroup, setFilterGroup] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [statementDialogOpen, setStatementDialogOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [resetTarget, setResetTarget] = useState<Student | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetResult, setResetResult] = useState<{ studentName: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    gradeId: "",
    groupId: "",
    status: "active" as "active" | "inactive",
    notes: "",
  })

  // Load data
  useEffect(() => {
    setStudents(getStudents())
    setGrades(getGrades())
  }, [])

  // كل المجموعات في جميع الصفوف (مع اسم الصف) — حتى لا تظهر مجموعات صف واحد فقط
  const allGroups = getAllGroups(grades)

  // Filter students
  const filteredStudents = students.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (student.phone && student.phone.includes(searchTerm))
    const matchesGrade = filterGrade === "all" || student.gradeId === filterGrade
    const matchesGroup = filterGroup === "all" || student.groupId === filterGroup
    const matchesStatus = filterStatus === "all" || student.status === filterStatus
    return matchesSearch && matchesGrade && matchesGroup && matchesStatus
  })

  // Open dialog
  const openDialog = (student?: Student) => {
    if (student) {
      setEditingStudent(student)
      setForm({
        name: student.name,
        phone: student.phone || "",
        email: student.email || "",
        gradeId: student.gradeId,
        groupId: student.groupId,
        status: student.status,
        notes: student.notes || "",
      })
    } else {
      setEditingStudent(null)
      setForm({
        name: "",
        phone: "",
        email: "",
        gradeId: "",
        groupId: "",
        status: "active",
        notes: "",
      })
    }
    setDialogOpen(true)
  }

  // Save student
  const saveStudent = () => {
    if (!form.name.trim()) {
      toast.error("يرجى إدخال اسم الطالب")
      return
    }
    if (!form.gradeId) {
      toast.error("يرجى اختيار الصف")
      return
    }
    if (!form.groupId) {
      toast.error("يرجى اختيار المجموعة")
      return
    }

    let updatedStudents: Student[]

    if (editingStudent) {
      // Update
      updatedStudents = students.map(s =>
        s.id === editingStudent.id
          ? {
              ...s,
              name: form.name,
              phone: form.phone || undefined,
              gradeId: form.gradeId,
              groupId: form.groupId,
              status: form.status,
              notes: form.notes || undefined,
              updatedAt: new Date().toISOString(),
            }
          : s
      )
      // البريد مفتاح حساب الدخول — يُحدَّث عبر المسار الرسمي (حساب + سجل)
      // ملاحظة حرجة: يجب أن تحمل النسخة النهائية البريد نفسه وإلا مُحي فوراً
      if ((form.email || "").trim().toLowerCase() !== (editingStudent.email || "")) {
        const emailRes = updateStudentByTeacher(editingStudent.id, { email: form.email })
        if (!emailRes.ok) {
          toast.error(emailRes.message)
          return
        }
        updatedStudents = updatedStudents.map(s =>
          s.id === editingStudent.id
            ? { ...s, email: form.email.trim().toLowerCase() || undefined }
            : s
        )
      }
      toast.success("تم تحديث بيانات الطالب بنجاح")
    } else {
      // Create
      const newStudent: Student = {
        id: Date.now().toString(),
        name: form.name,
        phone: form.phone || undefined,
        email: form.email.trim().toLowerCase() || undefined,
        gradeId: form.gradeId,
        groupId: form.groupId,
        status: form.status,
        notes: form.notes || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      updatedStudents = [...students, newStudent]
      toast.success("تم إضافة الطالب بنجاح")
    }

    setStudents(updatedStudents)
    saveStudents(updatedStudents)
    
    // Update students count in groups
    updateGroupStudentCounts(updatedStudents)
    
    setDialogOpen(false)
  }

  // Update student counts in groups
  const updateGroupStudentCounts = (studentList: Student[]) => {
    const updatedGrades = grades.map(grade => ({
      ...grade,
      groups: grade.groups.map(group => ({
        ...group,
        studentsCount: studentList.filter(s => s.groupId === group.id && s.status === 'active').length,
      })),
    }))
    setGrades(updatedGrades)
    saveGrades(updatedGrades)
  }

  // Delete student — حذف متسلسل: يمسح ماله (استحقاقات/مدفوعات) وحضوره ودرجاته
  // اليدوية وسجل نشاطه وحساب البوابة وطلباته — كما تفعل قيود قاعدة البيانات.
  // (محاولات الاختبار السابقة تبقى في النتائج باسمه لأنها سجل اختبارات لا حساب.)
  const deleteStudent = (studentId: string) => {
    const student = students.find(s => s.id === studentId)
    if (confirm(`حذف «${student?.name || "الطالب"}» نهائياً مع كل ما يخصه: الاستحقاقات والمدفوعات وسجلات الحضور والدرجات اليدوية وسجل النشاط وحساب بوابة الطالب وطلباته — لا يمكن التراجع. هل أنت متأكد؟`)) {
      const res = deleteStudentCascade(studentId)
      if (!res.ok) {
        toast.error("تعذر حذف الطالب — يبدو أنه لم يعد موجوداً")
        return
      }
      const updatedStudents = getStudents()
      setStudents(updatedStudents)
      updateGroupStudentCounts(updatedStudents)
      toast.success("تم حذف الطالب وكل ما يخصه من قاعدة البيانات نهائياً (بقيت محاولات اختباراته السابقة في النتائج باسمه)")
    }
  }

  // Toggle status
  const toggleStatus = (student: Student) => {
    const newStatus: "active" | "inactive" = student.status === 'active' ? 'inactive' : 'active'
    const updatedStudents = students.map(s =>
      s.id === student.id
        ? { ...s, status: newStatus, updatedAt: new Date().toISOString() }
        : s
    )
    setStudents(updatedStudents)
    saveStudents(updatedStudents)
    updateGroupStudentCounts(updatedStudents)
    toast.success(newStatus === 'active' ? "تم تفعيل الطالب" : "تم إلغاء تفعيل الطالب")
  }

  // إنشاء كلمة مرور مؤقتة جديدة لطالب نسيها
  const confirmPasswordReset = async () => {
    if (!resetTarget) return
    setResetBusy(true)
    try {
      const res = await resetStudentPasswordByTeacher(resetTarget.id)
      if (res.ok) {
        setResetResult({ studentName: resetTarget.name, password: res.temporaryPassword })
        setCopied(false)
        setStudents(getStudents())
        toast.success("تم إنشاء كلمة المرور المؤقتة")
        forcePushAll().catch(() => {})
      } else {
        toast.error(res.message)
        setResetTarget(null)
      }
    } finally {
      setResetBusy(false)
    }
  }

  const copyResetPassword = async () => {
    if (!resetResult) return
    try {
      await navigator.clipboard.writeText(resetResult.password)
      setCopied(true)
      toast.success("تم نسخ كلمة المرور")
    } catch {
      toast.error("انسخها يدوياً من الصندوق")
    }
  }

  // View details
  const viewDetails = (student: Student) => {
    setSelectedStudent(student)
    setDetailsDialogOpen(true)
  }

  // View statement
  const viewStatement = (student: Student) => {
    setSelectedStudent(student)
    setStatementDialogOpen(true)
  }

  // Get grade and group names
  // مجموعات الصف المختار في نموذج الإضافة/التعديل
  const formGroups = grades.find(g => g.id === form.gradeId)?.groups || []

  const getGradeName = (gradeId: string) => grades.find(g => g.id === gradeId)?.name || 'غير محدد'
  const getGroupName = (groupId: string) => {
    for (const grade of grades) {
      const group = grade.groups.find(g => g.id === groupId)
      if (group) return group.name
    }
    return 'غير محدد'
  }

  // Get student statement
  const getStudentStatement = (studentId: string) => {
    const dues = getDues().filter(d => d.studentId === studentId)
    const payments = getPayments().filter(p => p.studentId === studentId)
    
    const monthlyData: Record<string, { dues: number; payments: number }> = {}
    
    dues.forEach(due => {
      const key = `${due.year}-${due.month}`
      if (!monthlyData[key]) monthlyData[key] = { dues: 0, payments: 0 }
      monthlyData[key].dues += due.amount
    })
    
    payments.forEach(payment => {
      const key = `${payment.year}-${payment.month}`
      if (!monthlyData[key]) monthlyData[key] = { dues: 0, payments: 0 }
      monthlyData[key].payments += payment.amount
    })
    
    return Object.entries(monthlyData)
      .map(([key, data]) => {
        const [year, month] = key.split('-')
        return {
          month: parseInt(month),
          year: parseInt(year),
          monthName: MONTHS[parseInt(month) - 1],
          ...data,
          balance: data.dues - data.payments,
          status: data.dues - data.payments === 0 ? 'paid' : data.payments > 0 ? 'partial' : 'pending'
        }
      })
      .sort((a, b) => b.year - a.year || b.month - a.month)
  }

  // Stats
  const totalStudents = students.length
  const activeStudents = students.filter(s => s.status === 'active').length
  const inactiveStudents = students.filter(s => s.status === 'inactive').length
  const totalBalance = students.reduce((sum, s) => sum + getStudentBalance(s.id).balance, 0)

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
            الطلاب
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            إدارة بيانات الطلاب وربطهم بالمجموعات
          </p>
        </div>
        <Button 
          onClick={() => openDialog()}
          className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة طالب جديد</span>
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { icon: Users, label: "إجمالي الطلاب", value: totalStudents, color: "from-blue-500 to-indigo-600" },
          { icon: UserCheck, label: "الطلاب النشطين", value: activeStudents, color: "from-green-500 to-emerald-600" },
          { icon: UserX, label: "غير النشطين", value: inactiveStudents, color: "from-gray-500 to-slate-600" },
          { icon: DollarSign, label: "إجمالي الأرصدة", value: `${totalBalance} ج.م`, color: "from-yellow-500 to-orange-600" },
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

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 shadow-lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Search */}
          <div className="md:col-span-2 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="ابحث بالاسم أو رقم الهاتف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>

          {/* Filter by Grade */}
          <Select value={filterGrade} onValueChange={(val) => { setFilterGrade(val); setFilterGroup("all") }}>
            <SelectTrigger>
              <SelectValue placeholder="كل الصفوف" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الصفوف</SelectItem>
              {grades.map(grade => (
                <SelectItem key={grade.id} value={grade.id}>{grade.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filter by Group */}
          <Select
            value={filterGroup}
            onValueChange={(val) => {
              setFilterGroup(val)
              if (val !== "all") {
                const group = allGroups.find(g => g.id === val)
                if (group) setFilterGrade(group.gradeId)
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="كل المجموعات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المجموعات</SelectItem>
              {/* تُعرض مجموعات الصف المختار فقط، أو كل المجموعات عند اختيار "كل الصفوف" */}
              {allGroups
                .filter(g => filterGrade === "all" || g.gradeId === filterGrade)
                .map(group => (
                  <SelectItem key={group.id} value={group.id}>
                    {filterGrade === "all" ? `${group.gradeName} - ${group.name}` : group.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {/* Filter by Status */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger>
              <SelectValue placeholder="كل الحالات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="inactive">غير نشط</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Students Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg overflow-hidden"
      >
        {filteredStudents.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-700" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {students.length === 0 ? "لا يوجد طلاب بعد" : "لا توجد نتائج مطابقة"}
            </p>
            {students.length === 0 && (
              <Button onClick={() => openDialog()} className="bg-gradient-to-r from-green-500 to-emerald-600">
                <Plus className="w-4 h-4" />
                <span>إضافة أول طالب</span>
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>اسم الطالب</TableHead>
                <TableHead>الهاتف</TableHead>
                <TableHead>الصف</TableHead>
                <TableHead>المجموعة</TableHead>
                <TableHead>الرصيد</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.map((student) => {
                const balance = getStudentBalance(student.id)
                return (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium text-gray-900 dark:text-white">
                      {student.name}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {student.phone ? (
                        <div className="flex items-center gap-1">
                          <Phone className="w-4 h-4" />
                          {student.phone}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getGradeName(student.gradeId)}</TableCell>
                    <TableCell>{getGroupName(student.groupId)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={balance.balance > 0 ? "destructive" : "success"}
                        className={balance.balance === 0 ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : ""}
                      >
                        {balance.balance > 0 ? `مطلوب ${balance.balance} ج.م` : balance.balance < 0 ? `رصيد ${Math.abs(balance.balance)} ج.م` : "مسدد"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={student.status === 'active' ? 'success' : 'secondary'}
                        className={student.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}
                      >
                        {student.status === 'active' ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => viewStatement(student)}
                          className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950"
                          title="كشف حساب"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => viewDetails(student)}
                          className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDialog(student)}
                          className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleStatus(student)}
                          className="h-8 w-8 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-950"
                          title={student.status === 'active' ? 'إلغاء التفعيل' : 'تفعيل'}
                        >
                          {student.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const active = isStudentPortalActive(student.id)
                            const res = setStudentPortalActive(student.id, !active)
                            if (res.ok) {
                              toast.success(res.message)
                              setStudents(getStudents())
                            } else {
                              toast.error(res.message)
                            }
                          }}
                          title={isStudentPortalActive(student.id) ? "حظر الطالب من الدخول للبوابة" : "السماح له بالدخول للبوابة"}
                          className={`h-8 w-8 ${isStudentPortalActive(student.id) ? "text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950" : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"}`}
                        >
                          {isStudentPortalActive(student.id) ? <Ban className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setResetTarget(student); setResetResult(null) }}
                          title="كلمة مرور جديدة للبوابة (نسيت كلمة المروري)"
                          className="h-8 w-8 text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950"
                        >
                          <KeyRound className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteStudent(student.id)}
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </motion.div>

      {/* Add/Edit Student Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingStudent ? "تعديل بيانات الطالب" : "إضافة طالب جديد"}
            </DialogTitle>
            <DialogDescription>
              {editingStudent ? "قم بتعديل بيانات الطالب" : "أدخل بيانات الطالب الجديد"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="studentName">اسم الطالب *</Label>
              <Input
                id="studentName"
                placeholder="أدخل اسم الطالب"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="studentPhone">رقم الهاتف (اختياري)</Label>
              <Input
                id="studentPhone"
                placeholder="01xxxxxxxxx"
                value={form.phone}
                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="studentEmail">بريد دخول البوابة (اختياري)</Label>
              <Input
                id="studentEmail"
                dir="ltr"
                type="email"
                placeholder="student@example.com"
                value={form.email}
                onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                className="mt-1"
              />
              <p className="text-xs text-gray-400 mt-1">لو عدّلته بعد ما سجّل الطالب، يتحدّث حساب دخوله بنفس البريد</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الصف *</Label>
                <Select 
                  value={form.gradeId} 
                  onValueChange={(val) => setForm(prev => ({ ...prev, gradeId: val, groupId: "" }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر الصف" />
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
                <Label>المجموعة *</Label>
                <Select 
                  value={form.groupId} 
                  onValueChange={(val) => {
                    const group = allGroups.find(g => g.id === val)
                    setForm(prev => ({
                      ...prev,
                      gradeId: group ? group.gradeId : prev.gradeId,
                      groupId: val,
                    }))
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر المجموعة" />
                  </SelectTrigger>
                  <SelectContent>
                    {!form.gradeId ? (
                      <SelectItem value="__none" disabled>اختر الصف أولاً</SelectItem>
                    ) : formGroups.length === 0 ? (
                      <SelectItem value="__none" disabled>لا توجد مجموعات في هذا الصف</SelectItem>
                    ) : (
                      formGroups.map(group => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>الحالة</Label>
              <Select 
                value={form.status} 
                onValueChange={(val) => setForm(prev => ({ ...prev, status: val as "active" | "inactive" }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="inactive">غير نشط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="studentNotes">ملاحظات (اختياري)</Label>
              <Input
                id="studentNotes"
                placeholder="أي ملاحظات إضافية"
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={saveStudent}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
            >
              {editingStudent ? "حفظ التعديلات" : "إضافة الطالب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Student Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تفاصيل الطالب</DialogTitle>
          </DialogHeader>
          {selectedStudent && (
            <div className="space-y-6 py-4">
              {/* Student Info */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                    {selectedStudent.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                      {selectedStudent.name}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="bg-white dark:bg-gray-900">
                        <BookOpen className="w-3 h-3 ml-1" />
                        {getGradeName(selectedStudent.gradeId)}
                      </Badge>
                      <Badge variant="outline" className="bg-white dark:bg-gray-900">
                        {getGroupName(selectedStudent.groupId)}
                      </Badge>
                      {selectedStudent.phone && (
                        <Badge variant="outline" className="bg-white dark:bg-gray-900">
                          <Phone className="w-3 h-3 ml-1" />
                          {selectedStudent.phone}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Info */}
              {(() => {
                const balance = getStudentBalance(selectedStudent.id)
                return (
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-gray-500">إجمالي المستحقات</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {balance.totalDues} ج.م
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-gray-500">إجمالي المدفوع</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-green-600">
                          {balance.totalPayments} ج.م
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-gray-500">الرصيد المتبقي</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className={`text-2xl font-bold ${balance.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {balance.balance} ج.م
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )
              })()}

              {/* Portal Access */}
              {(() => {
                const hasAccount = isStudentPortalActive(selectedStudent.id) || getStudentAccounts().some(a => a.studentId === selectedStudent.id)
                return (
                  <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/60 dark:bg-violet-950/30 p-4">
                    <p className="font-extrabold text-violet-800 dark:text-violet-300 text-sm mb-2 flex items-center gap-2">
                      <KeyRound className="w-4 h-4" />
                      الدخول للبوابة
                    </p>
                    {hasAccount ? (
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                          <p>
                            الحساب: <span dir="ltr" className="font-mono font-bold">{selectedStudent.email || "بدون بريد"}</span>
                          </p>
                          <p className="text-xs text-gray-500">
                            لو الطالب نسى كلمته، أنشئ له كلمة مرور مؤقتة جديدة وأبلغه بها
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => { setResetTarget(selectedStudent); setResetResult(null); setDetailsDialogOpen(false) }}
                          className="bg-violet-600 hover:bg-violet-700 text-white"
                        >
                          <KeyRound className="w-4 h-4" />
                          كلمة مرور جديدة
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        لا يوجد له حساب بوابة بعد — سيُنشأ تلقائياً عند الموافقة على طلب تسجيله
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* Inquiry Channel — منع الطالب من استخدام الاستفسارات نهائياً */}
              {(() => {
                const closed = isInquiryChannelClosed(selectedStudent.id)
                return (
                  <div className={`rounded-xl border p-4 ${closed ? "border-red-300 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30" : "border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/30"}`}>
                    <p className={`font-extrabold text-sm mb-2 flex items-center gap-2 ${closed ? "text-red-800 dark:text-red-300" : "text-sky-800 dark:text-sky-300"}`}>
                      <MessageCircleQuestion className="w-4 h-4" />
                      قناة الاستفسار {closed ? "— مغلقة ⛔" : "— مفتوحة"}
                    </p>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-xs text-gray-600 dark:text-gray-400 flex-1 min-w-40">
                        {closed
                          ? "لا يستطيع الطالب إرسال أي استفسار من بوابته نهائياً حتى تعيد فتح القناة"
                          : "الطالب يستطيع إرسال استفسار وردّ عليه — أغلق القناة لمنعه تماماً"}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => {
                          const res = setStudentInquiryChannel(selectedStudent.id, !closed)
                          if (res.ok) {
                            toast.success(res.message || "تم")
                            const fresh = getStudents()
                            setStudents(fresh)
                            setSelectedStudent(fresh.find(s => s.id === selectedStudent.id) || selectedStudent)
                            forcePushAll().catch(() => {})
                          } else {
                            toast.error(res.error || "تعذر التنفيذ")
                          }
                        }}
                        className={closed
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : "bg-red-600 hover:bg-red-700 text-white"}
                      >
                        {closed ? "إعادة فتح القناة" : "منع الاستفسارات (إغلاق القناة)"}
                      </Button>
                    </div>
                  </div>
                )
              })()}

              {/* Notes */}
              {selectedStudent.notes && (
                <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-xl p-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <strong>ملاحظات:</strong> {selectedStudent.notes}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
              إغلاق
            </Button>
            <Button 
              onClick={() => {
                setDetailsDialogOpen(false)
                if (selectedStudent) openDialog(selectedStudent)
              }}
              className="bg-gradient-to-r from-blue-500 to-indigo-600"
            >
              <Edit2 className="w-4 h-4" />
              <span>تعديل البيانات</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Student Statement Dialog */}
      <Dialog open={statementDialogOpen} onOpenChange={setStatementDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              كشف حساب - {selectedStudent?.name}
            </DialogTitle>
          </DialogHeader>
          <div id="student-statement-content" className="py-4">
            {selectedStudent && (() => {
              const statement = getStudentStatement(selectedStudent.id)
              const balance = getStudentBalance(selectedStudent.id)
              
              return (
                <div className="space-y-4">
                  {/* Student Info Header */}
                  <div className="text-center border-b pb-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">كشف حساب طالب</h2>
                    <p className="text-lg text-gray-700 dark:text-gray-300 mt-1">{selectedStudent.name}</p>
                    <p className="text-sm text-gray-500">
                      {getGradeName(selectedStudent.gradeId)} - {getGroupName(selectedStudent.groupId)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      التاريخ: {new Date().toLocaleDateString('ar-EG')}
                    </p>
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-500">المستحقات</p>
                      <p className="text-lg font-bold text-yellow-700 dark:text-yellow-300">{balance.totalDues} ج.م</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-500">المدفوع</p>
                      <p className="text-lg font-bold text-green-700 dark:text-green-300">{balance.totalPayments} ج.م</p>
                    </div>
                    <div className={`rounded-lg p-3 text-center ${balance.balance > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-green-50 dark:bg-green-950/30'}`}>
                      <p className="text-xs text-gray-500">المتبقي</p>
                      <p className={`text-lg font-bold ${balance.balance > 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
                        {balance.balance} ج.م
                      </p>
                    </div>
                  </div>

                  {/* Monthly breakdown */}
                  {statement.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">لا توجد بيانات مالية</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>الشهر</TableHead>
                          <TableHead>المستحق</TableHead>
                          <TableHead>المدفوع</TableHead>
                          <TableHead>المتبقي</TableHead>
                          <TableHead>الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {statement.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              {item.monthName} {item.year}
                            </TableCell>
                            <TableCell>{item.dues} ج.م</TableCell>
                            <TableCell className="text-green-600">{item.payments} ج.م</TableCell>
                            <TableCell className={item.balance > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>
                              {item.balance} ج.م
                            </TableCell>
                            <TableCell>
                              {item.status === 'paid' ? (
                                <Badge variant="success" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                                  <CheckCircle className="w-3 h-3 ml-1" /> مدفوع
                                </Badge>
                              ) : item.status === 'partial' ? (
                                <Badge variant="warning">جزئي</Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <AlertCircle className="w-3 h-3 ml-1" /> مستحق
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatementDialogOpen(false)}>
              إغلاق
            </Button>
            <Button 
              onClick={async () => {
                try {
                  await exportToPDF(
                    'student-statement-content', 
                    `كشف-حساب-${selectedStudent?.name}-${new Date().toLocaleDateString('ar-EG')}`,
                    { orientation: 'portrait', scale: 2 }
                  )
                  toast.success('تم تحميل كشف الحساب بنجاح')
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

      {/* Reset Portal Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={open => { if (!open) { setResetTarget(null); setResetResult(null) } }}>
        <DialogContent className="max-w-md">
          {!resetResult ? (
            <>
              <DialogHeader>
                <DialogTitle>كلمة مرور جديدة للبوابة</DialogTitle>
                <DialogDescription>
                  الطالب: <span className="font-bold text-gray-900 dark:text-white">{resetTarget?.name}</span>
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                سيتم إنشاء <strong>كلمة مرور مؤقتة جديدة</strong> وكلمته الحالية تتوقف عن العمل فوراً.
                انسخها وأبلغه بها — ويُستحسن أن يغيّرها من صفحته بعد الدخول.
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setResetTarget(null); setResetResult(null) }}>
                  تراجع
                </Button>
                <Button
                  onClick={confirmPasswordReset}
                  disabled={resetBusy}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {resetBusy ? <KeyRound className="w-4 h-4 animate-pulse" /> : <KeyRound className="w-4 h-4" />}
                  <span>{resetBusy ? "جاري الإنشاء..." : "إنشاء كلمة المرور"}</span>
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>تم إنشاء كلمة المرور المؤقتة ✅</DialogTitle>
                <DialogDescription>
                  أبلغ الطالب «{resetResult.studentName}» بدخولها في صفحة دخول الطلاب
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-xl border-2 border-dashed border-violet-400 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 p-5 text-center">
                <p className="text-xs text-gray-500 mb-1">كلمة المرور المؤقتة</p>
                <p dir="ltr" className="text-3xl font-mono font-extrabold tracking-widest text-violet-700 dark:text-violet-300 select-all">
                  {resetResult.password}
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={copyResetPassword}>
                  {copied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? "تم النسخ" : "نسخ"}</span>
                </Button>
                <Button onClick={() => { setResetTarget(null); setResetResult(null) }} className="bg-violet-600 hover:bg-violet-700 text-white">
                  تم
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
