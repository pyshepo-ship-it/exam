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
  AlertCircle
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
  getGrades,
  getStudents,
  saveStudents,
  saveGrades,
  getStudentBalance,
  getDues,
  getPayments,
  initializeSampleData,
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
  
  const [form, setForm] = useState({
    name: "",
    phone: "",
    gradeId: "",
    groupId: "",
    status: "active" as "active" | "inactive",
    notes: "",
  })

  // Load data
  useEffect(() => {
    initializeSampleData()
    setStudents(getStudents())
    setGrades(getGrades())
  }, [])

  // Get available groups for selected grade
  const availableGroups = grades.find(g => g.id === form.gradeId)?.groups || []
  const filterAvailableGroups = grades.find(g => g.id === filterGrade)?.groups || []

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
      toast.success("تم تحديث بيانات الطالب بنجاح")
    } else {
      // Create
      const newStudent: Student = {
        id: Date.now().toString(),
        name: form.name,
        phone: form.phone || undefined,
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

  // Delete student
  const deleteStudent = (studentId: string) => {
    if (confirm("هل أنت متأكد من حذف هذا الطالب؟")) {
      const updatedStudents = students.filter(s => s.id !== studentId)
      setStudents(updatedStudents)
      saveStudents(updatedStudents)
      updateGroupStudentCounts(updatedStudents)
      toast.success("تم حذف الطالب بنجاح")
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
          <Select value={filterGroup} onValueChange={setFilterGroup} disabled={filterGrade === "all"}>
            <SelectTrigger>
              <SelectValue placeholder="كل المجموعات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المجموعات</SelectItem>
              {filterAvailableGroups.map(group => (
                <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
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
                    {grades.map(grade => (
                      <SelectItem key={grade.id} value={grade.id}>{grade.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>المجموعة *</Label>
                <Select 
                  value={form.groupId} 
                  onValueChange={(val) => setForm(prev => ({ ...prev, groupId: val }))}
                  disabled={!form.gradeId}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر المجموعة" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGroups.map(group => (
                      <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                    ))}
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
    </div>
  )
}
