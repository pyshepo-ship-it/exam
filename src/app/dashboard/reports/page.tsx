"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  DollarSign, 
  FileText,
  Calendar,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import toast from "react-hot-toast"
import { exportToPDF } from "@/lib/pdf-utils"
import {
  Grade,
  Student,
  Due,
  Payment,
  Exam,
  Attendance,
  ManualGrade,
  getGrades,
  getStudents,
  getDues,
  getPayments,
  getExams,
  getAttendance,
  getStudentBalance,
  getManualGrades,
  saveManualGrades,
} from "@/lib/data-storage"
import {
  collectStudentReport,
  buildStudentReportPagesHtml,
  STUDENT_REPORT_LABELS,
  StudentReport,
  StudentReportType,
} from "@/lib/student-report"
import { HtmlPrintDialog } from "@/components/html-print-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Printer, FileText as FileTextIcon, Plus, Trash2, UserRound } from "lucide-react"

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
]

export default function ReportsPage() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [dues, setDues] = useState<Due[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString())

  // ===== تقرير طالب =====
  const [srGradeId, setSrGradeId] = useState("")
  const [srGroupId, setSrGroupId] = useState("")
  const [srStudentId, setSrStudentId] = useState("")
  const [srType, setSrType] = useState<StudentReportType>("comprehensive")
  const [srReport, setSrReport] = useState<StudentReport | null>(null)
  const [printOpen, setPrintOpen] = useState(false)

  // ===== الدرجات اليدوية =====
  const [manualGrades, setManualGrades] = useState<ManualGrade[]>([])
  const [mgForm, setMgForm] = useState({
    studentId: "",
    title: "",
    score: "",
    maxScore: "100",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    notes: "",
  })

  useEffect(() => {
    setGrades(getGrades())
    setStudents(getStudents())
    setDues(getDues())
    setPayments(getPayments())
    setExams(getExams())
    setAttendance(getAttendance())
    setManualGrades(getManualGrades())
  }, [])

  // الطلاب المؤهلون لتقرير/درجة (حسب الصف والمجموعة المختارين)
  const srGrade = grades.find(g => g.id === srGradeId)
  const srGroups = srGrade?.groups || []
  const srStudents = students.filter(
    s => (!srGroupId || s.groupId === srGroupId) && (!srGradeId || s.gradeId === srGradeId)
  )

  const loadStudentReport = (studentId: string) => {
    const r = collectStudentReport(studentId)
    setSrReport(r)
    return r
  }

  const pickSrStudent = (studentId: string) => {
    setSrStudentId(studentId)
    loadStudentReport(studentId)
  }

  const addManualGrade = () => {
    if (!mgForm.studentId) { toast.error("اختر الطالب أولاً"); return }
    if (!mgForm.title.trim()) { toast.error("أدخل عنوان التقييم"); return }
    const score = parseFloat(mgForm.score)
    const maxScore = parseFloat(mgForm.maxScore)
    if (isNaN(score) || isNaN(maxScore) || maxScore <= 0 || score < 0 || score > maxScore) {
      toast.error("أدخل درجة صحيحة (أقل من أو تساوي الدرجة الكلية)")
      return
    }
    const student = students.find(s => s.id === mgForm.studentId)
    const item: ManualGrade = {
      id: `mg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      studentId: mgForm.studentId,
      gradeId: student?.gradeId || "",
      groupId: student?.groupId || "",
      title: mgForm.title.trim(),
      score,
      maxScore,
      month: mgForm.month,
      year: mgForm.year,
      notes: mgForm.notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    }
    const updated = [...manualGrades, item]
    setManualGrades(updated)
    saveManualGrades(updated)
    setMgForm(p => ({ ...p, title: "", score: "", notes: "" }))
    toast.success("تم حفظ الدرجة — تظهر فوراً في تقرير الطالب")
    if (srStudentId === mgForm.studentId) loadStudentReport(mgForm.studentId)
  }

  const deleteManualGrade = (id: string) => {
    if (!confirm("حذف هذه الدرجة؟")) return
    const updated = manualGrades.filter(m => m.id !== id)
    setManualGrades(updated)
    saveManualGrades(updated)
    toast.success("تم حذف الدرجة")
    if (srStudentId) loadStudentReport(srStudentId)
  }

  // السنوات المتاحة في التقرير (من البيانات الفعلية + السنة الحالية)
  const reportYears = [...new Set([
    ...dues.map(d => d.year),
    ...payments.map(p => p.year),
    new Date().getFullYear(),
  ])]
    .filter(y => !isNaN(y))
    .sort((a, b) => b - a)

  // Financial Report
  const monthDues = dues.filter(d => d.month === parseInt(selectedMonth) && d.year === parseInt(selectedYear))
  const monthPayments = payments.filter(p => p.month === parseInt(selectedMonth) && p.year === parseInt(selectedYear))
  const monthTotalDues = monthDues.reduce((sum, d) => sum + d.amount, 0)
  const monthTotalPayments = monthPayments.reduce((sum, p) => sum + p.amount, 0)
  const monthBalance = monthTotalDues - monthTotalPayments
  const monthCollectionRate = monthTotalDues > 0 ? ((monthTotalPayments / monthTotalDues) * 100).toFixed(1) : "0"

  // All-time stats
  const totalDues = dues.reduce((sum, d) => sum + d.amount, 0)
  const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0)
  const totalBalance = totalDues - totalPayments
  const overallCollectionRate = totalDues > 0 ? ((totalPayments / totalDues) * 100).toFixed(1) : "0"

  // Students with outstanding balances
  const studentsWithBalance = students.map(s => ({
    ...s,
    balance: getStudentBalance(s.id),
  })).filter(s => s.balance.balance > 0)

  // Group stats
  const groupStats = grades.flatMap(g => 
    g.groups.map(group => {
      const groupStudents = students.filter(s => s.groupId === group.id && s.status === 'active')
      const groupDues = dues.filter(d => d.groupId === group.id).reduce((sum, d) => sum + d.amount, 0)
      const groupPayments = groupStudents.reduce((sum, s) => {
        const studentPayments = payments.filter(p => p.studentId === s.id)
        return sum + studentPayments.reduce((sum, p) => sum + p.amount, 0)
      }, 0)
      
      return {
        ...group,
        gradeName: g.name,
        studentsCount: groupStudents.length,
        totalDues: groupDues,
        totalPayments: groupPayments,
        balance: groupDues - groupPayments,
      }
    })
  )

  // Attendance stats
  const attendanceStats = {
    total: attendance.length,
    present: attendance.filter(a => a.status === 'present').length,
    absent: attendance.filter(a => a.status === 'absent').length,
    late: attendance.filter(a => a.status === 'late').length,
    excused: attendance.filter(a => a.status === 'excused').length,
  }
  const overallAttendanceRate = attendanceStats.total > 0 
    ? ((attendanceStats.present / attendanceStats.total) * 100).toFixed(1) 
    : "0"

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
            التقارير
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            تقارير ذكية وإحصائيات شاملة
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-32">
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
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {reportYears.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={async () => {
              try {
                await exportToPDF(
                  'reports-content',
                  `تقرير-${MONTHS[parseInt(selectedMonth) - 1]}-${selectedYear}`,
                  { orientation: 'portrait', scale: 2 }
                )
                toast.success('تم تحميل التقرير بنجاح')
              } catch (error) {
                toast.error('حدث خطأ أثناء التصدير')
              }
            }}
            className="bg-gradient-to-r from-blue-500 to-indigo-600"
          >
            <Download className="w-4 h-4" />
            <span>تصدير PDF</span>
          </Button>
        </div>
      </motion.div>

      {/* Reports Content */}
      <div id="reports-content" className="space-y-6">

      {/* Overall Financial Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-6 text-white shadow-2xl"
      >
        <h2 className="text-xl font-bold mb-4">الملخص المالي الكلي</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-indigo-100 text-sm">إجمالي المستحقات</p>
            <p className="text-2xl font-bold">{totalDues} ج.م</p>
          </div>
          <div>
            <p className="text-indigo-100 text-sm">إجمالي المحصل</p>
            <p className="text-2xl font-bold">{totalPayments} ج.م</p>
          </div>
          <div>
            <p className="text-indigo-100 text-sm">المتبقي</p>
            <p className="text-2xl font-bold">{totalBalance} ج.م</p>
          </div>
          <div>
            <p className="text-indigo-100 text-sm">نسبة التحصيل</p>
            <p className="text-2xl font-bold">{overallCollectionRate}%</p>
          </div>
        </div>
      </motion.div>

      {/* Monthly Report */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          تقرير شهر {MONTHS[parseInt(selectedMonth) - 1]} {selectedYear}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { icon: TrendingUp, label: "المستحقات", value: `${monthTotalDues} ج.م`, color: "from-yellow-500 to-orange-600" },
            { icon: DollarSign, label: "المحصل", value: `${monthTotalPayments} ج.م`, color: "from-green-500 to-emerald-600" },
            { icon: AlertCircle, label: "المتبقي", value: `${monthBalance} ج.م`, color: monthBalance > 0 ? "from-red-500 to-rose-600" : "from-green-500 to-emerald-600" },
            { icon: TrendingUp, label: "نسبة التحصيل", value: `${monthCollectionRate}%`, color: "from-blue-500 to-indigo-600" },
          ].map((stat, index) => {
            const Icon = stat.icon
            return (
              <Card key={stat.label} className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg">
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg mb-4`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Groups Report */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg overflow-hidden"
        >
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              تقرير المجموعات
            </h3>
          </div>
          {groupStats.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              لا توجد مجموعات
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المجموعة</TableHead>
                    <TableHead>الطلاب</TableHead>
                    <TableHead>المستحقات</TableHead>
                    <TableHead>المحصل</TableHead>
                    <TableHead>المتبقي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupStats.map((group) => (
                    <TableRow key={group.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{group.gradeName}</p>
                          <p className="text-xs text-gray-500">{group.name}</p>
                        </div>
                      </TableCell>
                      <TableCell>{group.studentsCount}</TableCell>
                      <TableCell>{group.totalDues} ج.م</TableCell>
                      <TableCell className="text-green-600">{group.totalPayments} ج.م</TableCell>
                      <TableCell className={group.balance > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>
                        {group.balance} ج.م
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </motion.div>

        {/* Students with Outstanding Balances */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg overflow-hidden"
        >
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              الطلاب بأرصدة مستحقة ({studentsWithBalance.length})
            </h3>
          </div>
          {studentsWithBalance.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
              <p>جميع الطلاب مسددون!</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الطالب</TableHead>
                    <TableHead>المستحقات</TableHead>
                    <TableHead>المدفوع</TableHead>
                    <TableHead>المتبقي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentsWithBalance
                    .sort((a, b) => b.balance.balance - a.balance.balance)
                    .map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-medium">{student.name}</TableCell>
                        <TableCell>{student.balance.totalDues} ج.م</TableCell>
                        <TableCell className="text-green-600">{student.balance.totalPayments} ج.م</TableCell>
                        <TableCell className="text-red-600 font-bold">{student.balance.balance} ج.م</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </motion.div>

        {/* Attendance Report */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg overflow-hidden"
        >
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              تقرير الحضور العام
            </h3>
          </div>
          <div className="p-6">
            {attendanceStats.total === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>لا توجد سجلات حضور</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center py-4 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 rounded-xl">
                  <p className="text-4xl font-bold text-teal-600 dark:text-teal-400">{overallAttendanceRate}%</p>
                  <p className="text-sm text-gray-500">نسبة الحضور العامة</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center">
                    <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">{attendanceStats.present}</p>
                    <p className="text-xs text-gray-500">حاضر</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-center">
                    <XCircle className="w-6 h-6 text-red-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-red-700 dark:text-red-300">{attendanceStats.absent}</p>
                    <p className="text-xs text-gray-500">غائب</p>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-3 text-center">
                    <AlertCircle className="w-6 h-6 text-yellow-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-yellow-700 dark:text-yellow-300">{attendanceStats.late}</p>
                    <p className="text-xs text-gray-500">متأخر</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-center">
                    <FileText className="w-6 h-6 text-blue-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{attendanceStats.excused}</p>
                    <p className="text-xs text-gray-500">إذن</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Exams Report */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg overflow-hidden"
        >
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5" />
              تقرير الاختبارات
            </h3>
          </div>
          <div className="p-6">
            {exams.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>لا توجد اختبارات</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center py-4 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 rounded-xl">
                  <p className="text-4xl font-bold text-red-600 dark:text-red-400">{exams.length}</p>
                  <p className="text-sm text-gray-500">إجمالي الاختبارات</p>
                </div>
                <div className="space-y-2">
                  {exams.slice(0, 5).map(exam => (
                    <div key={exam.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{exam.title}</p>
                        <p className="text-xs text-gray-500">
                          {grades.find(g => g.id === exam.gradeId)?.name} • {exam.questions.length} سؤال
                        </p>
                      </div>
                      <Badge variant="outline">
                        {exam.month ? MONTHS[exam.month - 1] : ''}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* ================== تقرير طالب مفصل ================== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserRound className="w-5 h-5 text-purple-600" />
                تقرير طالب مفصل
              </CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                تقرير كامل لطالب واحد (درجاته يدوياً والكترونياً + مدفوعاته + حضوره + مكافآته وسجله) — قابل للطباعة وإرساله لولي الأمر
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label>الصف</Label>
                  <Select value={srGradeId} onValueChange={v => { setSrGradeId(v); setSrGroupId(""); setSrStudentId(""); setSrReport(null) }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="كل الصفوف" /></SelectTrigger>
                    <SelectContent>
                      {grades.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>المجموعة</Label>
                  <Select value={srGroupId} onValueChange={v => { setSrGroupId(v); setSrStudentId(""); setSrReport(null) }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="كل المجموعات" /></SelectTrigger>
                    <SelectContent>
                      {srGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الطالب</Label>
                  <Select value={srStudentId} onValueChange={pickSrStudent}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder={srStudents.length ? "اختر الطالب" : "لا يوجد طلاب"} /></SelectTrigger>
                    <SelectContent>
                      {srStudents.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>نوع التقرير</Label>
                  <Select value={srType} onValueChange={(v: StudentReportType) => setSrType(v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STUDENT_REPORT_LABELS) as StudentReportType[]).map(k => (
                        <SelectItem key={k} value={k}>{STUDENT_REPORT_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {srReport && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-center">
                      <p className="text-xs text-blue-600 font-bold">التقييمات اليدوية</p>
                      <p className="text-xl font-extrabold text-blue-700 dark:text-blue-300">{srReport.manualGrades.length}</p>
                    </div>
                    <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 p-3 text-center">
                      <p className="text-xs text-indigo-600 font-bold">اختبارات إلكترونية</p>
                      <p className="text-xl font-extrabold text-indigo-700 dark:text-indigo-300">{srReport.examAttempts.length}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-center">
                      <p className="text-xs text-emerald-600 font-bold">الرصيد</p>
                      <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">{srReport.balance.toLocaleString("ar-EG")} ج.م</p>
                    </div>
                    <div className="rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 p-3 text-center">
                      <p className="text-xs text-teal-600 font-bold">نسبة الحضور</p>
                      <p className="text-xl font-extrabold text-teal-700 dark:text-teal-300">{srReport.attendance.rate}%</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => setPrintOpen(true)}
                    className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
                  >
                    <Printer className="w-4 h-4" />
                    <span>معاينة وطباعة {STUDENT_REPORT_LABELS[srType]} — {srReport.student.name}</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ================== تسجيل الدرجات يدوياً ================== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="w-5 h-5 text-emerald-600" />
                تسجيل الدرجات يدوياً
              </CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                خاص بتسجيل الدرجات يدوياً (واجبات، مهارات، تقييمات صفية...) — تُدمج تلقائياً مع نتائج الاختبارات الإلكترونية في تقرير الطالب
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <Label>الطالب</Label>
                  <Select value={mgForm.studentId} onValueChange={v => setMgForm(p => ({ ...p, studentId: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الطالب" /></SelectTrigger>
                    <SelectContent>
                      {students.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} — {grades.find(g => g.id === s.gradeId)?.name || ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>عنوان التقييم</Label>
                  <Input
                    value={mgForm.title}
                    onChange={e => setMgForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="مثال: واجب الوحدة الثانية"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>الدرجة / الكلية</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      value={mgForm.score}
                      onChange={e => setMgForm(p => ({ ...p, score: e.target.value }))}
                      placeholder="الدرجة"
                    />
                    <Input
                      type="number"
                      value={mgForm.maxScore}
                      onChange={e => setMgForm(p => ({ ...p, maxScore: e.target.value }))}
                      placeholder="من"
                    />
                  </div>
                </div>
                <div>
                  <Label>الشهر</Label>
                  <Select value={mgForm.month.toString()} onValueChange={v => setMgForm(p => ({ ...p, month: parseInt(v) }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>السنة</Label>
                  <Select value={mgForm.year.toString()} onValueChange={v => setMgForm(p => ({ ...p, year: parseInt(v) }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[...new Set([mgForm.year, new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() + 1])].sort((a, b) => b - a).map(y => (
                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ملاحظة (اختياري)</Label>
                  <Input
                    value={mgForm.notes}
                    onChange={e => setMgForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="ملاحظة تظهر في التقرير"
                    className="mt-1"
                  />
                </div>
              </div>
              <Button
                onClick={addManualGrade}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
              >
                <Plus className="w-4 h-4" />
                <span>حفظ الدرجة</span>
              </Button>

              {manualGrades.length > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                  <p className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-3">
                    الدرجات المسجلة ({manualGrades.length})
                  </p>
                  <div className="space-y-2 max-h-72 overflow-y-auto pl-1">
                    {[...manualGrades].reverse().map(m => {
                      const st = students.find(s => s.id === m.studentId)
                      const pct = m.maxScore > 0 ? Math.round((m.score / m.maxScore) * 100) : 0
                      return (
                        <div key={m.id} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-2.5 border border-gray-100 dark:border-gray-800">
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{st?.name || "طالب محذوف"} — {m.title}</p>
                            <p className="text-xs text-gray-400">{m.month}/{m.year}{m.notes ? ` — ${m.notes}` : ""}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`font-extrabold text-sm ${pct >= 85 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-red-600"}`}>
                              {m.score} / {m.maxScore}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteManualGrade(m.id)}
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 h-8 w-8"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
      </div>

      <HtmlPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        build={printOpen && srReport ? () => buildStudentReportPagesHtml({ report: srReport, type: srType, mode: "teacher" }) : null}
        filename={`تقرير-${srReport?.student.name || "الطالب"}-${STUDENT_REPORT_LABELS[srType]}`}
        title={`${STUDENT_REPORT_LABELS[srType]} — ${srReport?.student.name || ""}`}
        description="تقرير رسمي بتوقيع المعلم — جاهز للطباعة أو الإرسال لولي الأمر"
        accentClass="text-emerald-600"
      />
    </div>
  )
}
