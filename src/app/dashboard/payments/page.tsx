"use client"

import React, { useState, useEffect, useMemo } from "react"
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
  Download,
  Printer
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
import toast from "react-hot-toast"
import { exportTableToPDF, exportToPDF } from "@/lib/pdf-utils"
import {
  Grade,
  Student,
  Due,
  DueCycle,
  Payment,
  getGrades,
  getStudents,
  getDues,
  getPayments,
  saveDues,
  savePayments,
  getStudentBalance,
} from "@/lib/data-storage"
import {
  DUE_CYCLE_LABELS,
  DUE_CYCLE_ORDER,
  amountForCycle,
  dueCycle as dueCycleOf,
  duePeriodKey,
  duePeriodLabel,
  groupMonthlyFee,
  groupSessionFee,
  groupWeeklyFee,
  monthlyPeriod,
  weeklyPeriod,
  sessionPeriod,
  customPeriod,
  toDateKey,
  money as moneyLabel,
  type PeriodInfo,
} from "@/lib/billing"

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
    /** الاستحقاق المسدَّد (شهري/أسبوعي/بالحصّة) — اختياري */
    dueId: "",
    amount: 0,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    notes: "",
  })
  // اختيار الطالب على 3 خطوات: الصف → المجموعة → الاسم
  const [payGradeId, setPayGradeId] = useState("")
  const [payGroupId, setPayGroupId] = useState("")

  // فتح نافذة التحصيل (مع أو بدون تحديد طالب مسبقاً)
  const openPaymentDialog = (studentId?: string) => {
    if (studentId) {
      const student = students.find(s => s.id === studentId)
      setPaymentForm(prev => ({
        ...prev,
        studentId,
        dueId: "",
        amount: 0,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        notes: "",
      }))
      if (student) {
        setPayGradeId(student.gradeId)
        setPayGroupId(student.groupId)
      }
    } else {
      setPaymentForm(prev => ({
        ...prev,
        studentId: "",
        dueId: "",
        amount: 0,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        notes: "",
      }))
      setPayGradeId("")
      setPayGroupId("")
    }
    setPaymentDialogOpen(true)
  }

  // الصفوف المتاحة للتحصيل
  const paymentGrades = grades
  const paymentGroups = grades.find(g => g.id === payGradeId)?.groups || []
  const paymentStudents = students.filter(
    s => s.groupId === payGroupId && s.status === "active"
  )

  // ================= نافذة إنشاء الاستحقاقات (شهري / أسبوعي / بالحصّة / مخصص) =================
  const [dueDialogOpen, setDueDialogOpen] = useState(false)
  const today = new Date()
  const emptyDueForm = () => ({
    /** دورة الاستحقاق */
    cycle: "monthly" as DueCycle,
    month: today.getMonth() + 1,
    year: today.getFullYear(),
    /** تاريخ داخل الأسبوع المطلوب (يُحسب منه السبت → الجمعة) */
    weekStart: toDateKey(today),
    /** تاريخ الحصة/الحصص */
    sessionDate: toDateKey(today),
    sessionsCount: 1,
    /** وصف ومبلغ الاستحقاق المخصص */
    customLabel: "",
    customAmount: 0,
    /** false = المعلم يكتب مبلغاً محدداً بدل سعر المجموعة */
    useGroupPrice: true,
    manualAmount: 0,
    /** "groups" = كل طلاب المجموعات المختارة، "student" = طالب واحد */
    scope: "groups" as "groups" | "student",
    scopeStudentId: "",
    selectedGroups: [] as string[],
  })
  const [dueForm, setDueForm] = useState(emptyDueForm)

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
      toast.error("يرجى اختيار الطالب")
      return
    }
    if (paymentForm.amount <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح")
      return
    }

    const newPayment: Payment = {
      id: Date.now().toString(),
      studentId: paymentForm.studentId,
      // ربط الدفعة بالاستحقاق (أسبوعي/شهري/بالحصّة) ليظهر التسديد في فترته
      dueId: paymentForm.dueId || undefined,
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

    // تحديث حالة الاستحقاق المرتبط (مدفوع / جزئي) حسب ما حُصّل منه
    if (paymentForm.dueId) {
      const paidForDue = updatedPayments
        .filter(pay => pay.dueId === paymentForm.dueId)
        .reduce((sum, pay) => sum + pay.amount, 0)
      const updatedDues = dues.map(d => {
        if (d.id !== paymentForm.dueId) return d
        const status = paidForDue + 1e-9 >= d.amount ? "paid" : paidForDue > 0 ? "partial" : "pending"
        return { ...d, status: status as Due["status"] }
      })
      setDues(updatedDues)
      saveDues(updatedDues)
    }

    setPaymentDialogOpen(false)
    setPaymentForm({
      studentId: "",
      dueId: "",
      amount: 0,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      notes: "",
    })
    toast.success(
      paymentForm.dueId
        ? "تم تسجيل الدفعة وربطها بالاستحقاق بنجاح"
        : "تم تسجيل الدفعة بنجاح"
    )
  }

  /** تحويل YYYY-MM-DD إلى تاريخ محلي (بداية اليوم) */
  const toDate = (iso: string): Date => {
    const d = new Date(`${iso}T00:00:00`)
    return isNaN(d.getTime()) ? new Date() : d
  }

  /**
   * الفترة التي سيُنشأ لها الاستحقاق:
   * شهري (شهر/سنة) أو أسبوعي (السبت → الجمعة) أو بالحصّة (يوم + عدد الحصص) أو مبلغ مخصص.
   */
  const duePeriodInfo: PeriodInfo = useMemo(() => {
    switch (dueForm.cycle) {
      case "weekly":
        return weeklyPeriod(toDate(dueForm.weekStart))
      case "session":
        return sessionPeriod(toDate(dueForm.sessionDate), dueForm.sessionsCount)
      case "custom":
        return customPeriod(dueForm.customLabel, toDate(dueForm.sessionDate))
      default:
        return monthlyPeriod(dueForm.month, dueForm.year)
    }
  }, [
    dueForm.cycle,
    dueForm.weekStart,
    dueForm.sessionDate,
    dueForm.sessionsCount,
    dueForm.customLabel,
    dueForm.month,
    dueForm.year,
  ])

  /** الطلاب المستهدفون: كل طلاب المجموعات المختارة، أو طالب واحد */
  const dueTargets = useMemo(() => {
    if (dueForm.scope === "student") {
      const student = students.find(s => s.id === dueForm.scopeStudentId)
      if (!student) return []
      const group = allGroups.find(g => g.id === student.groupId)
      return [{ student, group }]
    }
    return dueForm.selectedGroups.flatMap(groupId => {
      const group = allGroups.find(g => g.id === groupId)
      if (!group) return []
      return students
        .filter(s => s.groupId === groupId && s.status === "active")
        .map(student => ({ student, group }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueForm.scope, dueForm.scopeStudentId, dueForm.selectedGroups, students, grades])

  /** مبلغ الاستحقاق لمجموعة في الدورة المختارة */
  const amountForGroup = (group?: (typeof allGroups)[number]) => {
    if (!group) {
      return {
        amount: dueForm.cycle === "custom" ? dueForm.customAmount : dueForm.manualAmount,
        unitPrice: dueForm.cycle === "custom" ? dueForm.customAmount : dueForm.manualAmount,
        sessionsCount: dueForm.cycle === "session" ? Math.max(1, dueForm.sessionsCount) : undefined,
      }
    }
    if (dueForm.cycle === "custom") {
      return amountForCycle(group, "custom", { customAmount: dueForm.customAmount })
    }
    if (!dueForm.useGroupPrice) {
      return {
        amount: dueForm.manualAmount,
        unitPrice: dueForm.manualAmount,
        sessionsCount: dueForm.cycle === "session" ? Math.max(1, dueForm.sessionsCount) : undefined,
      }
    }
    return amountForCycle(group, dueForm.cycle, { sessionsCount: dueForm.sessionsCount })
  }

  /** المبلغ الذي سيظهر لكل مجموعة في القائمة حسب الدورة المختارة */
  const groupCyclePrice = (group: (typeof allGroups)[number]): string => {
    if (dueForm.cycle === "custom") return moneyLabel(dueForm.customAmount)
    if (!dueForm.useGroupPrice) return moneyLabel(dueForm.manualAmount)
    if (dueForm.cycle === "weekly") return `${moneyLabel(groupWeeklyFee(group))}/أسبوع`
    if (dueForm.cycle === "session")
      return `${moneyLabel(groupSessionFee(group))}/حصة × ${Math.max(1, dueForm.sessionsCount)}`
    return `${moneyLabel(groupMonthlyFee(group))}/شهر`
  }

  /** إجمالي ما سيُنشأ الآن (للمعاينة قبل الحفظ) */
  const duePreviewTotal = dueTargets.reduce((sum, t) => sum + (amountForGroup(t.group).amount || 0), 0)

  // إنشاء الاستحقاقات (شهري / أسبوعي / بالحصّة / مبلغ مخصص)
  const createDues = () => {
    if (dueForm.scope === "groups" && dueForm.selectedGroups.length === 0) {
      toast.error("يرجى اختيار مجموعة واحدة على الأقل")
      return
    }
    if (dueForm.scope === "student" && !dueForm.scopeStudentId) {
      toast.error("يرجى اختيار الطالب")
      return
    }
    if (dueTargets.length === 0) {
      toast.error("لا يوجد طلاب نشطون في الاختيار الحالي")
      return
    }

    const period = duePeriodInfo
    const now = new Date().toISOString()
    const newDues: Due[] = []
    let duplicated = 0
    let noPrice = 0

    dueTargets.forEach(({ student, group }) => {
      const priced = amountForGroup(group)
      const amount = Math.round((priced.amount || 0) * 100) / 100
      if (!(amount > 0)) {
        noPrice += 1
        return
      }
      const groupId = group?.id || student.groupId || ""
      // منع التكرار: نفس الطالب + نفس الفترة (المفتاح الفريد للفترة)
      const exists =
        dueForm.cycle !== "custom" &&
        dues.some(
          d =>
            d.studentId === student.id &&
            (d.groupId || "") === groupId &&
            duePeriodKey({ ...d, cycle: dueCycleOf(d) }) === period.key
        )
      if (exists) {
        duplicated += 1
        return
      }
      newDues.push({
        id: `${Date.now()}-${student.id}-${period.key}-${Math.random().toString(36).slice(2, 8)}`,
        studentId: student.id,
        groupId,
        month: period.month,
        year: period.year,
        amount,
        status: "pending",
        createdAt: now,
        cycle: dueForm.cycle,
        periodKey: period.key,
        periodLabel: period.label,
        dueDate: toDateKey(dueForm.cycle === "session" ? period.start : period.end),
        sessionsCount: priced.sessionsCount,
        unitPrice: priced.unitPrice || undefined,
        notes:
          dueForm.cycle === "custom" && dueForm.customLabel.trim()
            ? dueForm.customLabel.trim()
            : undefined,
      })
    })

    if (newDues.length === 0) {
      toast.error(
        noPrice > 0 && duplicated === 0
          ? "لا يوجد مبلغ محدد لهذه الاستحقاقات — اكتب السعر أو حدّد مبلغاً يدوياً"
          : "لا توجد استحقاقات جديدة لإنشائها (موجودة مسبقاً لنفس الفترة)"
      )
      return
    }

    const updatedDues = [...dues, ...newDues]
    setDues(updatedDues)
    saveDues(updatedDues)
    setDueDialogOpen(false)
    setDueForm(emptyDueForm())

    const skipped =
      duplicated > 0 ? ` — وتم تخطي ${duplicated} موجودة مسبقاً لنفس الفترة` : ""
    const missing = noPrice > 0 ? ` — و${noPrice} بلا سعر محدد` : ""
    toast.success(
      `تم إنشاء ${newDues.length} استحقاق (${DUE_CYCLE_LABELS[dueForm.cycle]}: ${period.label}) بإجمالي ${moneyLabel(
        newDues.reduce((sum, d) => sum + d.amount, 0)
      )}${skipped}${missing}`,
      { duration: 7000 }
    )
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
  /**
   * كشف حساب الطالب: صف لكل **فترة استحقاق** (شهر / أسبوع / حصص / مبلغ مخصص).
   * الدفعات المرتبطة باستحقاق تُحسب على فترتها، وغير المرتبطة تُجمع في شهرها.
   */
  const getStudentStatement = (studentId: string) => {
    const studentDues = dues.filter(d => d.studentId === studentId)
    const studentPayments = payments.filter(p => p.studentId === studentId)

    interface StatementRow {
      key: string
      label: string
      cycle: DueCycle
      month: number
      year: number
      sortKey: string
      dues: number
      payments: number
    }
    const rows = new Map<string, StatementRow>()
    const ensure = (
      key: string,
      label: string,
      cycle: DueCycle,
      month: number,
      year: number,
      sortKey: string
    ): StatementRow => {
      const existing = rows.get(key)
      if (existing) return existing
      const row: StatementRow = { key, label, cycle, month, year, sortKey, dues: 0, payments: 0 }
      rows.set(key, row)
      return row
    }

    const dueKey = (due: Due) =>
      dueCycleOf(due) === "monthly" ? `m-${due.year}-${due.month}` : `p-${duePeriodKey(due)}`

    studentDues.forEach(due => {
      const cycle = dueCycleOf(due)
      const label = cycle === "monthly" ? `${MONTHS[due.month - 1]} ${due.year}` : duePeriodLabel(due)
      const sortKey = due.dueDate || `${due.year}-${String(due.month).padStart(2, "0")}`
      ensure(dueKey(due), label, cycle, due.month, due.year, sortKey).dues += due.amount
    })

    studentPayments.forEach(payment => {
      const linked = payment.dueId ? studentDues.find(d => d.id === payment.dueId) : undefined
      if (linked) {
        const cycle = dueCycleOf(linked)
        const label = cycle === "monthly" ? `${MONTHS[linked.month - 1]} ${linked.year}` : duePeriodLabel(linked)
        const sortKey = linked.dueDate || `${linked.year}-${String(linked.month).padStart(2, "0")}`
        ensure(dueKey(linked), label, cycle, linked.month, linked.year, sortKey).payments += payment.amount
        return
      }
      const key = `m-${payment.year}-${payment.month}`
      const sortKey = payment.paymentDate || `${payment.year}-${String(payment.month).padStart(2, "0")}`
      ensure(key, `${MONTHS[payment.month - 1]} ${payment.year}`, "monthly", payment.month, payment.year, sortKey)
        .payments += payment.amount
    })

    return [...rows.values()]
      .map(row => ({
        ...row,
        monthName: MONTHS[row.month - 1],
        balance: Math.round((row.dues - row.payments) * 100) / 100,
        status:
          row.dues <= 0
            ? row.payments > 0
              ? "paid"
              : "pending"
            : row.dues - row.payments <= 0
            ? "paid"
            : row.payments > 0
            ? "partial"
            : "pending",
      }))
      .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
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
            التحصيل والاستحقاقات
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            إدارة التحصيل المالي — استحقاقات شهرية أو أسبوعية أو بالحصّة حسب تسعير كل مجموعة
          </p>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={() => setDueDialogOpen(true)}
            variant="outline" 
            className="border-yellow-500 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950"
          >
            <Calendar className="w-5 h-5" />
            <span>إنشاء استحقاق</span>
          </Button>
          <Button 
            onClick={() => openPaymentDialog()}
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
                          onClick={() => openPaymentDialog(student.id)}
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
            {/* اختيار الطالب على 3 خطوات: الصف → المجموعة → الاسم */}
            <div className="space-y-3">
              <div>
                <Label>1. اختر الصف</Label>
                <Select
                  value={payGradeId}
                  onValueChange={(val) => {
                    setPayGradeId(val)
                    setPayGroupId("")
                    setPaymentForm(prev => ({ ...prev, studentId: "" }))
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر الصف" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentGrades.length === 0 ? (
                      <SelectItem value="__none" disabled>لا توجد صفوف</SelectItem>
                    ) : (
                      paymentGrades.map(grade => (
                        <SelectItem key={grade.id} value={grade.id}>{grade.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>2. اختر المجموعة</Label>
                <Select
                  value={payGroupId}
                  onValueChange={(val) => {
                    setPayGroupId(val)
                    setPaymentForm(prev => ({ ...prev, studentId: "" }))
                  }}
                  disabled={!payGradeId}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر المجموعة" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentGroups.length === 0 ? (
                      <SelectItem value="__none" disabled>لا توجد مجموعات في هذا الصف</SelectItem>
                    ) : (
                      paymentGroups.map(group => (
                        <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>3. اختر الطالب</Label>
                <Select
                  value={paymentForm.studentId}
                  onValueChange={(val) => setPaymentForm(prev => ({ ...prev, studentId: val }))}
                  disabled={!payGroupId}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={payGroupId ? "اختر الطالب" : "اختر الصف والمجموعة أولاً"} />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentStudents.length === 0 ? (
                      <SelectItem value="no-students" disabled>لا يوجد طلاب نشطون في هذه المجموعة</SelectItem>
                    ) : (
                      paymentStudents.map(student => (
                        <SelectItem key={student.id} value={student.id}>{student.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ---------- ربط الدفعة باستحقاق محدّد (شهري/أسبوعي/بالحصّة) ---------- */}
            {paymentForm.studentId && (
              <div>
                <Label>تسديد استحقاق محدّد (اختياري)</Label>
                <Select
                  value={paymentForm.dueId || "__none"}
                  onValueChange={(val) => {
                    const dueId = val === "__none" ? "" : val
                    const due = dues.find(d => d.id === dueId)
                    if (!due) {
                      setPaymentForm(prev => ({ ...prev, dueId: "" }))
                      return
                    }
                    const paid = payments
                      .filter(p => p.dueId === due.id)
                      .reduce((sum, p) => sum + p.amount, 0)
                    setPaymentForm(prev => ({
                      ...prev,
                      dueId: due.id,
                      amount: Math.max(0, Math.round((due.amount - paid) * 100) / 100),
                      month: due.month,
                      year: due.year,
                      notes: prev.notes || (due.periodLabel ? `تحصيل ${due.periodLabel}` : ""),
                    }))
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="دفعة حرة غير مرتبطة باستحقاق" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">دفعة حرة (بدون ربط)</SelectItem>
                    {dues
                      .filter(d => d.studentId === paymentForm.studentId && d.status !== "paid")
                      .sort((a, b) => (a.year - b.year) || (a.month - b.month))
                      .map(due => {
                        const paid = payments
                          .filter(p => p.dueId === due.id)
                          .reduce((sum, p) => sum + p.amount, 0)
                        const rest = Math.max(0, Math.round((due.amount - paid) * 100) / 100)
                        return (
                          <SelectItem key={due.id} value={due.id}>
                            {duePeriodLabel(due)} — {moneyLabel(due.amount)}
                            {paid > 0 ? ` (مدفوع ${moneyLabel(paid)}، متبقٍ ${moneyLabel(rest)})` : ""}
                          </SelectItem>
                        )
                      })}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-gray-500 mt-1">
                  اختر الاستحقاق ليُملأ المبلغ المتبقي تلقائياً وتُحدَّث حالته (جزئي/مدفوع).
                </p>
              </div>
            )}

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
                  الرصيد الحالي: {moneyLabel(getStudentBalance(paymentForm.studentId).balance)}
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

      {/* ============ نافذة إنشاء الاستحقاقات: شهري / أسبوعي / بالحصّة / مبلغ مخصص ============ */}
      <Dialog open={dueDialogOpen} onOpenChange={setDueDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إنشاء استحقاق</DialogTitle>
            <DialogDescription>
              اختر دورة الاستحقاق (شهري أو أسبوعي أو بالحصّة أو مبلغ مخصص) ثم حدّد المجموعات أو الطالب
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* ---------- 1) دورة الاستحقاق ---------- */}
            <div>
              <Label>1. نوع الاستحقاق *</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                {DUE_CYCLE_ORDER.map(cycle => (
                  <button
                    key={cycle}
                    type="button"
                    onClick={() => setDueForm(prev => ({ ...prev, cycle }))}
                    className={`rounded-xl border-2 px-2 py-2.5 text-center transition-all ${
                      dueForm.cycle === cycle
                        ? "border-orange-500 bg-orange-50 dark:bg-orange-950/40 shadow-md"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-orange-300"
                    }`}
                  >
                    <p className="text-sm font-extrabold text-gray-900 dark:text-white">
                      {DUE_CYCLE_LABELS[cycle]}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">
                      {cycle === "monthly"
                        ? "شهر كامل"
                        : cycle === "weekly"
                        ? "أسبوع (السبت → الجمعة)"
                        : cycle === "session"
                        ? "حصة أو أكثر في يوم"
                        : "مبلغ حر بوصف"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* ---------- 2) الفترة ---------- */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 p-3 space-y-3">
              <Label>2. الفترة *</Label>

              {dueForm.cycle === "monthly" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">الشهر</Label>
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
                    <Label className="text-xs">السنة</Label>
                    <Input
                      type="number"
                      value={dueForm.year}
                      onChange={(e) =>
                        setDueForm(prev => ({ ...prev, year: parseInt(e.target.value) || new Date().getFullYear() }))
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
              )}

              {dueForm.cycle === "weekly" && (
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">أي يوم داخل الأسبوع المطلوب</Label>
                    <Input
                      type="date"
                      value={dueForm.weekStart}
                      onChange={(e) => setDueForm(prev => ({ ...prev, weekStart: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[-7, 0, 7].map(offset => (
                      <button
                        key={offset}
                        type="button"
                        onClick={() => {
                          const d = new Date()
                          d.setDate(d.getDate() + offset)
                          setDueForm(prev => ({ ...prev, weekStart: toDateKey(d) }))
                        }}
                        className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-orange-300 dark:border-orange-800 bg-white dark:bg-gray-900 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950"
                      >
                        {offset === 0 ? "الأسبوع الحالي" : offset < 0 ? "الأسبوع الماضي" : "الأسبوع القادم"}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 font-semibold">
                    الفترة: {duePeriodInfo.label}
                  </p>
                </div>
              )}

              {dueForm.cycle === "session" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">تاريخ الحصة</Label>
                    <Input
                      type="date"
                      value={dueForm.sessionDate}
                      onChange={(e) => setDueForm(prev => ({ ...prev, sessionDate: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">عدد الحصص</Label>
                    <Input
                      type="number"
                      min={1}
                      value={dueForm.sessionsCount}
                      onChange={(e) =>
                        setDueForm(prev => ({ ...prev, sessionsCount: Math.max(1, parseInt(e.target.value) || 1) }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 font-semibold sm:col-span-2">
                    الفترة: {duePeriodInfo.label}
                  </p>
                </div>
              )}

              {dueForm.cycle === "custom" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">الوصف (يظهر في كشف الحساب)</Label>
                    <Input
                      placeholder="مثال: حصة إضافية / مصروفات ملازم"
                      value={dueForm.customLabel}
                      onChange={(e) => setDueForm(prev => ({ ...prev, customLabel: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">المبلغ (ج.م) *</Label>
                    <Input
                      type="number"
                      min={0}
                      value={dueForm.customAmount || ""}
                      onChange={(e) =>
                        setDueForm(prev => ({ ...prev, customAmount: parseFloat(e.target.value) || 0 }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">التاريخ</Label>
                    <Input
                      type="date"
                      value={dueForm.sessionDate}
                      onChange={(e) => setDueForm(prev => ({ ...prev, sessionDate: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ---------- 3) على من يُنشأ الاستحقاق؟ ---------- */}
            <div>
              <Label>3. يُنشأ لـ *</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {([
                  { id: "groups", label: "مجموعات كاملة", hint: "كل الطلاب النشطين فيها" },
                  { id: "student", label: "طالب واحد", hint: "استحقاق خاص به" },
                ] as const).map(scope => (
                  <button
                    key={scope.id}
                    type="button"
                    onClick={() => setDueForm(prev => ({ ...prev, scope: scope.id }))}
                    className={`rounded-xl border-2 px-3 py-2 text-right transition-all ${
                      dueForm.scope === scope.id
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-indigo-300"
                    }`}
                  >
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{scope.label}</p>
                    <p className="text-[10px] text-gray-500">{scope.hint}</p>
                  </button>
                ))}
              </div>

              {dueForm.scope === "student" ? (
                <div className="mt-3">
                  <Select
                    value={dueForm.scopeStudentId}
                    onValueChange={(val) => setDueForm(prev => ({ ...prev, scopeStudentId: val }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="اختر الطالب" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.filter(s => s.status === "active").length === 0 ? (
                        <SelectItem value="__none" disabled>لا يوجد طلاب</SelectItem>
                      ) : (
                        students
                          .filter(s => s.status === "active")
                          .map(student => {
                            const group = allGroups.find(g => g.id === student.groupId)
                            return (
                              <SelectItem key={student.id} value={student.id}>
                                {student.name}
                                {group ? ` — ${group.gradeName} / ${group.name}` : ""}
                              </SelectItem>
                            )
                          })
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2 mt-3 max-h-56 overflow-y-auto pr-1">
                  {allGroups.map((group) => {
                    const studentsCount = students.filter(s => s.groupId === group.id && s.status === "active").length
                    return (
                      <div
                        key={group.id}
                        className="flex items-center justify-between gap-3 p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Checkbox
                            id={`group-${group.id}`}
                            checked={dueForm.selectedGroups.includes(group.id)}
                            onCheckedChange={() => toggleGroupSelection(group.id)}
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {group.gradeName} - {group.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {studentsCount} طالب • {groupCyclePrice(group)}
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
              )}
            </div>

            {/* ---------- 4) المبلغ ---------- */}
            {dueForm.cycle !== "custom" && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-orange-600"
                    checked={dueForm.useGroupPrice}
                    onChange={(e) => setDueForm(prev => ({ ...prev, useGroupPrice: e.target.checked }))}
                  />
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    استخدام سعر المجموعة ({DUE_CYCLE_LABELS[dueForm.cycle]})
                  </span>
                </label>
                {!dueForm.useGroupPrice && (
                  <div>
                    <Label className="text-xs">مبلغ محدّد يدوياً لكل طالب (ج.م)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={dueForm.manualAmount || ""}
                      onChange={(e) =>
                        setDueForm(prev => ({ ...prev, manualAmount: parseFloat(e.target.value) || 0 }))
                      }
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            )}

            {/* ---------- الملخص ---------- */}
            {dueTargets.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4 space-y-1">
                <p className="text-sm text-blue-700 dark:text-blue-300 font-semibold">
                  سيتم إنشاء {dueTargets.length} استحقاق ({DUE_CYCLE_LABELS[dueForm.cycle]}) — الفترة: {duePeriodInfo.label}
                </p>
                <p className="text-xs text-blue-600/90 dark:text-blue-400/90">
                  الإجمالي المتوقع: {moneyLabel(duePreviewTotal)} • تاريخ الاستحقاق: {toDateKey(duePeriodInfo.end)}
                </p>
                <p className="text-[11px] text-blue-600/70 dark:text-blue-400/70">
                  الاستحقاقات الموجودة مسبقاً لنفس الفترة تُتخطى تلقائياً حتى لا تتكرر على الطالب.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDueDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={createDues}
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
          <div id="student-statement-content" className="py-4">
            {(() => {
              const statement = getStudentStatement(selectedStudentId)
              const balance = getStudentBalance(selectedStudentId)
              const student = students.find(s => s.id === selectedStudentId)
              
              return (
                <div className="space-y-4">
                  {/* Student Info Header */}
                  <div className="text-center border-b pb-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">كشف حساب طالب</h2>
                    <p className="text-lg text-gray-700 dark:text-gray-300 mt-1">{student?.name}</p>
                    <p className="text-sm text-gray-500">
                      {grades.find(g => g.id === student?.gradeId)?.name} - {
                        grades.flatMap(g => g.groups).find(gr => gr.id === student?.groupId)?.name
                      }
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
                    <p className="text-center text-gray-500 py-8">لا توجد بيانات</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>الفترة</TableHead>
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
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{item.label}</span>
                                {item.cycle !== "monthly" && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {DUE_CYCLE_LABELS[item.cycle]}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{moneyLabel(item.dues)}</TableCell>
                            <TableCell className="text-green-600">{moneyLabel(item.payments)}</TableCell>
                            <TableCell className={item.balance > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>
                              {moneyLabel(item.balance)}
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
                    `كشف-حساب-${getStudentName(selectedStudentId)}-${new Date().toLocaleDateString('ar-EG')}`,
                    { orientation: 'portrait', scale: 2 }
                  )
                  toast.success('تم تحميل كشف الحساب بنجاح')
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
