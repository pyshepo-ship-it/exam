"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import toast from "react-hot-toast"
import {
  GraduationCap,
  LogOut,
  Printer,
  BarChart3,
  Trophy,
  Megaphone,
  PlayCircle,
  MessageCircleQuestion,
  FileText,
  DollarSign,
  CalendarCheck,
  History,
  Clock,
  Lock,
  Send,
  Home,
  Loader2,
  CloudOff,
  RefreshCw,
  ArrowLeftRight,
  Medal,
  CalendarClock,
  CheckCircle2,
  XCircle,
  Hourglass,
  Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getPortalSession,
  portalLogout,
  requestGroupTransfer,
  areStudentReportsEnabled,
} from "@/lib/student-accounts"
import { sendStudentInquiry } from "@/lib/inquiries"
import {
  examAvailability,
  isExamForStudent,
  attemptsStatus,
  effectiveAttemptScore,
  markAnnouncementsSeen,
  lastAnnouncementsSeenAt,
} from "@/lib/portal-content"
import {
  fetchAttemptCount,
  fetchStudentPortalData,
  fetchStudentInquiries,
} from "@/lib/supabase/sync"
import type { Announcement, Exam, InquiryThread, Honoree } from "@/lib/data-storage"
import { ExamReviewDialog } from "@/components/exam-review-dialog"
import {
  reportFromPortalData,
  buildStudentReportPagesHtml,
  STUDENT_REPORT_LABELS,
  type StudentReport,
  type StudentReportType,
} from "@/lib/student-report"
import { HtmlPrintDialog } from "@/components/html-print-dialog"
import { formatTime12 } from "@/lib/utils"

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]

const money = (n: number) => `${Number(n || 0).toLocaleString("ar-EG")} ج.م`

type SectionKey = "honor" | "announcements" | "exams" | "reports" | "inquiries"

const SECTIONS: { key: SectionKey; label: string; icon: React.ElementType }[] = [
  { key: "honor", label: "لوحة الشرف", icon: Trophy },
  { key: "announcements", label: "الإعلانات والمواعيد", icon: Megaphone },
  { key: "exams", label: "اختباراتي", icon: PlayCircle },
  { key: "reports", label: "تقاريري", icon: BarChart3 },
  { key: "inquiries", label: "الاستفسارات والطلبات", icon: MessageCircleQuestion },
]

const HONOR_MEDALS = ["🥇", "🥈", "🥉"]

export default function StudentPortalPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [session, setSession] = useState<ReturnType<typeof getPortalSession>>(null)
  const [report, setReport] = useState<StudentReport | null>(null)
  const [gradeHonorees, setGradeHonorees] = useState<Honoree[]>([])
  const [gradeGroups, setGradeGroups] = useState<{ id: string; name: string; days: string[]; startTime: string; endTime: string }[]>([])
  const [myTransferRequests, setMyTransferRequests] = useState<{ id: string; toGroupId?: string; status: string; reviewNote?: string }[]>([])
  const [section, setSection] = useState<SectionKey>("honor")
  const [tab, setTab] = useState<StudentReportType>("comprehensive")
  const [printOpen, setPrintOpen] = useState(false)
  const [printMonth, setPrintMonth] = useState("")
  const [reportsEnabled, setReportsEnabled] = useState(true)
  const [transferTarget, setTransferTarget] = useState("")
  const [transferBusy, setTransferBusy] = useState(false)
  const [portalAnnouncements, setPortalAnnouncements] = useState<Announcement[]>([])
  const [portalExams, setPortalExams] = useState<Exam[]>([])
  const [inquiries, setInquiries] = useState<InquiryThread[]>([])
  // عدّادات المحاولات السحابية (عبر الأجهزة) لاختبارات ذات حد
  const [remoteAttempts, setRemoteAttempts] = useState<Record<string, number>>({})
  // مراجعة اختبار (بعد أن يفتحها المعلم للجميع)
  const [reviewExam, setReviewExam] = useState<Exam | null>(null)
  const [inquiryText, setInquiryText] = useState("")
  const [inquiryBusy, setInquiryBusy] = useState(false)

  // ===== التحميل: من Supabase مباشرة — المصدر الوحيد للحقيقة =====
  // لا اعتماد على تخزين محلي للبيانات: إن فشل الاتصال يُخبَر الطالب بوضوح
  const load = async () => {
    const s = getPortalSession()
    if (!s) {
      router.replace("/student/login")
      return
    }
    setSession(s)
    setReportsEnabled(areStudentReportsEnabled())
    setLoadError("")

    const portalData = await fetchStudentPortalData(s.studentId)
    if (!portalData) {
      setLoadError("تعذر الاتصال بقاعدة البيانات — تحقق من اتصالك بالإنترنت ثم أعد المحاولة")
      setMounted(true)
      return
    }

    setReport(reportFromPortalData(portalData))
    setGradeHonorees(portalData.gradeHonorees || [])
    setGradeGroups(portalData.gradeGroups || [])
    setMyTransferRequests(portalData.transferRequests || [])
    setPortalAnnouncements(portalData.announcements as Announcement[])
    setPortalExams((portalData.exams as Exam[]).filter(e => isExamForStudent(e, portalData.student.gradeId, portalData.student.groupId)))

    // محاولاتي المسجلة سحابياً للاختبارات محدودة المحاولات
    const counts: Record<string, number> = {}
    for (const e of (portalData.exams as Exam[]).filter(x => x.maxAttempts && x.maxAttempts > 0)) {
      const c = await fetchAttemptCount(e.id, portalData.student.id).catch(() => null)
      if (typeof c === "number") counts[e.id] = c
    }
    setRemoteAttempts(counts)

    const inq = await fetchStudentInquiries(s.studentId)
    setInquiries(inq as any)
    markAnnouncementsSeen()
    setMounted(true)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const handleLogout = () => {
    portalLogout()
    router.replace("/student/login")
  }

  const handleTransferRequest = async () => {
    if (!session || !transferTarget) return
    setTransferBusy(true)
    const res = await requestGroupTransfer(session.studentId, transferTarget)
    setTransferBusy(false)
    if (res.ok) {
      toast.success(res.message, { duration: 6000 })
      setTransferTarget("")
      load()
    } else {
      toast.error(res.error || "تعذر الإرسال")
    }
  }

  const handleSendInquiry = async () => {
    if (!session) return
    setInquiryBusy(true)
    const res = await sendStudentInquiry(session.studentId, inquiryText)
    setInquiryBusy(false)
    if (res.ok) {
      toast.success(res.message || "تم الإرسال", { duration: 6000 })
      setInquiryText("")
      const inq = await fetchStudentInquiries(session.studentId)
      setInquiries(inq as any)
    } else {
      toast.error(res.error || "تعذر الإرسال")
    }
  }

  const buildPrint = useMemo(() => {
    if (!report) return null
    return () => buildStudentReportPagesHtml({ report, type: tab, mode: "student", month: printMonth && printMonth !== "__all" ? parseInt(printMonth) : null })
  }, [report, tab, printMonth])

  const TABS: { key: StudentReportType; label: string; icon: React.ElementType }[] = [
    { key: "comprehensive", label: "الشامل", icon: FileText },
    { key: "grades", label: "درجاتي", icon: BarChart3 },
    { key: "payments", label: "مدفوعاتي", icon: DollarSign },
    { key: "attendance", label: "حضوري", icon: CalendarCheck },
    { key: "history", label: "سجلي", icon: History },
  ]

  if (!mounted || !session) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-arabic flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
      </div>
    )
  }

  // ===== شاشة خطأ الاتصال — Supabase هو المصدر الوحيد ولا نخفي المشكلة =====
  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-arabic flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <CloudOff className="w-14 h-14 mx-auto text-red-400" />
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">تعذر تحميل بياناتك</h1>
          <p className="text-sm text-gray-500">{loadError}</p>
          <Button onClick={() => { setMounted(false); load() }} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
            <RefreshCw className="w-4 h-4" />
            <span>إعادة المحاولة</span>
          </Button>
          <div>
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-red-500 underline">
              الخروج وتسجيل الدخول من جديد
            </button>
          </div>
        </div>
      </div>
    )
  }

  const now = new Date()
  // مواعيد مهمة: نوافذ الاختبارات المجدولة
  const scheduledExams = portalExams
    .filter(e => e.availabilityMode === "scheduled" && (e.availableFrom || e.availableUntil))
    .sort((a, b) => (a.availableFrom || "").localeCompare(b.availableFrom || ""))
    .slice(0, 6)
  const fmtDate = (iso?: string) => iso
    ? new Date(iso).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })
    : ""

  // لوحة شرف الصف: الأحدث أولاً + ميداليات للأول الثلاثة
  const topHonorees = [...gradeHonorees]
    .sort((a, b) => (b.year - a.year) || (b.month - a.month) || (a.createdAt || "").localeCompare(b.createdAt || ""))
    .slice(0, 12)
  const myName = session?.name || ""

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-arabic">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shrink-0">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-extrabold text-gray-900 dark:text-white leading-tight truncate">{session.name}</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {report ? `${report.gradeName} — ${report.groupName}` : "بوابة الطالب"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 shrink-0">
            <LogOut className="w-4 h-4" />
            <span>خروج</span>
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col md:flex-row gap-5">
        {/* ===== الشريط الجانبي (سطح المكتب) ===== */}
        <aside className="hidden md:flex md:flex-col w-60 shrink-0 gap-1.5 self-start sticky top-24">
          {SECTIONS.map(s => {
            const Icon = s.icon
            const active = section === s.key
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all text-right ${
                  active
                    ? "bg-gradient-to-l from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25"
                    : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${active ? "text-white" : "text-indigo-500"}`} />
                <span>{s.label}</span>
              </button>
            )
          })}
          <div className="h-px bg-gray-200 dark:bg-gray-800 my-2" />
          <Link
            href="/"
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:text-indigo-600 hover:bg-gray-50 dark:hover:bg-gray-900"
          >
            <Home className="w-4 h-4" />
            <span>الصفحة الرئيسية</span>
          </Link>
        </aside>

        {/* ===== تبويبات أفقية (موبايل) ===== */}
        <div className="md:hidden -mx-4 px-4 mb-1">
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {SECTIONS.map(s => {
              const Icon = s.icon
              const active = section === s.key
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                    active
                      ? "bg-gradient-to-l from-indigo-600 to-purple-600 text-white shadow"
                      : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ===== المحتوى ===== */}
        <main className="flex-1 min-w-0 space-y-5">

          {/* ============ 1) لوحة الشرف ============ */}
          {section === "honor" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <Card className="bg-gradient-to-l from-amber-500 to-orange-500 border-0 shadow-xl">
                <CardContent className="p-5 text-white flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-extrabold text-lg flex items-center gap-2">
                      <Trophy className="w-6 h-6" />
                      لوحة شرف {report?.gradeName || ""}
                    </p>
                    <p className="text-sm text-amber-100 mt-1">أوائل الصف وتكريماتهم — اجتهد ليكون اسمك هنا 🌟</p>
                  </div>
                  {report && report.honors.length > 0 && (
                    <Badge className="bg-white/20 text-white text-xs font-bold px-3 py-1.5">
                      تكريماتك: {report.honors.length}
                    </Badge>
                  )}
                </CardContent>
              </Card>

              {topHonorees.length === 0 ? (
                <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                  <CardContent className="py-12 text-center">
                    <Medal className="w-14 h-14 mx-auto mb-3 text-amber-300" />
                    <p className="text-gray-500 dark:text-gray-400 font-bold">لا يوجد متفوقون في صفك بعد</p>
                    <p className="text-xs text-gray-400 mt-1">كن أول من يظهر هنا — تفوق في اختباراتك القادمة</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {topHonorees.map((h, i) => {
                    const isMe = h.studentId === session.studentId || (myName && h.studentName === myName)
                    return (
                      <motion.div
                        key={h.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.05, 0.4) }}
                      >
                        <Card className={`h-full ${i < 3 ? "border-2 border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-gray-900" : "bg-white dark:bg-gray-900"} ${isMe ? "ring-2 ring-indigo-500" : ""} border-gray-200 dark:border-gray-800`}>
                          <CardContent className="p-4 flex items-start gap-3">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 font-extrabold ${
                              i < 3 ? "bg-amber-100 dark:bg-amber-900/50" : "bg-gray-100 dark:bg-gray-800"
                            }`}>
                              {i < 3 ? HONOR_MEDALS[i] : <Medal className="w-5 h-5 text-gray-300" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                                {h.studentName}
                                {isMe && <Badge className="bg-indigo-600 text-white text-[10px]">أنت 🎉</Badge>}
                              </p>
                              <p className="text-xs text-amber-700 dark:text-amber-400 font-bold mt-0.5">{h.reason}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                {MONTHS[(h.month || 1) - 1]} {h.year}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ============ 2) الإعلانات والمواعيد ============ */}
          {section === "announcements" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* مواعيد مهمة */}
              <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm">
                <CardContent className="p-5 space-y-4">
                  <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <CalendarClock className="w-5 h-5 text-indigo-500" />
                    مواعيد مهمة
                  </p>

                  {/* مواعيد مجموعتي */}
                  <div className="rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 p-4">
                    <p className="font-extrabold text-sm text-indigo-800 dark:text-indigo-300 mb-1.5 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      مواعيد مجموعتي
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {report && report.groupDays.length > 0 ? report.groupDays.join(" — ") : "لم تُحدد أيام بعد"}
                      {report && report.groupTime && report.groupTime !== "—" && (
                        <span className="font-bold text-indigo-700 dark:text-indigo-300"> • {report.groupTime}</span>
                      )}
                    </p>
                  </div>

                  {/* مواعيد الاختبارات المجدولة */}
                  {scheduledExams.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-extrabold text-gray-500">مواعيد الاختبارات الإلكترونية</p>
                      {scheduledExams.map(e => {
                        const av = examAvailability(e, now)
                        return (
                          <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 px-4 py-3">
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{e.title}</p>
                              <p className="text-xs text-gray-400">
                                {e.availableFrom && <>يُفتح: {fmtDate(e.availableFrom)}</>}
                                {e.availableFrom && e.availableUntil && " • "}
                                {e.availableUntil && <>يُغلق: {fmtDate(e.availableUntil)}</>}
                              </p>
                            </div>
                            {av.open ? (
                              <Badge className="bg-green-100 text-green-700 shrink-0"><CheckCircle2 className="w-3 h-3 ml-1" /> متاح الآن</Badge>
                            ) : av.reason && /سيُفتح/.test(av.reason) ? (
                              <Badge className="bg-amber-100 text-amber-700 shrink-0"><Hourglass className="w-3 h-3 ml-1" /> قريباً</Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-500 shrink-0"><XCircle className="w-3 h-3 ml-1" /> انتهى</Badge>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {scheduledExams.length === 0 && (
                    <p className="text-xs text-gray-400">لا توجد مواعيد اختبارات مجدولة حالياً — تابع الإعلانات</p>
                  )}
                </CardContent>
              </Card>

              {/* الإعلانات والأسئلة المهمة — صفه فقط */}
              <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm">
                <CardContent className="p-5 space-y-3">
                  <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-amber-500" />
                    إعلانات وأسئلة مهمة
                  </h3>
                  {portalAnnouncements.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">لا توجد إعلانات لصفك بعد</p>
                  ) : (
                    portalAnnouncements.map(a => {
                      const isNew = a.createdAt > lastAnnouncementsSeenAt()
                      return (
                        <div key={a.id} className={`rounded-xl px-4 py-3 border ${
                          isNew ? "border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20" : "border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60"
                        }`}>
                          <p className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                            {a.title}
                            {isNew && <Badge className="bg-red-500 text-white text-[10px]">جديد</Badge>}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap mt-1">{a.body}</p>
                          <p className="text-[11px] text-gray-400 mt-1">
                            {new Date(a.createdAt).toLocaleDateString("ar-EG", { dateStyle: "long" })}
                          </p>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ============ 3) اختباراتي ============ */}
          {section === "exams" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm">
                <CardContent className="p-5 space-y-3">
                  <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <PlayCircle className="w-5 h-5 text-rose-500" />
                    اختباراتي
                  </h3>
                  {portalExams.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">لا توجد اختبارات متاحة لصفك حالياً</p>
                  ) : (
                    portalExams.map(e => {
                      const av = examAvailability(e, now)
                      const myAttempts = (report?.examAttempts || []).filter(a => a.examId === e.id)
                      const at = attemptsStatus(e, report?.examAttempts || [], session.studentId, undefined, undefined, remoteAttempts[e.id] || 0)
                      const best = myAttempts.length
                        ? Math.max(...myAttempts.map(a => effectiveAttemptScore(a)))
                        : null
                      const bestPct = best !== null && e.totalMarks ? Math.round((best / e.totalMarks) * 100) : null
                      const scoreTone =
                        bestPct === null ? "" : bestPct >= 85 ? "bg-green-500" : bestPct >= 50 ? "bg-amber-500" : "bg-red-500"
                      return (
                        <div key={e.id} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 px-4 py-3 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-gray-900 dark:text-white">{e.title}</p>
                              <p className="text-xs text-gray-400">
                                {e.duration ? `${e.duration} دقيقة` : ""} {e.totalMarks ? ` • ${e.totalMarks} درجة` : ""}
                                {at.max > 0 && ` • المحاولات: ${at.used}/${at.max}`}
                              </p>
                              {myAttempts.some(a => a.manualOverride) && (
                                <p className="text-[11px] text-purple-600 mt-0.5">توجد درجة معدلة يدوياً من المعلم</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {!av.open ? (
                                <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
                                  <Lock className="w-4 h-4" />
                                  مغلق الآن
                                </span>
                              ) : !at.allowed ? (
                                <span className="flex items-center gap-1.5 text-xs font-bold text-red-600">
                                  <Lock className="w-4 h-4" />
                                  استُنفدت محاولاتك ({at.used}/{at.max})
                                </span>
                              ) : (
                                <Link href={`/exam/${e.id}`}>
                                  <Button size="sm" className="bg-gradient-to-r from-rose-500 to-red-600 text-white">
                                    <PlayCircle className="w-4 h-4" />
                                    <span>{myAttempts.length > 0 ? `إعادة (${at.remaining} متبقية)` : "ابدأ الاختبار"}</span>
                                  </Button>
                                </Link>
                              )}
                              {e.reviewOpen && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-indigo-300 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                                  onClick={() => setReviewExam(e)}
                                  title="مراجعة الاختبار ودرجتك"
                                >
                                  <Eye className="w-4 h-4" />
                                  <span>مراجعة</span>
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* الدرجة — شريط بارز واضح */}
                          {best !== null && (
                            <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5">
                              <span className={`shrink-0 rounded-lg ${scoreTone} text-white px-3 py-1.5 text-lg font-black leading-none`} dir="ltr">
                                {best}<span className="text-xs font-bold opacity-80"> / {e.totalMarks || "—"}</span>
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-extrabold text-gray-900 dark:text-white">
                                  درجتك في هذا الاختبار
                                  {bestPct !== null && ` — ${bestPct}%`}
                                </p>
                                <p className="text-[11px] text-gray-400">
                                  {myAttempts.length > 1 ? `أفضل نتيجة من ${myAttempts.length} محاولات` : "نتيجتك النهائية"}
                                  {e.reviewOpen && " • المراجعة مفتوحة — اضغط «مراجعة» لرؤية إجاباتك"}
                                </p>
                              </div>
                            </div>
                          )}

                          {!av.open && av.reason && <p className="text-xs text-gray-400">{av.reason}</p>}
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ============ 4) تقاريري ============ */}
          {section === "reports" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* ملخص سريع */}
              {report && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "التقييمات", value: report.manualGrades.length + report.examAttempts.length, icon: BarChart3, color: "from-blue-500 to-indigo-600" },
                    { label: "نسبة الحضور", value: `${report.attendance.rate}%`, icon: CalendarCheck, color: "from-emerald-500 to-teal-600" },
                    { label: "الرصيد", value: money(report.balance), icon: DollarSign, color: report.balance > 0 ? "from-red-500 to-rose-600" : "from-green-500 to-emerald-600" },
                    { label: "مرات التكريم", value: report.honors.length, icon: Trophy, color: "from-amber-500 to-orange-600" },
                  ].map((s, i) => {
                    const Icon = s.icon
                    return (
                      <motion.div
                        key={s.label}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm text-center"
                      >
                        <div className={`w-10 h-10 mx-auto rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center shadow mb-2`}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <p className="text-lg font-extrabold text-gray-900 dark:text-white">{s.value}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                      </motion.div>
                    )
                  })}
                </div>
              )}

              {/* طباعة التقرير المفصل */}
              {report && (
                <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm">
                  <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">تقريرك المفصل (PDF)</p>
                      <p className="text-xs text-gray-500 mt-1">
                        اطبع «{STUDENT_REPORT_LABELS[tab]}» وأرسله لولي الأمر — يحمل توقيع المعلم واسمك ودرجاتك
                      </p>
                    </div>
                    {reportsEnabled ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <Select value={printMonth} onValueChange={setPrintMonth}>
                          <SelectTrigger className="w-44"><SelectValue placeholder="الفترة" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all">العام كاملاً (سنوي)</SelectItem>
                            {MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={() => setPrintOpen(true)}
                          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                        >
                          <Printer className="w-4 h-4" />
                          <span>طباعة</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-600 text-sm font-bold shrink-0">
                        <Lock className="w-4 h-4" />
                        التقارير مغلقة حالياً بقرار المعلم
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* تبويبات التقارير */}
              {report && (
                <div className="flex flex-wrap gap-2">
                  {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                        tab === key
                          ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg"
                          : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* محتوى التقرير (للقراءة فقط) */}
              {report && (
                <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg">
                    <CardContent className="p-5 space-y-4">
                      {(tab === "comprehensive" || tab === "grades") && (
                        <div>
                          <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-indigo-500" />
                            درجاتي وتقييماتي
                          </h3>
                          {report.manualGrades.length + report.examAttempts.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">لا توجد درجات مسجلة بعد</p>
                          ) : (
                            <div className="space-y-2">
                              {[
                                ...report.manualGrades.map(m => ({ title: m.title, source: "تقييم من المعلم", score: m.score, max: m.maxScore, date: `${m.year}-${m.month}` })),
                                ...report.examAttempts.map(a => ({ title: "اختبار إلكتروني", source: "اختبار إلكتروني", score: a.score, max: a.totalMarks, date: (a.submittedAt || "").slice(0, 10) })),
                              ].map((g, i) => {
                                const pct = g.max > 0 ? Math.round((g.score / g.max) * 100) : 0
                                return (
                                  <div key={i} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-800">
                                    <div>
                                      <p className="font-bold text-sm text-gray-900 dark:text-white">{g.title}</p>
                                      <p className="text-xs text-gray-400">{g.date}</p>
                                    </div>
                                    <div className="text-left">
                                      <p className="font-extrabold text-gray-900 dark:text-white">{g.score} / {g.max}</p>
                                      <Badge className={pct >= 85 ? "bg-green-100 text-green-700" : pct >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}>
                                        {pct}%
                                      </Badge>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {(tab === "comprehensive" || tab === "payments") && (
                        <div>
                          <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-emerald-500" />
                            مدفوعاتي
                          </h3>
                          <div className="flex flex-wrap gap-2 mb-3 text-xs font-bold">
                            <span className="bg-yellow-50 dark:bg-yellow-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-full px-3 py-1.5">الاستحقاقات: {money(report.totalDue)}</span>
                            <span className="bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 rounded-full px-3 py-1.5">المدفوع: {money(report.totalPaid)}</span>
                            <span className={`border rounded-full px-3 py-1.5 ${report.balance > 0 ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800" : "bg-green-50 text-green-700 border-green-200"}`}>الرصيد: {money(report.balance)}</span>
                          </div>
                          {/* كشف المستحقات الشهرية — يوضح لولي الأمر ما دُفع وما تبقى */}
                          {report.dues && report.dues.length > 0 && (
                            <div className="mb-4">
                              <p className="text-xs font-bold text-gray-500 mb-2">المستحقات الشهرية</p>
                              <div className="space-y-1.5">
                                {report.dues.slice().sort((a, b) => (a.year - b.year) || (a.month - b.month)).map(d => (
                                  <div key={d.id} className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-800 text-xs">
                                    <span className="text-gray-600 dark:text-gray-300">{MONTHS[d.month - 1]} {d.year}</span>
                                    <span className="flex items-center gap-2">
                                      <span className="font-bold text-gray-800 dark:text-gray-100">{money(d.amount)}</span>
                                      <Badge className={d.status === "paid" ? "bg-green-100 text-green-700" : d.status === "partial" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}>
                                        {d.status === "paid" ? "مدفوع" : d.status === "partial" ? "مدفوع جزئياً" : "مستحق"}
                                      </Badge>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {report.payments.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">لا توجد دفعات مسجلة بعد</p>
                          ) : (
                            <div className="space-y-2">
                              {report.payments.slice().reverse().map(p => (
                                <div key={p.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-800">
                                  <p className="text-sm text-gray-600 dark:text-gray-300">دفعة عن {p.month}/{p.year} — {new Date(p.paymentDate).toLocaleDateString("ar-EG")}</p>
                                  <p className="font-extrabold text-green-600">{money(p.amount)}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {(tab === "comprehensive" || tab === "attendance") && (
                        <div>
                          <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                            <CalendarCheck className="w-5 h-5 text-teal-500" />
                            حضوري
                          </h3>
                          {report.attendance.total === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">لا توجد سجلات حضور بعد</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <span className="bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap">أيام مسجلة: {report.attendance.total}</span>
                              <span className="bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap">حضور: {report.attendance.present}</span>
                              <span className="bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap">غياب: {report.attendance.absent}</span>
                              <span className="bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap">النسبة: {report.attendance.rate}%</span>
                            </div>
                          )}
                        </div>
                      )}

                      {(tab === "comprehensive" || tab === "history") && (
                        <div>
                          <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-amber-500" />
                            مكافآتي وسجلي
                          </h3>
                          {report.honors.length + report.history.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">لا توجد أحداث بعد — اجتهد لتظهر هنا 🌟</p>
                          ) : (
                            <div className="space-y-2">
                              {report.honors.map(h => (
                                <div key={h.id} className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl px-4 py-3 border border-amber-200 dark:border-amber-800">
                                  <Trophy className="w-5 h-5 text-amber-500 shrink-0" />
                                  <div>
                                    <p className="font-bold text-sm text-amber-800 dark:text-amber-200">{h.reason}</p>
                                    <p className="text-xs text-amber-600/70">{h.month}/{h.year}</p>
                                  </div>
                                </div>
                              ))}
                              {report.history.map(h => (
                                <div key={h.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-800">
                                  <History className="w-5 h-5 text-indigo-400 shrink-0" />
                                  <div>
                                    <p className="font-bold text-sm text-gray-800 dark:text-gray-200">{h.title}</p>
                                    {h.detail && <p className="text-xs text-gray-400">{h.detail}</p>}
                                    <p className="text-xs text-gray-400">{h.date ? new Date(h.date).toLocaleDateString("ar-EG") : ""}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ============ 5) الاستفسارات والطلبات ============ */}
          {section === "inquiries" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* الاستفسار — رسالة واحدة ورد المعلم */}
              <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm">
                <CardContent className="p-5 space-y-3">
                  <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <MessageCircleQuestion className="w-5 h-5 text-sky-500" />
                    استفسار للمعلم
                  </p>

                  {(() => {
                    const mine = inquiries.filter(t => t.studentId === session.studentId)
                    const thread = mine.find(t => t.status === "open") || mine[mine.length - 1]
                    // الحالة من السحابة: حجب القناة من بيانات الطالب، والانتظار من آخر رسالة في الموضوع
                    const lastMsg = thread && thread.status === "open" ? thread.messages[thread.messages.length - 1] : null
                    const waitingTeacher = Boolean(lastMsg && lastMsg.from === "student")
                    const channelBlocked = report?.student.inquiryBlocked === true
                    const state = channelBlocked
                      ? { allowed: false as const, reason: "أغلق المعلم قناة الاستفسار الخاصة بك — راجع المعلم مباشرة" }
                      : waitingTeacher
                        ? { allowed: false as const, reason: "لديك استفسار بانتظار رد المعلم — ستتمكن من الرد بعد إجابته" }
                        : { allowed: true as const, reason: "" }
                    return (
                      <>
                        {thread && (
                          <div className="space-y-2">
                            {thread.messages.map((m, i) => (
                              <div key={i} className={`rounded-xl px-4 py-3 border text-sm ${
                                m.from === "student"
                                  ? "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800"
                                  : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                              }`}>
                                <p className="font-bold text-xs mb-1">
                                  {m.from === "student" ? "أنت" : "المعلم"}
                                  <span className="font-normal text-gray-400"> — {new Date(m.at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</span>
                                </p>
                                <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{m.text}</p>
                              </div>
                            ))}
                            {thread.status === "closed" && (
                              <p className="text-xs text-gray-400 flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> أُغلق هذا الاستفسار — يمكنك فتح استفسار جديد</p>
                            )}
                          </div>
                        )}

                        {state.allowed ? (
                          <div className="space-y-2">
                            <textarea
                              value={inquiryText}
                              onChange={e => setInquiryText(e.target.value)}
                              rows={3}
                              placeholder={thread && thread.status === "open" ? "اكتب ردك أو استفسارك التالي..." : "اكتب استفسارك للمعلم (رسالة واحدة يرد عليها)"}
                              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            <Button
                              onClick={handleSendInquiry}
                              disabled={inquiryBusy || inquiryText.trim().length < 5}
                              className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white"
                            >
                              <Send className="w-4 h-4" />
                              <span>{inquiryBusy ? "جاري الإرسال..." : thread && thread.status === "open" ? "إرسال الرد" : "إرسال الاستفسار"}</span>
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs text-amber-600 font-bold">{state.reason}</p>
                        )}
                      </>
                    )
                  })()}
                </CardContent>
              </Card>

              {/* طلب الانضمام لمجموعة أخرى */}
              <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm">
                <CardContent className="p-5 space-y-3">
                  <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <ArrowLeftRight className="w-5 h-5 text-emerald-500" />
                    طلب الانضمام إلى مجموعة أخرى
                  </p>
                  <p className="text-xs text-gray-500">
                    تظهر لك مجموعات صفك فقط — ينتقل طلبك للمعلم للموافقة، وبعد موافقته تنتقل تلقائياً ويُسجَّل ذلك في سجلك.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select value={transferTarget} onValueChange={setTransferTarget}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="اختر المجموعة المطلوبة" />
                      </SelectTrigger>
                      <SelectContent>
                        {gradeGroups.filter(g => g.id !== report?.student.groupId).map(g => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}{g.startTime && g.endTime ? ` — ${formatTime12(g.startTime)} إلى ${formatTime12(g.endTime)}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleTransferRequest}
                      disabled={!transferTarget || transferBusy}
                      className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shrink-0"
                    >
                      {transferBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      <span>إرسال الطلب</span>
                    </Button>
                  </div>
                  {gradeGroups.filter(g => g.id !== report?.student.groupId).length === 0 && (
                    <p className="text-xs text-gray-400">لا توجد مجموعات أخرى في صفك حالياً</p>
                  )}

                  {/* حالة طلبات النقل السابقة */}
                  {myTransferRequests.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-xs font-extrabold text-gray-500">طلباتي السابقة</p>
                      {myTransferRequests.map(t => {
                        const target = gradeGroups.find(g => g.id === t.toGroupId)
                        return (
                          <div key={t.id} className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2 text-xs">
                            <span className="text-gray-600 dark:text-gray-300">
                              النقل إلى: <strong>{target?.name || "—"}</strong>
                            </span>
                            <Badge className={t.status === "pending" ? "bg-amber-100 text-amber-700" : t.status === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                              {t.status === "pending" ? "قيد المراجعة" : t.status === "approved" ? "مقبول ✓" : "مرفوض"}
                            </Badge>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="text-center pb-8 md:hidden">
                <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600">
                  <Home className="w-4 h-4" />
                  الصفحة الرئيسية
                </Link>
              </div>
            </motion.div>
          )}
        </main>
      </div>

      {/* حوار طباعة التقرير */}
      <HtmlPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        build={printOpen ? buildPrint : null}
        filename={`تقرير-${report?.student.name || "الطالب"}-${STUDENT_REPORT_LABELS[tab]}`}
        title={`طباعة ${STUDENT_REPORT_LABELS[tab]}`}
        description="نسخة رسمية موجهة لولي الأمر — بالتوقيع واسم المعلم"
        accentClass="text-emerald-600"
      />

      {/* مراجعة اختبار — بعد فتح المعلم للمراجعة للجميع */}
      {reviewExam && (
        <ExamReviewDialog
          open={!!reviewExam}
          onOpenChange={v => { if (!v) setReviewExam(null) }}
          exam={reviewExam}
          attempts={(report?.examAttempts || []).filter(a => a.examId === reviewExam.id)}
          studentName={session?.name || ""}
        />
      )}
    </div>
  )
}
