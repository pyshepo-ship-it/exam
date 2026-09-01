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
import {
  Grade,
  Student,
  Due,
  Payment,
  Exam,
  Attendance,
  getGrades,
  getStudents,
  getDues,
  getPayments,
  getExams,
  getAttendance,
  getStudentBalance,
} from "@/lib/data-storage"

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

  useEffect(() => {
    setGrades(getGrades())
    setStudents(getStudents())
    setDues(getDues())
    setPayments(getPayments())
    setExams(getExams())
    setAttendance(getAttendance())
  }, [])

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
        <div className="flex items-center gap-3">
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
              {[2024, 2025, 2026, 2027].map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

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
      </div>
    </div>
  )
}
