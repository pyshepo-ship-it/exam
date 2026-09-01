"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  DollarSign, 
  Plus, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle,
  CheckCircle,
  Calendar,
  FileText,
  Eye,
  Download
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Grade,
  Student,
  Due,
  Payment,
  getGrades,
  getStudents,
  getDues,
  getPayments,
  saveDues,
  savePayments,
  getStudentBalance,
} from "@/lib/data-storage"

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
]

export default function PaymentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [dues, setDues] = useState<Due[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'dues'>('overview')
  
  // Payment Dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    studentId: "",
    amount: 0,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    notes: "",
  })

  // Monthly Due Dialog
  const [dueDialogOpen, setDueDialogOpen] = useState(false)
  const [dueForm, setDueForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    selectedGroups: [] as string[],
  })

  // Statement Dialog
  const [statementDialogOpen, setStatementDialogOpen] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState<string>("")

  // Load data
  useEffect(() => {
    setStudents(getStudents())
    setGrades(getGrades())
    setDues(getDues())
    setPayments(getPayments())
  }, [])

  // Get all groups
  const allGroups = grades.flatMap(g => g.groups.map(gr => ({ ...gr, gradeName: g.name })))

  // Filter students
  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Save payment
  const savePayment = () => {
    if (!paymentForm.studentId) {
      alert("يرجى اختيار الطالب")
      return
    }
    if (paymentForm.amount <= 0) {
      alert("يرجى إدخال مبلغ صحيح")
      return
    }

    const newPayment: Payment = {
      id: Date.now().toString(),
      studentId: paymentForm.studentId,
      amount: paymentForm.amount,
      paymentDate: new Date().toISOString().split('T')[0],
      month: paymentForm.month,
      year: paymentForm.year,
      notes: paymentForm.notes || undefined,
      createdAt: new Date().toISOString(),
    }

    const updatedPayments = [...payments, newPayment]
    setPayments(updatedPayments)
    savePayments(updatedPayments)
    setPaymentDialogOpen(false)
    setPaymentForm({
      studentId: "",
      amount: 0,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      notes: "",
    })
  }

  // Create monthly dues
  const createMonthlyDues = () => {
    if (dueForm.selectedGroups.length === 0) {
      alert("يرجى اختيار مجموعة واحدة على الأقل")
      return
    }

    const newDues: Due[] = []

    dueForm.selectedGroups.forEach(groupId => {
      const group = allGroups.find(g => g.id === groupId)
      if (!group) return

      const groupStudents = students.filter(s => s.groupId === groupId && s.status === 'active')
      
      groupStudents.forEach(student => {
        // Check if due already exists
        const existingDue = dues.find(
          d => d.studentId === student.id && d.month === dueForm.month && d.year === dueForm.year
        )

        if (!existingDue) {
          newDues.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            studentId: student.id,
            groupId: groupId,
            month: dueForm.month,
            year: dueForm.year,
            amount: group.monthlyFee,
            status: 'pending',
            createdAt: new Date().toISOString(),
          })
        }
      })
    })

    if (newDues.length === 0) {
      alert("لا توجد استحقاقات جديدة لإنشائها (قد تكون موجودة مسبقاً)")
      return
    }

    const updatedDues = [...dues, ...newDues]
    setDues(updatedDues)
    saveDues(updatedDues)
    setDueDialogOpen(false)
    setDueForm({
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      selectedGroups: [],
    })

    alert(`تم إنشاء ${newDues.length} استحقاق جديد بنجاح`)
  }

  // Toggle group selection
  const toggleGroupSelection = (groupId: string) => {
    setDueForm(prev => ({
      ...prev,
      selectedGroups: prev.selectedGroups.includes(groupId)
        ? prev.selectedGroups.filter(id => id !== groupId)
        : [...prev.selectedGroups, groupId]
    }))
  }

  // View student statement
  const viewStatement = (studentId: string) => {
    setSelectedStudentId(studentId)
    setStatementDialogOpen(true)
  }

  // Get student name
  const getStudentName = (studentId: string) => students.find(s => s.id === studentId)?.name || 'غير معروف'

  // Stats
  const totalDues = dues.reduce((sum, d) => sum + d.amount, 0)
  const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0)
  const totalBalance = totalDues - totalPayments
  const collectionRate = totalDues > 0 ? ((totalPayments / totalDues) * 100).toFixed(1) : "0"

  // Get student statement data
  const getStudentStatement = (studentId: string) => {
    const studentDues = dues.filter(d => d.studentId === studentId)
    const studentPayments = payments.filter(p => p.studentId === studentId)
    
    const monthlyData: Record<string, { dues: number; payments: number }> = {}
    
    studentDues.forEach(due => {
      const key = `${due.year}-${due.month}`
      if (!monthlyData[key]) monthlyData[key] = { dues: 0, payments: 0 }
      monthlyData[key].dues += due.amount
    })
    
    studentPayments.forEach(payment => {
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
            التحصيل الشهري
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            إدارة التحصيل المالي والاستحقاقات الشهرية
          </p>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={() => setDueDialogOpen(true)}
            variant="outline" 
            className="border-yellow-500 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950"
          >
            <Calendar className="w-5 h-5" />
            <span>استحقاق شهري</span>
          </Button>
          <Button 
            onClick={() => setPaymentDialogOpen(true)}
            className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg"
          >
            <Plus className="w-5 h-5" />
            <span>تسجيل تحصيل</span>
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp, label: "إجمالي المستحقات", value: `${totalDues} ج.م`, color: "from-yellow-500 to-orange-600" },
          { icon: TrendingDown, label: "إجمالي المحصل", value: `${totalPayments} ج.م`, color: "from-green-500 to-emerald-600" },
          { icon: AlertCircle, label: "المتبقي", value: `${totalBalance} ج.م`, color: totalBalance > 0 ? "from-red-500 to-rose-600" : "from-green-500 to-emerald-600" },
          { icon: TrendingUp, label: "نسبة التحصيل", value: `${collectionRate}%`, color: "from-blue-500 to-indigo-600" },
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

      {/* Students with Balances */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg overflow-hidden"
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-white">
              حالة الطلاب المالية
            </h3>
            <div className="relative w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="ابحث عن طالب..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-9 h-9"
              />
            </div>
          </div>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-700" />
            <p className="text-gray-500 dark:text-gray-400">
              {students.length === 0 ? "لا يوجد طلاب بعد. أضف طلاب أولاً" : "لا توجد نتائج"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>اسم الطالب</TableHead>
                <TableHead>الصف/المجموعة</TableHead>
                <TableHead>المستحقات</TableHead>
                <TableHead>المدفوع</TableHead>
                <TableHead>المتبقي</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.map((student) => {
                const balance = getStudentBalance(student.id)
                const grade = grades.find(g => g.id === student.gradeId)
                const group = grade?.groups.find(gr => gr.id === student.groupId)
                
                return (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium text-gray-900 dark:text-white">
                      {student.name}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {grade?.name} - {group?.name}
                    </TableCell>
                    <TableCell className="text-gray-900 dark:text-white">
                      {balance.totalDues} ج.م
                    </TableCell>
                    <TableCell className="text-green-600 font-semibold">
                      {balance.totalPayments} ج.م
                    </TableCell>
                    <TableCell>
                      <span className={`font-bold ${balance.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {balance.balance} ج.م
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={balance.balance === 0 ? 'success' : balance.balance > 0 ? 'destructive' : 'secondary'}
                        className={
                          balance.balance === 0 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            : balance.balance > 0 
                            ? ''
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        }
                      >
                        {balance.balance === 0 ? (
                          <><CheckCircle className="w-3 h-3 ml-1" /> مسدد</>
                        ) : balance.balance > 0 ? (
                          <><AlertCircle className="w-3 h-3 ml-1" /> مستحق</>
                        ) : (
                          <>رصيد دائن</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setPaymentForm(prev => ({ ...prev, studentId: student.id }))
                            setPaymentDialogOpen(true)
                          }}
                          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                          title="تسجيل دفعة"
                        >
                          <DollarSign className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => viewStatement(student.id)}
                          className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                          title="كشف حساب"
                        >
                          <FileText className="w-4 h-4" />
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

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تسجيل تحصيل جديد</DialogTitle>
            <DialogDescription>
              سجل دفعة من الطالب
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>الطالب *</Label>
              <Select 
                value={paymentForm.studentId} 
                onValueChange={(val) => setPaymentForm(prev => ({ ...prev, studentId: val }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الطالب" />
                </SelectTrigger>
                <SelectContent>
                  {students.filter(s => s.status === 'active').map(student => {
                    const grade = grades.find(g => g.id === student.gradeId)
                    const group = grade?.groups.find(gr => gr.id === student.groupId)
                    return (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name} ({grade?.name} - {group?.name})
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="paymentAmount">المبلغ (ج.م) *</Label>
              <Input
                id="paymentAmount"
                type="number"
                placeholder="150"
                value={paymentForm.amount || ""}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                className="mt-1"
              />
              {paymentForm.studentId && (
                <p className="text-xs text-gray-500 mt-1">
                  الرصيد الحالي: {getStudentBalance(paymentForm.studentId).balance} ج.م
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الشهر</Label>
                <Select 
                  value={paymentForm.month.toString()} 
                  onValueChange={(val) => setPaymentForm(prev => ({ ...prev, month: parseInt(val) }))}
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
                <Label htmlFor="paymentYear">السنة</Label>
                <Input
                  id="paymentYear"
                  type="number"
                  value={paymentForm.year}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, year: parseInt(e.target.value) || new Date().getFullYear() }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="paymentNotes">ملاحظات (اختياري)</Label>
              <Input
                id="paymentNotes"
                placeholder="أي ملاحظات"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={savePayment}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
            >
              تسجيل الدفعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Monthly Due Dialog */}
      <Dialog open={dueDialogOpen} onOpenChange={setDueDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>إنشاء استحقاق شهري</DialogTitle>
            <DialogDescription>
              أنشئ استحقاقات شهرية لجميع الطلاب في المجموعات المحددة
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الشهر</Label>
                <Select 
                  value={dueForm.month.toString()} 
                  onValueChange={(val) => setDueForm(prev => ({ ...prev, month: parseInt(val) }))}
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
                <Label>السنة</Label>
                <Input
                  type="number"
                  value={dueForm.year}
                  onChange={(e) => setDueForm(prev => ({ ...prev, year: parseInt(e.target.value) || new Date().getFullYear() }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>اختر المجموعات *</Label>
              <div className="space-y-2 mt-2 max-h-60 overflow-y-auto">
                {allGroups.map((group) => {
                  const studentsCount = students.filter(s => s.groupId === group.id && s.status === 'active').length
                  return (
                    <div
                      key={group.id}
                      className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id={`group-${group.id}`}
                          checked={dueForm.selectedGroups.includes(group.id)}
                          onCheckedChange={() => toggleGroupSelection(group.id)}
                        />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {group.gradeName} - {group.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {studentsCount} طالب • {group.monthlyFee} ج.م/شهر
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {allGroups.length === 0 && (
                  <p className="text-center text-gray-500 py-4">
                    لا توجد مجموعات. أضف صفوف ومجموعات أولاً
                  </p>
                )}
              </div>
            </div>

            {dueForm.selectedGroups.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  سيتم إنشاء استحقاقات لـ {
                    dueForm.selectedGroups.reduce((sum, groupId) => 
                      sum + students.filter(s => s.groupId === groupId && s.status === 'active').length, 0
                    )
                  } طالب في {dueForm.selectedGroups.length} مجموعة
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDueDialogOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={createMonthlyDues}
              className="bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700"
            >
              إنشاء الاستحقاقات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Student Statement Dialog */}
      <Dialog open={statementDialogOpen} onOpenChange={setStatementDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              كشف حساب - {getStudentName(selectedStudentId)}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {(() => {
              const statement = getStudentStatement(selectedStudentId)
              const balance = getStudentBalance(selectedStudentId)
              
              return (
                <div className="space-y-4">
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
                    <p className="text-center text-gray-500 py-8">لا توجد بيانات</p>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
