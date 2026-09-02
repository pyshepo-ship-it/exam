"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  ClipboardCheck, 
  Plus, 
  Check, 
  X, 
  Clock, 
  AlertCircle,
  Calendar,
  Users,
  CheckCircle,
  XCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import toast from "react-hot-toast"
import {
  Grade,
  Student,
  Session,
  Attendance,
  getAllGroups,
  getGrades,
  getStudents,
  getSessions,
  getAttendance,
  saveSessions,
  saveAttendance,
} from "@/lib/data-storage"

export default function AttendancePage() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  
  const [selectedGrade, setSelectedGrade] = useState<string>("")
  const [selectedGroup, setSelectedGroup] = useState<string>("")
  const [selectedSession, setSelectedSession] = useState<string>("")
  
  const [newSessionDialog, setNewSessionDialog] = useState(false)
  const [sessionForm, setSessionForm] = useState({
    groupId: "",
    sessionDate: new Date().toISOString().split('T')[0],
    startTime: "",
    endTime: "",
    notes: "",
  })

  const [localAttendance, setLocalAttendance] = useState<Record<string, { status: string; notes: string }>>({})

  useEffect(() => {
    setGrades(getGrades())
    setStudents(getStudents())
    setSessions(getSessions())
    setAttendance(getAttendance())
  }, [])

  // كل المجموعات في جميع الصفوف (مع اسم الصف)
  const allGroups = getAllGroups(grades)
  const groupStudents = students.filter(s => s.groupId === selectedGroup && s.status === 'active')
  const currentSession = sessions.find(s => s.id === selectedSession)
  
  // Get existing attendance for current session
  useEffect(() => {
    if (selectedSession) {
      const sessionAttendance = attendance.filter(a => a.sessionId === selectedSession)
      const attendanceMap: Record<string, { status: string; notes: string }> = {}
      sessionAttendance.forEach(a => {
        attendanceMap[a.studentId] = { status: a.status, notes: a.notes || "" }
      })
      setLocalAttendance(attendanceMap)
    }
  }, [selectedSession, attendance])

  // Mark all present
  const markAllPresent = () => {
    const map: Record<string, { status: string; notes: string }> = {}
    groupStudents.forEach(s => {
      map[s.id] = { status: 'present', notes: '' }
    })
    setLocalAttendance(map)
  }

  // Update student attendance
  const updateStudentAttendance = (studentId: string, status: string) => {
    setLocalAttendance(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], status, notes: prev[studentId]?.notes || "" }
    }))
  }

  // Create new session
  const createSession = () => {
    if (!sessionForm.groupId || !sessionForm.sessionDate) {
      toast.error("يرجى ملء جميع الحقول المطلوبة")
      return
    }

    const group = grades.flatMap(g => g.groups).find(g => g.id === sessionForm.groupId)
    const newSession: Session = {
      id: Date.now().toString(),
      groupId: sessionForm.groupId,
      sessionDate: sessionForm.sessionDate,
      startTime: sessionForm.startTime || group?.startTime || "",
      endTime: sessionForm.endTime || group?.endTime || "",
      notes: sessionForm.notes || undefined,
      createdAt: new Date().toISOString(),
    }

    const updatedSessions = [...sessions, newSession]
    setSessions(updatedSessions)
    saveSessions(updatedSessions)
    setNewSessionDialog(false)
    setSessionForm({
      groupId: "",
      sessionDate: new Date().toISOString().split('T')[0],
      startTime: "",
      endTime: "",
      notes: "",
    })
    toast.success("تم إضافة الحصة بنجاح")
  }

  // Save attendance
  const saveAttendanceData = () => {
    if (!selectedSession) {
      toast.error("يرجى اختيار الحصة أولاً")
      return
    }

    const newAttendance: Attendance[] = []
    
    groupStudents.forEach(student => {
      const studentAttendance = localAttendance[student.id]
      
      // Remove existing
      const existingIndex = attendance.findIndex(
        a => a.sessionId === selectedSession && a.studentId === student.id
      )
      if (existingIndex !== -1) {
        attendance.splice(existingIndex, 1)
      }

      if (studentAttendance && studentAttendance.status) {
        newAttendance.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          sessionId: selectedSession,
          studentId: student.id,
          status: studentAttendance.status as 'present' | 'absent' | 'late' | 'excused',
          notes: studentAttendance.notes || undefined,
          createdAt: new Date().toISOString(),
        })
      }
    })

    const updatedAttendance = [...attendance, ...newAttendance]
    setAttendance(updatedAttendance)
    saveAttendance(updatedAttendance)
    toast.success("تم حفظ الحضور بنجاح")
  }

  // Calculate attendance stats for group
  const getGroupAttendanceStats = (groupId: string) => {
    const groupSessionIds = sessions.filter(s => s.groupId === groupId).map(s => s.id)
    const groupAttendance = attendance.filter(a => groupSessionIds.includes(a.sessionId))
    
    const total = groupAttendance.length
    const present = groupAttendance.filter(a => a.status === 'present').length
    const absent = groupAttendance.filter(a => a.status === 'absent').length
    const late = groupAttendance.filter(a => a.status === 'late').length
    
    return {
      total,
      present,
      absent,
      late,
      rate: total > 0 ? ((present / total) * 100).toFixed(1) : "0"
    }
  }

  // Group sessions
  const groupSessions = sessions.filter(s => s.groupId === selectedGroup)

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
            الحضور والغياب
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            تسجيل حضور وغياب الطلاب لكل حصة
          </p>
        </div>
        <Button 
          onClick={() => setNewSessionDialog(true)}
          className="bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 shadow-lg"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة حصة جديدة</span>
        </Button>
      </motion.div>

      {/* Session Selection */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg"
      >
        <h3 className="font-bold text-gray-900 dark:text-white mb-4">اختر الحصة</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>الصف</Label>
            <Select 
              value={selectedGrade} 
              onValueChange={(val) => {
                setSelectedGrade(val)
                setSelectedGroup("")
                setSelectedSession("")
              }}
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
            <Label>المجموعة</Label>
            <Select 
              value={selectedGroup} 
              onValueChange={(val) => {
                setSelectedGroup(val)
                const group = allGroups.find(g => g.id === val)
                if (group) setSelectedGrade(group.gradeId)
                setSelectedSession("")
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="اختر المجموعة" />
              </SelectTrigger>
              <SelectContent>
                {allGroups.map(group => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.gradeName} - {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الحصة</Label>
            <Select 
              value={selectedSession} 
              onValueChange={setSelectedSession}
              disabled={!selectedGroup}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="اختر الحصة" />
              </SelectTrigger>
              <SelectContent>
                {groupSessions.map(session => (
                  <SelectItem key={session.id} value={session.id}>
                    {new Date(session.sessionDate).toLocaleDateString('ar-EG')} 
                    {session.notes && ` - ${session.notes}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </motion.div>

      {/* Attendance Form */}
      {selectedSession && groupStudents.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg"
        >
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-white">
              تسجيل الحضور ({groupStudents.length} طالب)
            </h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={markAllPresent}
                className="text-green-600"
              >
                <CheckCircle className="w-4 h-4" />
                <span>تحضير الكل</span>
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
              const studentAttendance = localAttendance[student.id]
              return (
                <motion.div
                  key={student.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`flex flex-col gap-3 p-4 rounded-xl border transition-colors sm:flex-row sm:items-center sm:justify-between ${
                    studentAttendance?.status === 'present' 
                      ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900' 
                      : studentAttendance?.status === 'absent'
                      ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900'
                      : studentAttendance?.status === 'late'
                      ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900'
                      : studentAttendance?.status === 'excused'
                      ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900'
                      : 'border-gray-200 dark:border-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center text-white font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{student.name}</p>
                      {student.phone && (
                        <p className="text-xs text-gray-500">{student.phone}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={studentAttendance?.status === 'present' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateStudentAttendance(student.id, 'present')}
                      className={studentAttendance?.status === 'present' ? 'bg-green-500 hover:bg-green-600' : ''}
                    >
                      <Check className="w-4 h-4" />
                      <span className="hidden sm:inline">حاضر</span>
                    </Button>
                    <Button
                      variant={studentAttendance?.status === 'late' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateStudentAttendance(student.id, 'late')}
                      className={studentAttendance?.status === 'late' ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                    >
                      <Clock className="w-4 h-4" />
                      <span className="hidden sm:inline">متأخر</span>
                    </Button>
                    <Button
                      variant={studentAttendance?.status === 'excused' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateStudentAttendance(student.id, 'excused')}
                      className={studentAttendance?.status === 'excused' ? 'bg-blue-500 hover:bg-blue-600' : ''}
                    >
                      <AlertCircle className="w-4 h-4" />
                      <span className="hidden sm:inline">إذن</span>
                    </Button>
                    <Button
                      variant={studentAttendance?.status === 'absent' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateStudentAttendance(student.id, 'absent')}
                      className={studentAttendance?.status === 'absent' ? 'bg-red-500 hover:bg-red-600' : ''}
                    >
                      <X className="w-4 h-4" />
                      <span className="hidden sm:inline">غائب</span>
                    </Button>
                  </div>
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

      {/* Overall Stats */}
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
              { label: "نسبة الحضور", value: `${stats.rate}%`, color: "from-purple-500 to-pink-600", icon: ClipboardCheck },
            ].map((stat, index) => {
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

      {/* New Session Dialog */}
      <Select open={newSessionDialog} onOpenChange={setNewSessionDialog}>
        {/* Using Dialog instead */}
      </Select>

      {/* Simple new session form inline */}
      {newSessionDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setNewSessionDialog(false)}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-900 rounded-2xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              إضافة حصة جديدة
            </h3>
            <div className="space-y-4">
              <div>
                <Label>المجموعة *</Label>
                <Select 
                  value={sessionForm.groupId} 
                  onValueChange={(val) => setSessionForm(prev => ({ ...prev, groupId: val }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر المجموعة" />
                  </SelectTrigger>
                  <SelectContent>
                    {grades.flatMap(g => g.groups.map(gr => ({ ...gr, gradeName: g.name }))).map(group => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.gradeName} - {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>التاريخ *</Label>
                <Input
                  type="date"
                  value={sessionForm.sessionDate}
                  onChange={(e) => setSessionForm(prev => ({ ...prev, sessionDate: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>ملاحظات (اختياري)</Label>
                <Input
                  placeholder="مثال: حصة مراجعة"
                  value={sessionForm.notes}
                  onChange={(e) => setSessionForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setNewSessionDialog(false)} className="flex-1">
                إلغاء
              </Button>
              <Button 
                onClick={createSession}
                className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600"
              >
                إضافة الحصة
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
