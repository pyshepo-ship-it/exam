"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Settings, 
  User, 
  Lock, 
  Mail, 
  Palette, 
  Database,
  Download,
  Upload,
  Trash2,
  BookOpen,
  Shield,
  CheckCircle,
  AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getGrades,
  getStudents,
  getDues,
  getPayments,
  getExams,
  getSessions,
  getAttendance,
  saveGrades,
  saveStudents,
  saveDues,
  savePayments,
  saveExams,
  saveSessions,
  saveAttendance,
} from "@/lib/data-storage"

export default function SettingsPage() {
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [backupDialogOpen, setBackupDialogOpen] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordMessage, setPasswordMessage] = useState("")

  const [dataStats, setDataStats] = useState({
    grades: 0,
    students: 0,
    dues: 0,
    payments: 0,
    exams: 0,
    sessions: 0,
    attendance: 0,
  })

  useEffect(() => {
    setDataStats({
      grades: getGrades().length,
      students: getStudents().length,
      dues: getDues().length,
      payments: getPayments().length,
      exams: getExams().length,
      sessions: getSessions().length,
      attendance: getAttendance().length,
    })
  }, [])

  // Change password
  const changePassword = () => {
    if (currentPassword !== "789789789") {
      setPasswordMessage("كلمة المرور الحالية غير صحيحة")
      return
    }
    if (newPassword.length < 6) {
      setPasswordMessage("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("كلمة المرور الجديدة غير متطابقة")
      return
    }
    
    // Save new password (in real app would use Supabase)
    alert("تم تغيير كلمة المرور بنجاح (في النسخة الكاملة سيتم تحديثها في Supabase)")
    setPasswordDialogOpen(false)
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setPasswordMessage("")
  }

  // Export data
  const exportData = () => {
    const data = {
      grades: getGrades(),
      students: getStudents(),
      dues: getDues(),
      payments: getPayments(),
      exams: getExams(),
      sessions: getSessions(),
      attendance: getAttendance(),
      exportedAt: new Date().toISOString(),
      version: "1.0.0",
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Import data
  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        
        if (data.grades) saveGrades(data.grades)
        if (data.students) saveStudents(data.students)
        if (data.dues) saveDues(data.dues)
        if (data.payments) savePayments(data.payments)
        if (data.exams) saveExams(data.exams)
        if (data.sessions) saveSessions(data.sessions)
        if (data.attendance) saveAttendance(data.attendance)
        
        alert("تم استيراد البيانات بنجاح! سيتم تحديث الصفحة.")
        window.location.reload()
      } catch (err) {
        alert("خطأ في قراءة الملف. تأكد من أنه ملف نسخة احتياطية صحيحة.")
      }
    }
    reader.readAsText(file)
  }

  // Clear all data
  const clearAllData = () => {
    localStorage.clear()
    alert("تم حذف جميع البيانات. سيتم تحديث الصفحة.")
    window.location.reload()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          الإعدادات
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          إدارة إعدادات الحساب والنظام
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl">إعدادات الحساب</CardTitle>
                  <p className="text-sm text-gray-500">معلومات الحساب الشخصي</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>اسم المستخدم</Label>
                <Input defaultValue="doha alaraby" disabled className="mt-1 bg-gray-50" />
              </div>
              <div>
                <Label>البريد الإلكتروني</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input defaultValue="py.shepo@gmail.com" disabled className="bg-gray-50" />
                  <Mail className="w-5 h-5 text-gray-400 shrink-0" />
                </div>
              </div>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setPasswordDialogOpen(true)}
              >
                <Lock className="w-4 h-4" />
                <span>تغيير كلمة المرور</span>
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Appearance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
                  <Palette className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl">المظهر</CardTitle>
                  <p className="text-sm text-gray-500">تخصيص شكل النظام</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">الوضع الليلي</p>
                  <p className="text-sm text-gray-500">تفعيل الوضع الداكن</p>
                </div>
                <ThemeToggle />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Data Management */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2"
        >
          <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-500 to-slate-600 flex items-center justify-center shadow-lg">
                  <Database className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl">إدارة البيانات</CardTitle>
                  <p className="text-sm text-gray-500">تصدير واستيراد وحذف البيانات</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Data Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "الصفوف", value: dataStats.grades, color: "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300" },
                  { label: "الطلاب", value: dataStats.students, color: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300" },
                  { label: "الاستحقاقات", value: dataStats.dues, color: "bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300" },
                  { label: "المدفوعات", value: dataStats.payments, color: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300" },
                  { label: "الاختبارات", value: dataStats.exams, color: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300" },
                  { label: "الحصص", value: dataStats.sessions, color: "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300" },
                  { label: "سجلات الحضور", value: dataStats.attendance, color: "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300" },
                ].map((stat) => (
                  <div key={stat.label} className={`${stat.color} rounded-lg p-3 text-center`}>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  onClick={exportData}
                  className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                >
                  <Download className="w-4 h-4" />
                  <span>تصدير البيانات (نسخة احتياطية)</span>
                </Button>
                <label className="inline-flex">
                  <Button
                    variant="outline"
                    className="w-full border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                    onClick={() => document.getElementById('importFile')?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    <span>استيراد البيانات</span>
                  </Button>
                  <input
                    id="importFile"
                    type="file"
                    accept=".json"
                    onChange={importData}
                    className="hidden"
                  />
                </label>
                <Button
                  variant="outline"
                  onClick={() => setClearDialogOpen(true)}
                  className="border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف جميع البيانات</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* System Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2"
        >
          <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl">معلومات النظام</CardTitle>
                  <p className="text-sm text-gray-500">معلومات تقنية عن النظام</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
                    <span className="text-gray-500">الإصدار</span>
                    <span className="font-semibold text-gray-900 dark:text-white">1.0.0</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
                    <span className="text-gray-500">التقنية</span>
                    <span className="font-semibold text-gray-900 dark:text-white">Next.js 14</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
                    <span className="text-gray-500">التصميم</span>
                    <span className="font-semibold text-gray-900 dark:text-white">Tailwind CSS</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
                    <span className="text-gray-500">قاعدة البيانات</span>
                    <span className="font-semibold text-gray-900 dark:text-white">LocalStorage (مؤقت)</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
                    <span className="text-gray-500">اللغة</span>
                    <span className="font-semibold text-gray-900 dark:text-white">العربية فقط</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
                    <span className="text-gray-500">حالة Supabase</span>
                    <span className="font-semibold text-yellow-600 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      لم يتم الربط
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تغيير كلمة المرور</DialogTitle>
            <DialogDescription>أدخل كلمة المرور الحالية والجديدة</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>كلمة المرور الحالية</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>كلمة المرور الجديدة</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>تأكيد كلمة المرور</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1"
              />
            </div>
            {passwordMessage && (
              <p className="text-red-500 text-sm flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {passwordMessage}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>إلغاء</Button>
            <Button onClick={changePassword} className="bg-gradient-to-r from-red-500 to-rose-600">
              تغيير كلمة المرور
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Data Confirmation Dialog */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>⚠️ تأكيد حذف جميع البيانات</DialogTitle>
            <DialogDescription>
              هذا الإجراء لا يمكن التراجع عنه! سيتم حذف جميع البيانات نهائياً.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-4">
              <p className="text-sm text-red-700 dark:text-red-300">
                سيتم حذف: {dataStats.grades} صف، {dataStats.students} طالب، {dataStats.dues} استحقاق، 
                {dataStats.payments} دفعة، {dataStats.exams} اختبار، {dataStats.attendance} سجل حضور
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDialogOpen(false)}>إلغاء</Button>
            <Button 
              onClick={clearAllData}
              className="bg-red-500 hover:bg-red-600"
            >
              <Trash2 className="w-4 h-4" />
              <span>نعم، احذف كل شيء</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
