"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { 
  User, 
  Lock, 
  Mail, 
  Palette, 
  Database,
  Download,
  Upload,
  Trash2,
  Shield,
  CheckCircle,
  AlertCircle,
  CalendarCheck,
  Archive,
  FolderOpen,
  RotateCcw,
  MessageCircle,
  Loader2,
  XCircle,
  PenTool,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { GraduationCap, DoorOpen, UserCheck } from "lucide-react"
import {
  isRegistrationOpen,
  setRegistrationOpen,
  isAutoApproveRegistration,
  setAutoApproveRegistration,
  areStudentReportsEnabled,
  setStudentReportsEnabled,
} from "@/lib/student-accounts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import toast from "react-hot-toast"
import {
  getGrades,
  getStudents,
  getDues,
  getPayments,
  getExams,
  getSessions,
  getAttendance,
  getExamAttempts,
  saveGrades,
  saveStudents,
  saveDues,
  savePayments,
  saveExams,
  saveSessions,
  saveAttendance,
  saveExamAttempts,
  getAnnouncements,
  saveAnnouncements,
  getHonorees,
  saveHonorees,
  getSharedFiles,
  saveSharedFiles,
  getImportantLinks,
  saveImportantLinks,
  getStoredAcademicYear,
  saveAcademicYear,
  getCurrentAcademicYear,
  getNextAcademicYear,
  suggestNextAcademicYear,
  closeAcademicYear,
  getYearArchives,
  saveYearArchives,
  deleteYearArchive,
  restoreYearArchive,
  getSetting,
  saveSetting,
  YearArchive,
} from "@/lib/data-storage"
import {
  DEFAULT_TEACHER_NAME,
  DEFAULT_TEACHER_SIGNATURE_LINE,
  getTeacherName,
  getTeacherSignatureLine,
  setTeacherName,
  setTeacherSignatureLine,
} from "@/lib/branding"
import { clearAllRemote, pushAllToCloud, pullAllData, checkSupabaseConnection, forcePushAll, diagnoseSync, type ConnectionCheck, type SyncReport } from "@/lib/supabase/sync"
import { clearStore, purgeLegacyLocalStorage } from "@/lib/memory-store"

export default function SettingsPage() {
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [closeYearDialogOpen, setCloseYearDialogOpen] = useState(false)
  const [openYearDialogOpen, setOpenYearDialogOpen] = useState(false)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<YearArchive | null>(null)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [userEmail, setUserEmail] = useState("")

  const [academicYear, setAcademicYear] = useState<string>("")
  const [openYearValue, setOpenYearValue] = useState<string>("")
  const [archives, setArchives] = useState<YearArchive[]>([])

  // إعدادات توقيع المعلم في نهاية الاختبارات والشهادات
  const [signatureLineInput, setSignatureLineInput] = useState(DEFAULT_TEACHER_SIGNATURE_LINE)
  const [teacherNameInput, setTeacherNameInput] = useState(DEFAULT_TEACHER_NAME)

  const [dataStats, setDataStats] = useState({
    grades: 0,
    students: 0,
    dues: 0,
    payments: 0,
    exams: 0,
    sessions: 0,
    attendance: 0,
  })

  const [supabaseConnected, setSupabaseConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [checking, setChecking] = useState(false)
  const [conn, setConn] = useState<ConnectionCheck | null>(null)
  const [registrationOpen, setRegistrationOpenState] = useState(true)
  const [autoApprove, setAutoApproveState] = useState(false)
  const [reportsEnabled, setReportsEnabledState] = useState(true)
  // تابات الإعدادات: عام / بوابة الطلاب / البيانات والمزامنة / السنة الدراسية
  const [settingsTab, setSettingsTab] = useState<"general" | "portal" | "data" | "year">("general")

  // فحص حقيقي: كتابة ثم قراءة من Supabase + عدّ السجلات الفعلية داخل قاعدة البيانات
  const runConnectionCheck = async (silent = false) => {
    setChecking(true)
    const res = await checkSupabaseConnection()
    setConn(res)
    setChecking(false)
    if (!silent) {
      if (res.ok) toast.success(`الاتصال سليم — تم اختبار الكتابة والقراءة فعلياً (${res.latencyMs} ms)`)
      else toast.error(res.error ? `فشل الفحص: ${res.error}` : "فشل الفحص — البيانات لا تُحفظ في قاعدة البيانات")
    }
    return res
  }

  // بيانات التواصل (رقم واتساب في الصفحة الرئيسية)
  const [whatsappInput, setWhatsappInput] = useState("")

  // حفظ رقم واتساب التواصل
  const saveWhatsapp = () => {
    const digits = whatsappInput.replace(/[^\d+\- ]/g, "").trim()
    if (!digits) {
      saveSetting("whatsappNumber", "")
      toast.success("تم إخفاء زر الواتساب من الصفحة الرئيسية")
      setWhatsappInput("")
      return
    }
    saveSetting("whatsappNumber", digits)
    toast.success("تم حفظ رقم الواتساب — سيظهر في أسفل الصفحة الرئيسية")
  }

  // حفظ التوقيع المخصص للمعلم
  const saveTeacherSignature = () => {
    const line = signatureLineInput.trim() || DEFAULT_TEACHER_SIGNATURE_LINE
    const name = teacherNameInput.trim() || DEFAULT_TEACHER_NAME
    setTeacherSignatureLine(line)
    setTeacherName(name)
    setSignatureLineInput(line)
    setTeacherNameInput(name)
    toast.success("تم حفظ توقيع المعلم بنجاح — سيظهر في جميع الاختبارات والشهادات")
  }

  // استعادة التوقيع الافتراضي
  const resetTeacherSignature = () => {
    setTeacherSignatureLine(DEFAULT_TEACHER_SIGNATURE_LINE)
    setTeacherName(DEFAULT_TEACHER_NAME)
    setSignatureLineInput(DEFAULT_TEACHER_SIGNATURE_LINE)
    setTeacherNameInput(DEFAULT_TEACHER_NAME)
    toast.success("تم استعادة التوقيع الافتراضي")
  }

  // مزامنة يدوية مع Supabase
  const handleManualSync = async () => {
    setSyncing(true)
    const { ok } = await pullAllData()
    setSyncing(false)
    if (ok) {
      toast.success("تمت المزامنة مع Supabase بنجاح — هذه أحدث نسخة من البيانات")
      refreshData()
    } else {
      toast.error("تعذر الاتصال بـ Supabase. تأكد من المتغيرات البيئية واتصال الإنترنت.")
    }
  }

  // تشخيص دقيق: يحدد أي سجل يفشل ولماذا
  const [report, setReport] = useState<SyncReport | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)

  const handleDiagnose = async () => {
    setDiagnosing(true)
    setReport(null)
    try {
      const res = await diagnoseSync()
      setReport(res)
      const failed = res.tables.reduce((n, t) => n + t.failures.length, 0)
      if (failed === 0) toast.success("التشخيص: لا توجد أخطاء — كل البيانات محفوظة")
      else toast.error(`التشخيص: ${failed} سجل فشل — التفاصيل بالأسفل`)
      await runConnectionCheck(true)
      refreshData()
    } catch (e: any) {
      toast.error(`تعذر إجراء التشخيص: ${e?.message || e}`)
    }
    setDiagnosing(false)
  }

  // رفع بيانات الجهاز إلى Supabase بالترتيب الصحيح (حل أخطاء 409)
  const handleForcePush = async () => {
    setSyncing(true)
    const res = await forcePushAll()
    if (res.ok) {
      toast.success("تم رفع كل بياناتك إلى قاعدة البيانات بنجاح")
      await runConnectionCheck(true)
    } else {
      toast.error(res.error || "تعذر رفع البيانات")
    }
    setSyncing(false)
  }

  // يُنشأ عميل Supabase داخل المتصفح فقط (داخل التأثيرات/المعالجات)،
  // لتفادي تعطُّل البناء (prerender) عند عدم وجود متغيرات البيئة.
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const getSupabase = () => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient()
    }
    return supabaseRef.current
  }

  const refreshData = () => {
    setDataStats({
      grades: getGrades().length,
      students: getStudents().length,
      dues: getDues().length,
      payments: getPayments().length,
      exams: getExams().length,
      sessions: getSessions().length,
      attendance: getAttendance().length,
    })
    setAcademicYear(getStoredAcademicYear())
    setArchives([...getYearArchives()].sort((a, b) => b.academicYear.localeCompare(a.academicYear)))
  }

  useEffect(() => {
    refreshData()
    setSupabaseConnected(isSupabaseConfigured())
    if (isSupabaseConfigured()) runConnectionCheck(true)
    setRegistrationOpenState(isRegistrationOpen())
    setAutoApproveState(isAutoApproveRegistration())
    setReportsEnabledState(areStudentReportsEnabled())
    setWhatsappInput(getSetting("whatsappNumber"))
    setSignatureLineInput(getTeacherSignatureLine())
    setTeacherNameInput(getTeacherName())

    // Get user email from Supabase
    if (isSupabaseConfigured()) {
      const getUser = async () => {
        const supabase = getSupabase()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.email) {
          setUserEmail(session.user.email)
        }
      }
      getUser()
    }
  }, [])

  // Change password
  const changePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("كلمة المرور الجديدة غير متطابقة")
      return
    }
    
    // Note: Supabase password update requires re-authentication
    // For now, we'll show a message directing users to use the forgot password flow
    toast.success("لتغيير كلمة المرور، استخدم خيار 'نسيت كلمة المرور' من صفحة تسجيل الدخول")
    setPasswordDialogOpen(false)
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
  }

  // ============ إدارة العام الدراسي ============

  const currentComputedYear = getCurrentAcademicYear()

  // تعيين السنة الدراسية المخزنة إلى السنة الحالية محسوباً من التاريخ
  const setToCurrentYear = () => {
    if (currentComputedYear === academicYear) {
      toast.success("السنة الحالية هي المختارة بالفعل")
      return
    }
    saveAcademicYear(currentComputedYear)
    setAcademicYear(currentComputedYear)
    toast.success(`تم تعيين السنة الدراسية إلى ${currentComputedYear}`)
  }

  // فتح سنة دراسية جديدة
  const openNewYearDialog = () => {
    setOpenYearValue(suggestNextAcademicYear(academicYear))
    setOpenYearDialogOpen(true)
  }

  const confirmOpenYear = () => {
    const year = openYearValue.trim()
    if (!/^\d{4}-\d{4}$/.test(year)) {
      toast.error("أدخل السنة بصيغة صحيحة مثل 2026-2027")
      return
    }
    saveAcademicYear(year)
    setAcademicYear(year)
    setOpenYearDialogOpen(false)
    toast.success(`تم فتح السنة الدراسية ${year} — يمكنك الآن إضافة الصفوف والطلاب`)
  }

  // إغلاق السنة الدراسية الحالية (أرشفة + بدء من جديد)
  const confirmCloseYear = () => {
    const year = academicYear
    const archive = closeAcademicYear(year)
    setCloseYearDialogOpen(false)
    refreshData()
    toast.success(
      `تم إغلاق السنة الدراسية ${year} وأرشفة جميع بياناتها (${archive.stats.students} طالب، ${archive.stats.groups} مجموعة). يمكنك الآن البدء من جديد.`
    )
  }

  // استعادة سنة مغلقة
  const askRestore = (archive: YearArchive) => {
    setRestoreTarget(archive)
    setRestoreDialogOpen(true)
  }

  const confirmRestore = () => {
    if (!restoreTarget) return
    const ok = restoreYearArchive(restoreTarget.academicYear)
    if (ok) {
      refreshData()
      setRestoreDialogOpen(false)
      toast.success(`تمت استعادة بيانات السنة ${restoreTarget.academicYear} (تم استبدال البيانات الحالية)`)
    } else {
      toast.error("تعذر استعادة البيانات")
    }
  }

  const removeArchive = (year: string) => {
    if (!confirm(`هل أنت متأكد من حذف أرشيف السنة ${year} نهائياً؟ لا يمكن التراجع.`)) return
    deleteYearArchive(year)
    refreshData()
    toast.success(`تم حذف أرشيف السنة ${year}`)
  }

  // تصدير أرشيف سنة معينة
  const exportArchive = (archive: YearArchive) => {
    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `archive-${archive.academicYear}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("تم تصدير أرشيف السنة")
  }

  // ============ النسخ الاحتياطي ============

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
      examAttempts: getExamAttempts(),
      announcements: getAnnouncements(),
      honorees: getHonorees(),
      sharedFiles: getSharedFiles(),
      importantLinks: getImportantLinks(),
      currentAcademicYear: getStoredAcademicYear(),
      yearArchives: getYearArchives(),
      exportedAt: new Date().toISOString(),
      version: "1.1.0",
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("تم تصدير البيانات بنجاح")
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
        if (data.examAttempts) saveExamAttempts(data.examAttempts)
        if (data.announcements) saveAnnouncements(data.announcements)
        if (data.honorees) saveHonorees(data.honorees)
        if (data.sharedFiles) saveSharedFiles(data.sharedFiles)
        if (data.importantLinks) saveImportantLinks(data.importantLinks)
        if (data.currentAcademicYear) saveAcademicYear(data.currentAcademicYear)
        if (data.yearArchives) saveYearArchives(data.yearArchives)

        // رفع البيانات المستوردة إلى Supabase (المصدر الحقيقي)
        ;(async () => {
          try {
            if (isSupabaseConfigured()) await pushAllToCloud()
          } catch (e) {
            console.warn("remote sync after import failed", e)
            toast.error("تمت القراءة في الذاكرة، لكن تعذر رفعه إلى Supabase — أعد المحاولة (لا يُحفظ أي شيء على الجهاز)")
          }
        })()

        toast.success("تم استيراد البيانات ورفعها إلى Supabase! سيتم تحديث الصفحة.")
        setTimeout(() => window.location.reload(), 1000)
      } catch (err) {
        toast.error("خطأ في قراءة الملف. تأكد من أنه ملف نسخة احتياطية صحيحة.")
      }
    }
    reader.readAsText(file)
  }

  // حذف كل البيانات من Supabase + مسح ذاكرة الجلسة (لا تخزين محلي أصلاً)
  const clearAllData = async () => {
    try {
      if (isSupabaseConfigured()) await clearAllRemote()
    } catch (e) {
      console.warn("remote clear failed", e)
      toast.error("تعذر حذف بيانات Supabase — تحقق من الاتصال ثم أعد المحاولة")
      return
    }
    clearStore()
    purgeLegacyLocalStorage()
    toast.success("تم حذف جميع البيانات من Supabase ومسح ذاكرة الجلسة. سيتم تحديث الصفحة.")
    setTimeout(() => window.location.reload(), 1000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          الإعدادات
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          كل إعدادات الموقع في مكان واحد — مقسمة لتبويبات لسهولة الوصول
        </p>
      </motion.div>

      {/* شريط التبويبات */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: "general" as const, label: "الحساب والتخصيص", icon: User },
          { key: "portal" as const, label: "بوابة الطلاب", icon: GraduationCap },
          { key: "data" as const, label: "البيانات والمزامنة", icon: Database },
          { key: "year" as const, label: "السنة الدراسية", icon: CalendarCheck },
        ]).map(({ key, label, icon: TabIcon }) => (
          <button
            key={key}
            onClick={() => setSettingsTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              settingsTab === key
                ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg"
                : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            <TabIcon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ============ السنة الدراسية ============ */}
      {settingsTab === "year" && (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-lg p-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shrink-0">
              <CalendarCheck className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">السنة الدراسية</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                السنة الحالية:{" "}
                <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 font-bold text-base mr-1">
                  {academicYear}
                </Badge>
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 leading-relaxed max-w-xl">
                عند إغلاق السنة الدراسية يتم أرشفة جميع بياناتها (الصفوف، المجموعات، الطلاب،
                التحصيل، الاختبارات، الحضور) ويمكن استعادتها في أي وقت من الأرشيف، ثم تبدأ من جديد.
                السنة الحالية محسوبة تلقائياً من التاريخ ({currentComputedYear}).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={setToCurrentYear}
              className="border-indigo-500 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950"
            >
              <CheckCircle className="w-4 h-4" />
              <span>تعيين السنة الحالية ({currentComputedYear})</span>
            </Button>
            <Button
              variant="outline"
              onClick={openNewYearDialog}
              className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
            >
              <FolderOpen className="w-4 h-4" />
              <span>فتح سنة دراسية جديدة</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setCloseYearDialogOpen(true)}
              className="border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <Archive className="w-4 h-4" />
              <span>إغلاق السنة الحالية</span>
            </Button>
          </div>
        </div>

        {/* أرشيف السنوات المغلقة */}
        {archives.length > 0 && (
          <div className="mt-6 border-t border-gray-200 dark:border-gray-800 pt-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Archive className="w-5 h-5 text-gray-400" />
              سنوات دراسية مغلقة (أرشيف)
            </h3>
            <div className="space-y-3">
              {archives.map(archive => (
                <div
                  key={archive.academicYear}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700"
                >
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">
                      {archive.academicYear}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      أُغلقت في {new Date(archive.closedAt).toLocaleDateString("ar-EG", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                      {" • "}
                      {archive.stats.grades} صف • {archive.stats.groups} مجموعة • {archive.stats.students} طالب
                      {" • "}
                      {archive.stats.payments} دفعة • {archive.stats.exams} اختبار
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => askRestore(archive)}
                      className="border-indigo-500 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>استعادة</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportArchive(archive)}
                      className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                    >
                      <Download className="w-4 h-4" />
                      <span>تصدير</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeArchive(archive.academicYear)}
                      className="border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>حذف</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
      )}

      {/* ============ توقيع المعلم في الاختبارات والشهادات ============ */}
      {settingsTab === "general" && (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
      >
        <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
                <PenTool className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl">توقيع المعلم في أسفل الاختبارات والشهادات</CardTitle>
                <p className="text-sm text-gray-500">
                  تخصيص عبارة التمني واسم المعلم ليظهر في نهاية ورقة الامتحان وأسفل لوحة الشرف
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* الحقل الأول: جملة التمني */}
              <div className="space-y-2">
                <Label className="font-semibold text-gray-800 dark:text-gray-200">
                  السطر الأول (جملة التمني والتوفيق)
                </Label>
                <Input
                  placeholder="مع تمنياتي لكم بالتوفيق والنجاح"
                  value={signatureLineInput}
                  onChange={(e) => setSignatureLineInput(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500">
                  تظهر باللون الداكن فوق اسم المعلم في ذيل ورقة الامتحان.
                </p>
              </div>

              {/* الحقل الثاني: اسم المعلم */}
              <div className="space-y-2">
                <Label className="font-semibold text-indigo-700 dark:text-indigo-300">
                  السطر الثاني (اسم المعلم / اللقب)
                </Label>
                <Input
                  placeholder="أ/ ضحى العربي"
                  value={teacherNameInput}
                  onChange={(e) => setTeacherNameInput(e.target.value)}
                  className="mt-1 border-indigo-200 dark:border-indigo-800 font-bold"
                />
                <p className="text-xs text-gray-500">
                  يظهر باللون الأزرق النيلي العريض والواضح في السطر الثاني.
                </p>
              </div>
            </div>

            {/* معاينة حية للتوقيع */}
            <div className="p-5 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 text-center">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                معاينة شكل التوقيع في ذيل ورقة الامتحان:
              </p>
              <div className="inline-block py-2 px-6 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xs">
                <p className="text-[11px] opacity-70 mb-1 text-gray-500">انتهت الأسئلة</p>
                <p className="text-base font-semibold text-gray-800 dark:text-gray-200">
                  {signatureLineInput || DEFAULT_TEACHER_SIGNATURE_LINE}
                </p>
                <p className="text-lg font-extrabold mt-0.5 text-indigo-700 dark:text-indigo-300">
                  {teacherNameInput || DEFAULT_TEACHER_NAME}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={resetTeacherSignature}
                className="border-gray-300 dark:border-gray-700"
              >
                <RotateCcw className="w-4 h-4" />
                <span>استعادة الافتراضي</span>
              </Button>
              <Button
                onClick={saveTeacherSignature}
                className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white"
              >
                <CheckCircle className="w-4 h-4" />
                <span>حفظ التوقيع</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Settings */}
        {settingsTab === "general" && (
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
                <Label>البريد الإلكتروني</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input value={userEmail} disabled className="bg-gray-50" dir="ltr" />
                  <Mail className="w-5 h-5 text-gray-400 shrink-0" />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  البريد الإلكتروني هو اسم المستخدم الخاص بك
                </p>
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
        )}

        {/* بوابة الطلاب */}
        {settingsTab === "portal" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-600 flex items-center justify-center shadow-lg">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl">بوابة الطلاب</CardTitle>
                  <p className="text-sm text-gray-500">التحكم في تسجيل الطلاب وتقاريرهم — رابط التسجيل: /student/register</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="flex items-start gap-3">
                  <DoorOpen className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">فتح باب التسجيل</p>
                    <p className="text-sm text-gray-500">عند الإغلاق لا يستطيع طالب جديد إرسال طلب انضمام (الحسابات المعتمدة تظل تعمل)</p>
                  </div>
                </div>
                <Switch
                  checked={registrationOpen}
                  onCheckedChange={v => { setRegistrationOpenState(v); setRegistrationOpen(v); toast.success(v ? "تم فتح باب التسجيل" : "تم إغلاق باب التسجيل") }}
                />
              </div>
              <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="flex items-start gap-3">
                  <UserCheck className="w-5 h-5 text-sky-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">التفعيل المباشر (بدون موافقة)</p>
                    <p className="text-sm text-gray-500">عند التفعيل، أي طالب يسجّل يُفعَّل حسابه فوراً ويستطيع دخول بوابته مباشرة بدون انتظار موافقتك. عند الإيقاف يرجع لانتظار موافقتك في «الطلبات».</p>
                  </div>
                </div>
                <Switch
                  checked={autoApprove}
                  onCheckedChange={v => { setAutoApproveState(v); setAutoApproveRegistration(v); toast.success(v ? "تم تفعيل التسجيل المباشر — الطلاب يدخلون فوراً" : "تم إيقاف التسجيل المباشر — الطلاب ينتظرون موافقتك") }}
                />
              </div>
              <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="flex items-start gap-3">
                  <GraduationCap className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">تفعيل تقارير الطلاب</p>
                    <p className="text-sm text-gray-500">عند الإيقاف لا يستطيع الطالب طباعة أو تصدير تقريره المفصل من بوابته</p>
                  </div>
                </div>
                <Switch
                  checked={reportsEnabled}
                  onCheckedChange={v => { setReportsEnabledState(v); setStudentReportsEnabled(v); toast.success(v ? "تم تفعيل تقارير الطلاب" : "تم إيقاف تقارير الطلاب") }}
                />
              </div>
              <p className="text-xs text-gray-400 px-1">
                مراجعة طلبات التسجيل والنقل من صفحة «الطلاب ← الطلبات». إدارة كل طالب (حظر/حذف/نقل) من صفحة الطلاب.
              </p>
            </CardContent>
          </Card>
        </motion.div>
        )}

        {/* Appearance */}
        {settingsTab === "general" && (
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
        )}

        {/* Contact Info */}
        {settingsTab === "general" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#25D366] flex items-center justify-center shadow-lg">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl">بيانات التواصل</CardTitle>
                  <p className="text-sm text-gray-500">تظهر في نهاية الصفحة الرئيسية للزوار</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>رقم واتساب التواصل</Label>
                <Input
                  dir="ltr"
                  placeholder="01012345678"
                  value={whatsappInput}
                  onChange={e => setWhatsappInput(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  يظهر كزر واتساب أخضر أسفل الصفحة الرئيسية، ويُحفظ في Supabase فتظهر
                  للطلاب من أي جهاز. اترك الحقل فارغاً لإخفاء الزر.
                </p>
              </div>
              <Button
                onClick={saveWhatsapp}
                className="w-full bg-[#25D366] hover:bg-[#1ebe5b] text-white"
              >
                <MessageCircle className="w-4 h-4" />
                <span>حفظ رقم الواتساب</span>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
        )}

        {/* Data Management */}
        {settingsTab === "data" && (
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
                  { label: "أيام الحضور", value: dataStats.sessions, color: "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300" },
                  { label: "سجلات الحضور", value: dataStats.attendance, color: "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300" },
                  { label: "السنوات المغلقة", value: archives.length, color: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300" },
                ].map((stat) => (
                  <div key={stat.label} className={`${stat.color} rounded-lg p-3 text-center`}>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* التحقق من الحفظ في قاعدة البيانات */}
              {supabaseConnected && (
                <div className={`rounded-xl border p-4 space-y-3 ${
                  conn && !conn.ok
                    ? "border-red-300 bg-red-50 dark:bg-red-950/20"
                    : "border-green-300 bg-green-50 dark:bg-green-950/20"
                }`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {checking || !conn ? (
                        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                      ) : conn.ok ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          التحقق من الحفظ في قاعدة البيانات
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {checking || !conn
                            ? "جاري اختبار الكتابة والقراءة على Supabase..."
                            : conn.ok
                            ? `تم اختبار كتابة سجل حقيقي وقراءته من Supabase بنجاح (${conn.latencyMs} ms)`
                            : conn.error || "تعذّر الكتابة أو القراءة على Supabase — لا يُحفظ أي بيان حتى يعود الاتصال"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleForcePush} disabled={syncing || checking}>
                        <Upload className={`w-4 h-4 ${syncing ? "animate-pulse" : ""}`} />
                        <span>رفع بياناتي الآن</span>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => runConnectionCheck()} disabled={checking}>
                        <RotateCcw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
                        <span>إعادة الفحص</span>
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleDiagnose}
                        disabled={diagnosing}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        <Shield className={`w-4 h-4 ${diagnosing ? "animate-pulse" : ""}`} />
                        <span>{diagnosing ? "جاري التشخيص..." : "تشخيص دقيق"}</span>
                      </Button>
                    </div>
                  </div>

                  {conn && !conn.ok && /permission denied|صلاحيات|مخطط|uuid|عمود/i.test(conn.error || "") && (
                    <div className="rounded-lg bg-white dark:bg-gray-900 border border-red-300 dark:border-red-800 p-4 text-sm space-y-2">
                      <p className="font-bold text-red-700 dark:text-red-400">
                        كيف تُصلح هذا الخطأ (دقيقة واحدة):
                      </p>
                      <ol className="list-decimal pr-5 space-y-1 text-gray-700 dark:text-gray-300">
                        <li>افتح لوحة تحكم Supabase الخاصة بمشروعك.</li>
                        <li>من القائمة الجانبية اختر <span className="font-semibold">SQL Editor</span> ثم <span className="font-semibold">New query</span>.</li>
                        <li>
                          الصق محتوى الملف{" "}
                          <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs">
                            {/uuid|مخطط|عمود/i.test(conn.error || "")
                              ? "supabase/migrations/005_fix_id_types.sql"
                              : "supabase/migrations/004_fix_permissions.sql"}
                          </code>{" "}
                          الموجود في المشروع.
                        </li>
                        <li>اضغط <span className="font-semibold">Run</span>.</li>
                        <li>ارجع هنا واضغط <span className="font-semibold">إعادة الفحص</span>.</li>
                      </ol>
                      <p className="text-xs text-gray-500">
                        هذا الملف يمنح صلاحيات الجداول لأدوار Supabase فقط — لا يمسح ولا يعدّل أي بيانات.
                      </p>
                    </div>
                  )}

                  {report && (
                    <div className="rounded-lg bg-white dark:bg-gray-900 border border-indigo-300 dark:border-indigo-800 p-4 space-y-3 text-sm">
                      <p className="font-bold text-indigo-700 dark:text-indigo-400">نتيجة التشخيص الدقيق</p>

                      <div className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                        <p>
                          الجلسة:{" "}
                          {report.authenticated ? (
                            <span className="text-green-600 font-semibold">
                              مسجّل الدخول ({report.userEmail}) — الدور: {report.role}
                            </span>
                          ) : (
                            <span className="text-red-600 font-semibold">
                              غير مسجّل — الكتابة سترفض
                            </span>
                          )}
                        </p>
                      </div>

                      <ul className="space-y-1">
                        {report.summary.map((line, i) => (
                          <li key={i} className="text-gray-800 dark:text-gray-200 break-words">
                            {line}
                          </li>
                        ))}
                      </ul>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="text-right py-1">الجدول</th>
                              <th className="text-center py-1">في الذاكرة</th>
                              <th className="text-center py-1">نجح رفعه</th>
                              <th className="text-center py-1">في القاعدة</th>
                              <th className="text-center py-1">فشل</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.tables.map((t) => (
                              <tr key={t.table} className="border-t border-gray-200/60 dark:border-gray-800">
                                <td className="py-1 font-medium">{t.table}</td>
                                <td className="py-1 text-center">{t.memoryCount}</td>
                                <td className="py-1 text-center text-green-600">{t.pushed}</td>
                                <td className="py-1 text-center font-semibold">{t.remoteCount}</td>
                                <td className={`py-1 text-center ${t.failures.length ? "text-red-600 font-bold" : "text-gray-400"}`}>
                                  {t.failures.length}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {report.tables.some((t) => t.failures.length > 0) && (
                        <div className="space-y-2">
                          <p className="font-semibold text-red-700 dark:text-red-400">السجلات الفاشلة:</p>
                          {report.tables.flatMap((t) =>
                            t.failures.map((f, i) => (
                              <div
                                key={`${t.table}-${f.id}-${i}`}
                                className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded p-2 text-xs"
                              >
                                <p className="font-bold text-red-800 dark:text-red-300">
                                  [{t.table}] {f.label}
                                </p>
                                <p className="text-gray-700 dark:text-gray-300 break-words mt-0.5">
                                  {f.code ? `(${f.code}) ` : ""}
                                  {f.message}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {conn?.ok && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 text-xs">
                            <th className="text-right py-1">الجدول</th>
                            <th className="text-center py-1">في هذا الجهاز</th>
                            <th className="text-center py-1">داخل قاعدة البيانات</th>
                            <th className="text-center py-1">الحالة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {([
                            ["الصفوف", "grades", dataStats.grades],
                            ["الطلاب", "students", dataStats.students],
                            ["الاستحقاقات", "dues", dataStats.dues],
                            ["المدفوعات", "payments", dataStats.payments],
                            ["الاختبارات", "exams", dataStats.exams],
                            ["أيام الحضور", "sessions", dataStats.sessions],
                            ["الحضور", "attendance", dataStats.attendance],
                          ] as [string, string, number][]).map(([label, table, memoryCount]) => {
                            const remote = conn.counts[table] ?? 0
                            const match = remote === memoryCount
                            return (
                              <tr key={table} className="border-t border-gray-200/60 dark:border-gray-800">
                                <td className="py-1 font-medium text-gray-800 dark:text-gray-200">{label}</td>
                                <td className="py-1 text-center">{memoryCount}</td>
                                <td className="py-1 text-center font-semibold">{remote < 0 ? "—" : remote}</td>
                                <td className="py-1 text-center">
                                  {match ? (
                                    <span className="text-green-600 text-xs">متطابق ✓</span>
                                  ) : (
                                    <span className="text-amber-600 text-xs">غير متطابق</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      <p className="text-xs text-gray-500 mt-2">
                        إذا ظهر أي صف &quot;غير متطابق&quot; اضغط &quot;مزامنة الآن مع Supabase&quot; لجلب أحدث نسخة، أو أعد الحفظ من الصفحة المعنية.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {supabaseConnected && (
                  <Button
                    variant="outline"
                    onClick={handleManualSync}
                    disabled={syncing}
                    className="border-indigo-500 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                  >
                    {syncing ? (
                      <RotateCcw className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    <span>{syncing ? "جاري المزامنة..." : "مزامنة الآن مع Supabase"}</span>
                  </Button>
                )}
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
        )}

        {/* System Info */}
        {settingsTab === "data" && (
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
                    <span className="font-semibold text-gray-900 dark:text-white">1.1.0</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
                    <span className="text-gray-500">التقنية</span>
                    <span className="font-semibold text-gray-900 dark:text-white">Next.js</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
                    <span className="text-gray-500">التصميم</span>
                    <span className="font-semibold text-gray-900 dark:text-white">Tailwind CSS</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
                    <span className="text-gray-500">قاعدة البيانات</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {supabaseConnected ? "Supabase (PostgreSQL)" : "غير متصل — لا حفظ للبيانات"}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
                    <span className="text-gray-500">حالة Supabase</span>
                    {!supabaseConnected ? (
                      <span className="font-semibold text-yellow-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        غير متصل — لا يُحفظ أي بيان
                      </span>
                    ) : checking || !conn ? (
                      <span className="font-semibold text-gray-500 flex items-center gap-1">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        جاري فحص الاتصال...
                      </span>
                    ) : conn.ok ? (
                      <span className="font-semibold text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        متصل ومُختبَر فعلياً (كتابة + قراءة)
                      </span>
                    ) : (
                      <span className="font-semibold text-red-600 flex items-center gap-1">
                        <XCircle className="w-4 h-4" />
                        فشل الحفظ في قاعدة البيانات
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
                    <span className="text-gray-500">اللغة</span>
                    <span className="font-semibold text-gray-900 dark:text-white">العربية فقط</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
                    <span className="text-gray-500">السنة الدراسية الحالية</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{academicYear}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        )}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>إلغاء</Button>
            <Button onClick={changePassword} className="bg-gradient-to-r from-red-500 to-rose-600">
              تغيير كلمة المرور
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Year Confirmation Dialog */}
      <Dialog open={closeYearDialogOpen} onOpenChange={setCloseYearDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>⚠️ إغلاق السنة الدراسية {academicYear}</DialogTitle>
            <DialogDescription>
              سيتم أرشفة جميع بيانات هذه السنة والبدء من جديد
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-4">
              <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">
                سيتم نقل جميع بيانات السنة الحالية إلى الأرشيف:
              </p>
              <ul className="text-sm text-red-700 dark:text-red-300 mt-2 space-y-1 list-disc pr-5">
                <li>{dataStats.grades} صف مع {getGrades().reduce((s, g) => s + g.groups.length, 0)} مجموعة</li>
                <li>{dataStats.students} طالب</li>
                <li>{dataStats.dues} استحقاق و {dataStats.payments} دفعة</li>
                <li>{dataStats.exams} اختبار و {dataStats.attendance} سجل حضور</li>
              </ul>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  البيانات المؤرشفة يمكن استعادتها في أي وقت من قسم "سنوات دراسية مغلقة"، كما يمكنك
                  تصديرها كملف. الإعلانات ولوحة الشرف والملفات لا تتأثر.
                </span>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseYearDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={confirmCloseYear}
              className="bg-red-500 hover:bg-red-600"
            >
              <Archive className="w-4 h-4" />
              <span>نعم، أغلق السنة وأرشف البيانات</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Open New Year Dialog */}
      <Dialog open={openYearDialogOpen} onOpenChange={setOpenYearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>فتح سنة دراسية جديدة</DialogTitle>
            <DialogDescription>
              حدد السنة الدراسية الجديدة (ستُستخدم تلقائياً عند إنشاء الصفوف والاختبارات)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>السنة الدراسية الجديدة</Label>
              <Input
                placeholder="مثال: 2026-2027"
                value={openYearValue}
                onChange={(e) => setOpenYearValue(e.target.value)}
                className="mt-1 font-bold text-center text-lg"
              />
              <p className="text-xs text-gray-500 mt-2">
                السنة التالية لـ {academicYear} هي {getNextAcademicYear(academicYear)}، والسنة الحالية
                محسوبة من التاريخ هي {currentComputedYear}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenYearDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={confirmOpenYear}
              className="bg-gradient-to-r from-green-500 to-emerald-600"
            >
              <FolderOpen className="w-4 h-4" />
              <span>فتح السنة الدراسية</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Year Confirmation Dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>استعادة بيانات {restoreTarget?.academicYear}</DialogTitle>
            <DialogDescription>
              سيتم استبدال البيانات النشطة الحالية ببيانات السنة المؤرشفة
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                ⚠️ أي بيانات موجودة حالياً (سنة {academicYear}) سيتم استبدالها ببيانات السنة{" "}
                {restoreTarget?.academicYear}. يُنصح بتصدير نسخة احتياطية من البيانات الحالية قبل
                الاستعادة.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={confirmRestore}
              className="bg-gradient-to-r from-indigo-500 to-purple-600"
            >
              <RotateCcw className="w-4 h-4" />
              <span>استعادة البيانات</span>
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
                {dataStats.payments} دفعة، {dataStats.exams} اختبار، {dataStats.attendance} سجل حضور،
                وكل الأرشيف والإعلانات
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
