"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  GraduationCap,
  LogOut,
  Printer,
  BarChart3,
  DollarSign,
  CalendarCheck,
  Trophy,
  History,
  FileText,
  ArrowLeftRight,
  Loader2,
  Clock,
  Users,
  BookOpen,
  Home,
  Send,
  Lock,
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
import toast from "react-hot-toast"
import {
  getPortalSession,
  portalLogout,
  requestGroupTransfer,
  areStudentReportsEnabled,
} from "@/lib/student-accounts"
import {
  collectStudentReport,
  reportFromPortalData,
  buildStudentReportPagesHtml,
  STUDENT_REPORT_LABELS,
  StudentReport,
  StudentReportType,
} from "@/lib/student-report"
import { getGrades, getStudents } from "@/lib/data-storage"
import { fetchPublicData, fetchStudentPortalData } from "@/lib/supabase/sync"
import { HtmlPrintDialog } from "@/components/html-print-dialog"
import { formatTime12 } from "@/lib/utils"

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]

const money = (n: number) => `${Number(n || 0).toLocaleString("ar-EG")} ج.م`

export default function StudentPortalPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [session, setSession] = useState<ReturnType<typeof getPortalSession>>(null)
  const [report, setReport] = useState<StudentReport | null>(null)
  const [gradeGroups, setGradeGroups] = useState<{ id: string; name: string; days: string[]; startTime: string; endTime: string }[]>([])
  const [tab, setTab] = useState<StudentReportType>("comprehensive")
  const [printOpen, setPrintOpen] = useState(false)
  const [reportsEnabled, setReportsEnabled] = useState(true)
  const [transferTarget, setTransferTarget] = useState("")
  const [transferBusy, setTransferBusy] = useState(false)

  // تحميل بيانات الطالب: من Supabase (المصدر الحقيقي) أو من المرآة المحلية
  useEffect(() => {
    const load = async () => {
      const s = getPortalSession()
      if (!s) {
        router.replace("/student/login")
        return
      }
      setSession(s)
      setReportsEnabled(areStudentReportsEnabled())

      const publicData = await fetchPublicData()
      if (publicData) {
        const portalData = await fetchStudentPortalData(s.studentId)
        if (portalData) {
          setReport(reportFromPortalData(portalData))
          // مجموعات صف الطالب فقط (لطلب الانضمام لمجموعة أخرى)
          const myGroup = publicData.groups.find(g => g.id === portalData.student.groupId)
          if (myGroup) {
            setGradeGroups(
              publicData.groups
                .filter(g => g.gradeId === myGroup.gradeId)
                .map(g => ({ id: g.id, name: g.name, days: g.days || [], startTime: g.startTime || "", endTime: g.endTime || "" }))
            )
          }
        } else {
          toast.error("تعذر تحميل بياناتك — حاول تحديث الصفحة")
        }
      } else {
        // وضع محلي
        const student = getStudents().find(x => x.id === s.studentId)
        if (!student) {
          portalLogout()
          router.replace("/student/login")
          return
        }
        setReport(collectStudentReport(s.studentId))
        const grade = getGrades().find(g => g.id === student.gradeId)
        setGradeGroups(
          (grade?.groups || []).map(g => ({ id: g.id, name: g.name, days: g.days || [], startTime: g.startTime || "", endTime: g.endTime || "" }))
        )
      }
      setMounted(true)
    }
    load()
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
    } else {
      toast.error(res.error)
    }
  }

  const buildPrint = useMemo(() => {
    if (!report) return null
    return () => buildStudentReportPagesHtml({ report, type: tab, mode: "student" })
  }, [report, tab])

  if (!mounted || !session) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-arabic flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
      </div>
    )
  }

  const TABS: { key: StudentReportType; label: string; icon: React.ElementType }[] = [
    { key: "comprehensive", label: "الشامل", icon: FileText },
    { key: "grades", label: "درجاتي", icon: BarChart3 },
    { key: "payments", label: "مدفوعاتي", icon: DollarSign },
    { key: "attendance", label: "حضوري", icon: CalendarCheck },
    { key: "history", label: "سجلي", icon: History },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-arabic">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between">
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

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* معلومات المجموعة */}
        {report && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="bg-gradient-to-l from-indigo-600 to-purple-600 border-0 shadow-xl">
              <CardContent className="p-5 text-white">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <span className="flex items-center gap-2 font-bold text-base">
                    <BookOpen className="w-5 h-5" />
                    {report.gradeName}
                  </span>
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    مجموعة: {report.groupName}
                  </span>
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {report.groupTime}
                  </span>
                  <span className="flex items-center gap-2">
                    {report.groupDays.join("، ")}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

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
                        <span className="bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 rounded-full px-3 py-1.5 text-xs font-bold">أيام مسجلة: {report.attendance.total}</span>
                        <span className="bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 rounded-full px-3 py-1.5 text-xs font-bold">حضور: {report.attendance.present}</span>
                        <span className="bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-full px-3 py-1.5 text-xs font-bold">غياب: {report.attendance.absent}</span>
                        <span className="bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 rounded-full px-3 py-1.5 text-xs font-bold">النسبة: {report.attendance.rate}%</span>
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
                <Button
                  onClick={() => setPrintOpen(true)}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shrink-0"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة التقرير المفصل</span>
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-amber-600 text-sm font-bold shrink-0">
                  <Lock className="w-4 h-4" />
                  التقارير مغلقة حالياً بقرار المعلم
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* طلب الانضمام لمجموعة أخرى */}
        {report && (
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
                    {gradeGroups.filter(g => g.id !== report.student.groupId).map(g => (
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
            </CardContent>
          </Card>
        )}

        <div className="text-center pb-8">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600">
            <Home className="w-4 h-4" />
            الصفحة الرئيسية
          </Link>
        </div>
      </main>

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
    </div>
  )
}
