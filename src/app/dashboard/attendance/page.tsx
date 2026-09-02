"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  ClipboardCheck,
  Check,
  Users,
  CheckCircle,
  XCircle,
  CalendarDays,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import toast from "react-hot-toast"
import { formatTime12 } from "@/lib/utils"
import {
  Grade,
  Student,
  getGroupsOfGrade,
  getGrades,
  getStudents,
  saveGroupDayAttendance,
  getGroupDayAttendance,
  getGroupAttendanceDates,
  getAttendanceForGroup,
} from "@/lib/data-storage"
import { arabicWeekday, isGroupDay, toISODate } from "@/lib/weekdays"

export default function AttendancePage() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [students, setStudents] = useState<Student[]>([])

  const [selectedGrade, setSelectedGrade] = useState("")
  const [selectedGroup, setSelectedGroup] = useState("")
  const [selectedDate, setSelectedDate] = useState(toISODate())
  const [presentMap, setPresentMap] = useState<Record<string, boolean>>({})
  const [historyDates, setHistoryDates] = useState<string[]>([])

  const loadAll = () => {
    setGrades(getGrades())
    setStudents(getStudents())
  }

  useEffect(() => {
    loadAll()
  }, [])

  const group = getGroupsOfGrade(grades, selectedGrade).find(g => g.id === selectedGroup)
  const groupStudents = students
    .filter(s => s.groupId === selectedGroup && s.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name, "ar"))

  useEffect(() => {
    if (!selectedGroup || !selectedDate) {
      setPresentMap({})
      setHistoryDates([])
      return
    }
    const existing = getGroupDayAttendance(selectedGroup, selectedDate)
    const map: Record<string, boolean> = {}
    if (existing.length > 0) {
      existing.forEach(a => {
        map[a.studentId] = a.status === "present"
      })
    }
    setPresentMap(map)
    setHistoryDates(getGroupAttendanceDates(selectedGroup))
  }, [selectedGroup, selectedDate])

  const dayName = arabicWeekday(selectedDate)
  const scheduledToday = group ? isGroupDay(group.days, selectedDate) : false

  const togglePresent = (studentId: string) => {
    setPresentMap(prev => ({ ...prev, [studentId]: !prev[studentId] }))
  }

  const markAllPresent = () => {
    const map: Record<string, boolean> = {}
    groupStudents.forEach(s => {
      map[s.id] = true
    })
    setPresentMap(map)
  }

  const markAllAbsent = () => {
    const map: Record<string, boolean> = {}
    groupStudents.forEach(s => {
      map[s.id] = false
    })
    setPresentMap(map)
  }

  const saveAttendanceData = () => {
    if (!selectedGroup) {
      toast.error("يرجى اختيار الصف ثم المجموعة")
      return
    }
    if (groupStudents.length === 0) {
      toast.error("لا يوجد طلاب في هذه المجموعة")
      return
    }
    saveGroupDayAttendance(
      selectedGroup,
      selectedDate,
      groupStudents.map(s => ({ studentId: s.id, present: !!presentMap[s.id] })),
      group ? { startTime: group.startTime, endTime: group.endTime } : undefined
    )
    loadAll()
    setHistoryDates(getGroupAttendanceDates(selectedGroup))
    const presentCount = groupStudents.filter(s => presentMap[s.id]).length
    toast.success(`تم حفظ حضور ${presentCount} من ${groupStudents.length} طالب`)
  }

  const getGroupAttendanceStats = (groupId: string) => {
    const groupAttendance = getAttendanceForGroup(groupId)
    const total = groupAttendance.length
    const present = groupAttendance.filter(a => a.status === "present").length
    const absent = groupAttendance.filter(a => a.status === "absent").length
    return {
      total,
      present,
      absent,
      rate: total > 0 ? ((present / total) * 100).toFixed(1) : "0",
    }
  }

  const presentCount = groupStudents.filter(s => presentMap[s.id]).length

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            الحضور والغياب
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            اختر الصف ثم المجموعة، ضع علامة صح بجانب الحاضرين، ثم احفظ — للمتابعة والتقييم فقط وليس للتحصيل
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg"
      >
        <h3 className="font-bold text-gray-900 dark:text-white mb-4">اختر المجموعة واليوم</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>الصف</Label>
            <Select
              value={selectedGrade}
              onValueChange={(val) => {
                setSelectedGrade(val)
                setSelectedGroup("")
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="اختر الصف" />
              </SelectTrigger>
              <SelectContent>
                {grades.length === 0 ? (
                  <SelectItem value="__none" disabled>لا توجد صفوف</SelectItem>
                ) : (
                  grades.map(grade => (
                    <SelectItem key={grade.id} value={grade.id}>{grade.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>المجموعة</Label>
            <Select
              value={selectedGroup}
              disabled={!selectedGrade}
              onValueChange={setSelectedGroup}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={selectedGrade ? "اختر المجموعة" : "اختر الصف أولاً"} />
              </SelectTrigger>
              <SelectContent>
                {!selectedGrade ? (
                  <SelectItem value="__none" disabled>اختر الصف أولاً</SelectItem>
                ) : getGroupsOfGrade(grades, selectedGrade).length === 0 ? (
                  <SelectItem value="__none" disabled>لا توجد مجموعات في هذا الصف</SelectItem>
                ) : (
                  getGroupsOfGrade(grades, selectedGrade).map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>التاريخ</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mt-1"
            />
            <p className="text-[11px] text-gray-400 mt-1">يوم {dayName}</p>
          </div>
        </div>

        {group && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">أيام المجموعة:</span>
            {group.days.length === 0 ? (
              <span className="text-gray-400">لم تُحدد أيام بعد</span>
            ) : (
              group.days.map(d => (
                <span
                  key={d}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    d === dayName
                      ? "bg-teal-600 text-white"
                      : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  {d}
                </span>
              ))
            )}
            {group.startTime && (
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium mr-auto">
                {formatTime12(group.startTime)} — {formatTime12(group.endTime)}
              </span>
            )}
          </div>
        )}

        {group && !scheduledToday && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              اليوم المحدد ({dayName}) ليس من أيام هذه المجموعة
              {group.days.length > 0 ? ` (${group.days.join("، ")})` : ""}. يمكنك تسجيل الحضور رغم ذلك إذا كانت حصة تعويضية.
            </p>
          </div>
        )}

        {historyDates.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-2">أيام مسجَّلة سابقاً</p>
            <div className="flex flex-wrap gap-2">
              {historyDates.slice(0, 12).map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className={`text-xs px-3 py-1 rounded-full border ${
                    d === selectedDate
                      ? "bg-teal-600 text-white border-teal-600"
                      : "border-gray-200 dark:border-gray-700 hover:border-teal-400"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {selectedGroup && groupStudents.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg"
        >
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="font-bold text-gray-900 dark:text-white">
              طلاب المجموعة ({groupStudents.length}) — حاضر {presentCount}
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={markAllPresent} className="text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span>تحضير الكل</span>
              </Button>
              <Button variant="outline" size="sm" onClick={markAllAbsent} className="text-red-600">
                <XCircle className="w-4 h-4" />
                <span>تغييب الكل</span>
              </Button>
              <Button
                size="sm"
                onClick={saveAttendanceData}
                className="bg-gradient-to-r from-teal-500 to-cyan-600"
              >
                حفظ الحضور
              </Button>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {groupStudents.map((student, index) => {
              const present = !!presentMap[student.id]
              return (
                <motion.div
                  key={student.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={`flex items-center justify-between gap-3 p-4 rounded-xl border transition-colors ${
                    present
                      ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900"
                      : "border-gray-200 dark:border-gray-800"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{student.name}</p>
                      {student.phone && (
                        <p className="text-xs text-gray-500">{student.phone}</p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => togglePresent(student.id)}
                    aria-pressed={present}
                    className={`w-11 h-11 rounded-xl border-2 flex items-center justify-center transition-all ${
                      present
                        ? "bg-green-500 border-green-500 text-white shadow-md"
                        : "border-gray-300 dark:border-gray-600 text-transparent hover:border-green-400"
                    }`}
                    title={present ? "حاضر — اضغط لإلغاء التحضير" : "اضغط لتسجيل الحضور"}
                  >
                    <Check className="w-6 h-6" />
                  </button>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      )}

      {selectedGroup && groupStudents.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <Users className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-700" />
          <p className="text-gray-500 dark:text-gray-400">لا يوجد طلاب في هذه المجموعة</p>
        </div>
      )}

      {selectedGroup && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {(() => {
            const stats = getGroupAttendanceStats(selectedGroup)
            return [
              { label: "إجمالي التسجيلات", value: stats.total, color: "from-blue-500 to-indigo-600", icon: ClipboardCheck },
              { label: "حاضر", value: stats.present, color: "from-green-500 to-emerald-600", icon: CheckCircle },
              { label: "غائب", value: stats.absent, color: "from-red-500 to-rose-600", icon: XCircle },
              { label: "نسبة الحضور", value: `${stats.rate}%`, color: "from-purple-500 to-pink-600", icon: CalendarDays },
            ].map((stat) => {
              const Icon = stat.icon
              return (
                <Card key={stat.label} className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg">
                  <CardContent className="p-4">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg mb-3`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                  </CardContent>
                </Card>
              )
            })
          })()}
        </motion.div>
      )}
    </div>
  )
}
