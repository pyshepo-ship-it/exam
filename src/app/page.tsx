"use client"

import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  BookOpen,
  Megaphone,
  Trophy,
  FileDown,
  Link2,
  Pin,
  Download,
  ExternalLink,
  CalendarDays,
  Clock,
  Sparkles,
  Star,
  GraduationCap,
  Globe,
  KeyRound,
  UserPlus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PublicSurveysBoard } from "@/components/surveys/public-surveys-board"
import { Badge } from "@/components/ui/badge"
import {
  Announcement,
  Honoree,
  SharedFile,
  ImportantLink,
  Grade,
  Exam,
  getAllGroups,
  getGrades,
  getExams,
  getAnnouncements,
  getHonorees,
  getSharedFiles,
  getImportantLinks,
  getSetting,
  isHonoreeActive,
  getStoredAcademicYear,
} from "@/lib/data-storage"
import { buildPublicSchedule, isSchedulePublished } from "@/lib/schedule"
import { downloadSchedulePDF } from "@/lib/schedule-print"
import { getTeacherName, getTeacherSignatureLine } from "@/lib/branding"
import { formatTime12 } from "@/lib/utils"
import { fetchPublicData } from "@/lib/supabase/sync"
import { toPublicExamCard } from "@/lib/exam-public"
import { publicBoardExams } from "@/lib/portal-content"
import { TeacherSignature } from "@/components/teacher-signature"
import toast from "react-hot-toast"

// أيقونة واتساب (SVG)
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.004 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.257.59 4.462 1.713 6.404L3.2 28.8l6.548-1.69a12.74 12.74 0 0 0 6.254 1.628h.006c7.058 0 12.796-5.74 12.796-12.8 0-3.42-1.332-6.634-3.75-9.05A12.72 12.72 0 0 0 16.004 3.2zm0 23.36h-.004a10.57 10.57 0 0 1-5.377-1.47l-.386-.228-4.002 1.027 1.066-3.9-.252-.4a10.55 10.55 0 0 1-1.62-5.65c0-5.846 4.756-10.596 10.604-10.596 2.828 0 5.486 1.102 7.48 3.096a10.53 10.53 0 0 1 3.094 7.498c0 5.848-4.756 10.624-10.598 10.624zm5.838-7.928c-.32-.16-1.894-.934-2.188-1.042-.294-.106-.508-.16-.72.16-.212.32-.824 1.04-1.008 1.254-.184.212-.368.24-.688.08-.32-.16-1.352-.498-2.578-1.588-.952-.848-1.594-1.894-1.778-2.214-.184-.32-.02-.494.14-.652.144-.144.32-.368.48-.554.16-.184.212-.32.32-.532.106-.212.054-.4-.028-.558-.08-.16-.72-1.736-.986-2.378-.26-.624-.524-.54-.72-.55l-.612-.01c-.212 0-.558.08-.85.4-.294.32-1.12 1.096-1.12 2.67 0 1.574 1.146 3.096 1.306 3.308.16.212 2.254 3.442 5.464 4.828.764.33 1.36.526 1.824.674.768.244 1.464.21 2.016.128.616-.092 1.894-.776 2.162-1.526.266-.75.266-1.392.186-1.526-.078-.132-.292-.212-.612-.372z" />
    </svg>
  )
}

// توحيد رقم الهاتف لرقم دولي (مصري افتراضياً)
const normalizePhone = (raw: string): string => {
  let d = (raw || "").replace(/\D/g, "")
  if (!d) return ""
  if (d.startsWith("00")) d = d.slice(2)
  if (d.startsWith("0")) d = "2" + d
  return d
}

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]

/**
 * الصفحة الرئيسية: لوحة الإعلانات ولوحة الشرف (عامة - بدون تسجيل دخول)
 * أزرار أعلى الصفحة: "تسجيل طالب جديد" (/student/register)، "دخول الطالب" (/student/login)،
 * و"دخول المعلم" (/login) للوصول إلى لوحة التحكم
 */
export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  const [grades, setGrades] = useState<Grade[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [honorees, setHonorees] = useState<Honoree[]>([])
  const [files, setFiles] = useState<SharedFile[]>([])
  const [links, setLinks] = useState<ImportantLink[]>([])
  const [whatsappNumber, setWhatsappNumber] = useState("")
  const [onlineExams, setOnlineExams] = useState<Exam[]>([])
  const [schedulePublished, setSchedulePublished] = useState(false)
  const [exportingSchedule, setExportingSchedule] = useState(false)
  const [publicTeacher, setPublicTeacher] = useState<{ name?: string; signature?: string; year?: string }>({})

  useEffect(() => {
    const load = async () => {
      // 1) المصدر الأساسي: Supabase (تظهر البيانات لجميع الطلاب من أي جهاز)
      const publicData = await fetchPublicData()
      if (publicData) {
        setAnnouncements(publicData.announcements)
        setHonorees(publicData.honorees)
        setFiles(publicData.files)
        setLinks(publicData.links)
        // بناء بنية الصفوف والمجموعات من البيانات العامة
        setGrades(
          publicData.grades.map(g => ({
            id: g.id,
            name: g.name,
            academicYear: "",
            createdAt: "",
            groups: publicData.groups
              .filter(gr => gr.gradeId === g.id)
              .map(gr => ({
                id: gr.id,
                name: gr.name,
                days: gr.days || [],
                startTime: gr.startTime || "",
                endTime: gr.endTime || "",
                monthlyFee: 0,
                studentsCount: 0,
              })),
          }))
        )
        setWhatsappNumber(publicData.settings?.whatsappNumber || "")
        // لوحة الإعلانات تعرض الاختبارات «المفتوحة للجميع» فقط (بلا أسئلة إطلاقاً) —
        // اختبارات الأعضاء المسجلين تظهر في بوابة الطالب حسب صف كل طالب
        setOnlineExams(publicBoardExams(publicData.exams || []).map(toPublicExamCard))
        // حالة نشر الجدول + اسم المعلم لتوقيع الجدول المطبوع
        setSchedulePublished(publicData.settings?.schedulePublished === "1")
        setPublicTeacher({
          name: publicData.settings?.teacherName || undefined,
          signature: publicData.settings?.teacherSignatureLine || undefined,
        })
      } else {
        // 2) تعذر الوصول إلى Supabase: تُعرض ذاكرة الجلسة فقط (لا تخزين محلي على الجهاز)
        setGrades(getGrades())
        setAnnouncements(getAnnouncements())
        setHonorees(getHonorees())
        setFiles(getSharedFiles())
        setLinks(getImportantLinks())
        setWhatsappNumber(getSetting("whatsappNumber"))
        setOnlineExams(publicBoardExams(getExams()).map(toPublicExamCard))
        setSchedulePublished(isSchedulePublished())
        setPublicTeacher({
          name: getTeacherName(),
          signature: getTeacherSignatureLine(),
          year: getStoredAcademicYear(),
        })
      }
      setMounted(true)
    }
    load()
  }, [])

  const allGroups = getAllGroups(grades)
  const now = new Date()

  // تحميل نسخة الطلاب من الجدول (PDF — المواعيد فقط بدون بيانات حساسة)
  const handleDownloadSchedule = async () => {
    setExportingSchedule(true)
    try {
      await downloadSchedulePDF({
        mode: "student",
        grades,
        teacherName: publicTeacher.name || getTeacherName(),
        signatureLine: publicTeacher.signature || getTeacherSignatureLine(),
        academicYear: publicTeacher.year || getStoredAcademicYear(),
      })
      toast.success("تم تحميل جدول المواعيد — بالتوفيق والنجاح 🌟")
    } catch {
      toast.error("تعذر تحميل الجدول — حاول مرة أخرى")
    }
    setExportingSchedule(false)
  }

  // الجدول المنشور للطلاب (مواعيد فقط)
  const publicSchedule = schedulePublished ? buildPublicSchedule(grades) : []

  // الإعلانات: المثبتة أولاً ثم الأحدث — العامة فقط؛ المستهدفة بصف تظهر في بوابة طلابه فقط
  const sortedAnnouncements = [...announcements]
    .filter(a => !a.targetGradeIds || a.targetGradeIds.length === 0)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  // لوحة الشرف: المكرّمون في الشهر والعام الحاليين، مقسّمون حسب الصف الدراسي
  const activeHonorees = honorees.filter(h => isHonoreeActive(h, now))

  const honoreesByGrade = grades
    .map(grade => {
      const gradeGroupIds = new Set(grade.groups.map(g => g.id))
      const items = activeHonorees
        .filter(h => gradeGroupIds.has(h.groupId))
        .map(h => ({
          ...h,
          groupName: grade.groups.find(g => g.id === h.groupId)?.name || "",
        }))
        .sort((a, b) => a.studentName.localeCompare(b.studentName, "ar"))
      return { grade, items }
    })
    .filter(entry => entry.items.length > 0)

  // مكرّمون لا ينتمون لأي صف معروف (احتياطي حتى لا يختفي أحد)
  const knownGroupIds = new Set(allGroups.map(g => g.id))
  const otherHonorees = activeHonorees.filter(h => !knownGroupIds.has(h.groupId))

  // ألوان مبهجة تتناوب على بطاقات الصفوف
  const GRADE_THEMES = [
    { header: "from-amber-400 via-yellow-400 to-orange-500", ring: "border-amber-300 dark:border-amber-700/60", bg: "from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/20", avatar: "from-amber-400 to-orange-500", chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200" },
    { header: "from-sky-400 via-blue-500 to-indigo-500", ring: "border-sky-300 dark:border-sky-800/60", bg: "from-sky-50 to-blue-50 dark:from-sky-950/30 dark:to-blue-950/20", avatar: "from-sky-400 to-indigo-500", chip: "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200" },
    { header: "from-emerald-400 via-green-500 to-teal-500", ring: "border-emerald-300 dark:border-emerald-800/60", bg: "from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20", avatar: "from-emerald-400 to-teal-500", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200" },
    { header: "from-fuchsia-400 via-purple-500 to-violet-500", ring: "border-purple-300 dark:border-purple-800/60", bg: "from-fuchsia-50 to-purple-50 dark:from-fuchsia-950/30 dark:to-purple-950/20", avatar: "from-fuchsia-400 to-purple-500", chip: "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200" },
    { header: "from-rose-400 via-pink-500 to-red-500", ring: "border-rose-300 dark:border-rose-800/60", bg: "from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/20", avatar: "from-rose-400 to-pink-500", chip: "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200" },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-arabic">
      {/* مؤثرات لوحة الشرف الاحتفالية (CSS خالص — سريعة وخفيفة) */}
      <style>{`
        @keyframes honor-glow {
          0%, 100% { box-shadow: 0 0 12px rgba(245, 158, 11, .45), 0 0 26px rgba(245, 158, 11, .18); }
          50% { box-shadow: 0 0 22px rgba(245, 158, 11, .75), 0 0 46px rgba(245, 158, 11, .32); }
        }
        @keyframes honor-shimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes honor-float {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: .95; }
          50% { transform: translateY(-6px) rotate(12deg); opacity: 1; }
        }
        @keyframes honor-pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        /* حلقة ثابتة (بدون دوران) بطلب المستخدم — تُكتفى بحركات الكارت */
        .honor-ring {
          position: relative;
          border-radius: 9999px;
          padding: 3px;
          background: conic-gradient(#f59e0b, #ef4444, #a855f7, #3b82f6, #10b981, #f59e0b);
        }
        .honor-avatar-glow { animation: honor-glow 2.6s ease-in-out infinite; }
        .honor-name {
          background: linear-gradient(90deg, #b45309, #d97706, #f59e0b, #d97706, #b45309);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: honor-shimmer 3.2s linear infinite;
        }
        .dark .honor-name {
          background: linear-gradient(90deg, #fbbf24, #fde047, #fbbf24, #fde047, #fbbf24);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .honor-sparkle {
          position: absolute;
          animation: honor-float 2.4s ease-in-out infinite;
          filter: drop-shadow(0 0 4px rgba(245, 158, 11, .6));
          pointer-events: none;
        }
        .honor-card-pop { animation: honor-pop 3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .honor-avatar-glow, .honor-name, .honor-sparkle, .honor-card-pop { animation: none; }
          .honor-name { -webkit-text-fill-color: currentColor; background: none; }
        }
      `}</style>
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white leading-tight truncate">أ/ ضحى العربي</h1>
                <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                  الإعلانات ولوحة الشرف والملفات
                </p>
              </div>
            </div>

            {/* سطح المكتب والشاشات المتوسطة: الأزرار الثلاثة في سطر العنوان */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <a
                href="/student/register"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-700 hover:to-purple-700 transition-all"
              >
                <UserPlus className="w-4 h-4" />
                تسجيل طالب جديد
              </a>
              <a
                href="/student/login"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border-2 border-indigo-500 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-all"
              >
                دخول الطالب
              </a>
              {/* دخول المعلم: زر هادئ غير بارز (أيقونة مفتاح صغيرة + نص رمادي) — للوصول إلى لوحة التحكم */}
              <a
                href="/login"
                aria-label="دخول المعلم"
                title="دخول المعلم — للوصول إلى لوحة التحكم"
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              >
                <KeyRound className="w-3.5 h-3.5" />
                دخول المعلم
              </a>
            </div>
          </div>

          {/*
            الهاتف: صف أزرار مستقل بثلاثة أعمدة متساوية تحت العنوان مباشرة،
            فلا يختفي زر «تسجيل طالب جديد» مهما ضاقت الشاشة (حتى 320px).
          */}
          <div className="sm:hidden grid grid-cols-3 gap-1.5 mt-3">
            <a
              href="/student/register"
              className="flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl text-[11px] font-bold leading-tight text-center bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25 active:scale-[0.98] transition-transform"
            >
              <UserPlus className="w-4 h-4" />
              <span className="break-words">تسجيل طالب جديد</span>
            </a>
            <a
              href="/student/login"
              className="flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl text-[11px] font-bold leading-tight text-center border-2 border-indigo-500 text-indigo-600 dark:text-indigo-400 active:scale-[0.98] transition-transform"
            >
              <GraduationCap className="w-4 h-4" />
              <span className="break-words">دخول الطالب</span>
            </a>
            <a
              href="/login"
              aria-label="دخول المعلم"
              title="دخول المعلم — للوصول إلى لوحة التحكم"
              className="flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl text-[11px] font-semibold leading-tight text-center border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 active:scale-[0.98] transition-transform"
            >
              <KeyRound className="w-4 h-4" />
              <span className="break-words">دخول المعلم</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {!mounted ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
          </div>
        ) : (
          <>
            {/* Date strip */}
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <CalendarDays className="w-4 h-4" />
              {now.toLocaleDateString("ar-EG", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>

            {/* ============ لوحة الشرف (ثابتة) ============ */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* رأس اللوحة */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-amber-500 via-yellow-500 to-orange-500 px-6 py-7 shadow-xl shadow-amber-500/20">
                <Sparkles className="absolute -top-3 -left-3 w-24 h-24 text-white/15" />
                <Star className="absolute bottom-2 right-6 w-16 h-16 text-white/10" />
                <div className="relative flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center ring-2 ring-white/40 shrink-0">
                    <Trophy className="w-9 h-9 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-3xl font-extrabold text-white drop-shadow-sm">لوحة الشرف</h2>
                    <p className="text-white/90 text-sm mt-1">
                      نفتخر بطلابنا المتميزين لشهر {MONTHS[now.getMonth()]} {now.getFullYear()}
                    </p>
                  </div>
                  <div className="mr-auto hidden sm:flex flex-col items-center bg-white/20 backdrop-blur rounded-2xl px-5 py-3 ring-1 ring-white/30">
                    <span className="text-3xl font-extrabold text-white leading-none">
                      {activeHonorees.length}
                    </span>
                    <span className="text-xs text-white/90 mt-1">طالب متميز</span>
                  </div>
                </div>
              </div>

              {activeHonorees.length === 0 ? (
                <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/10 rounded-3xl border-2 border-dashed border-amber-300 dark:border-amber-800 p-12 text-center">
                  <Trophy className="w-16 h-16 mx-auto mb-4 text-amber-300 dark:text-amber-700" />
                  <p className="text-lg font-bold text-amber-800 dark:text-amber-300">
                    لوحة الشرف في انتظار نجوم هذا الشهر
                  </p>
                  <p className="text-sm text-amber-600/80 dark:text-amber-400/70 mt-2">
                    اجتهد وكن أول من يظهر اسمه هنا
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {honoreesByGrade.map(({ grade, items }, gi) => {
                    const theme = GRADE_THEMES[gi % GRADE_THEMES.length]
                    return (
                      <motion.div
                        key={grade.id}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: gi * 0.08 }}
                        className={`bg-gradient-to-br ${theme.bg} rounded-3xl border-2 ${theme.ring} shadow-lg overflow-hidden`}
                      >
                        <div className={`bg-gradient-to-l ${theme.header} px-5 py-4 flex items-center gap-3`}>
                          <div className="w-10 h-10 rounded-xl bg-white/25 backdrop-blur flex items-center justify-center shrink-0">
                            <GraduationCap className="w-6 h-6 text-white" />
                          </div>
                          <h3 className="font-extrabold text-white text-lg truncate">{grade.name}</h3>
                          <span className="mr-auto shrink-0 bg-white/25 text-white text-xs font-bold px-3 py-1 rounded-full">
                            {items.length} متميز
                          </span>
                        </div>

                        <ul className="p-4 space-y-3">
                          {items.map((h, i) => (
                            <motion.li
                              key={h.id}
                              initial={{ opacity: 0, x: 15 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: gi * 0.08 + i * 0.04 }}
                              className="honor-card-pop relative flex items-center gap-3 bg-white/85 dark:bg-gray-900/70 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow overflow-visible"
                            >
                              <div className="honor-ring relative shrink-0">
                                <div className={`honor-avatar-glow w-14 h-14 rounded-full bg-gradient-to-br ${theme.avatar} flex items-center justify-center text-white text-2xl font-extrabold`}>
                                  {h.studentName.trim().charAt(0)}
                                </div>
                                <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center shadow z-10">
                                  <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                                </span>
                              </div>
                              <span className="honor-sparkle text-lg" style={{ top: -4, left: 8, animationDelay: "0s" }}>✨</span>
                              <span className="honor-sparkle text-sm" style={{ bottom: 2, left: 22, animationDelay: "0.8s" }}>⭐</span>
                              <div className="min-w-0 flex-1">
                                <p className="honor-name font-extrabold text-lg leading-tight break-words">
                                  {h.studentName}
                                </p>
                                {h.reason && (
                                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 break-words">
                                    {h.reason}
                                  </p>
                                )}
                                {h.groupName && (
                                  <span className={`inline-block mt-2 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${theme.chip}`}>
                                    {h.groupName}
                                  </span>
                                )}
                              </div>
                            </motion.li>
                          ))}
                        </ul>
                      </motion.div>
                    )
                  })}

                  {otherHonorees.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900 dark:to-slate-900 rounded-3xl border-2 border-gray-300 dark:border-gray-700 shadow-lg overflow-hidden"
                    >
                      <div className="bg-gradient-to-l from-gray-500 to-slate-600 px-5 py-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/25 flex items-center justify-center shrink-0">
                          <GraduationCap className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="font-extrabold text-white text-lg">متميزون آخرون</h3>
                      </div>
                      <ul className="p-4 space-y-3">
                        {otherHonorees.map(h => (
                          <li
                            key={h.id}
                            className="flex items-center gap-3 bg-white/85 dark:bg-gray-900/70 rounded-2xl p-4 shadow-sm"
                          >
                            <div className="honor-ring shrink-0">
                              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-400 to-slate-500 flex items-center justify-center text-white text-2xl font-extrabold shadow-lg">
                                {h.studentName.trim().charAt(0)}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="honor-name font-extrabold text-lg break-words">
                                {h.studentName}
                              </p>
                              {h.reason && (
                                <p className="text-sm text-gray-600 dark:text-gray-300 break-words">{h.reason}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.section>

            {/* ============ جدول المواعيد الأسبوعي (منشور للطلاب — مواعيد فقط) ============ */}
            {publicSchedule.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                      <CalendarDays className="w-5 h-5 text-white" />
                    </div>
                    جدول المواعيد الأسبوعي
                  </h2>
                  <Button
                    size="sm"
                    onClick={handleDownloadSchedule}
                    disabled={exportingSchedule}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
                  >
                    <Download className={`w-4 h-4 ${exportingSchedule ? "animate-pulse" : ""}`} />
                    <span>{exportingSchedule ? "جاري التحضير..." : "تحميل الجدول PDF"}</span>
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {publicSchedule.map(({ gradeId, gradeName, groups }, gi) => (
                    <motion.div
                      key={gradeId}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: gi * 0.06 }}
                      className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 shadow-lg overflow-hidden"
                    >
                      <div className="bg-gradient-to-l from-emerald-500 to-teal-600 px-5 py-3.5 flex items-center gap-2.5">
                        <BookOpen className="w-5 h-5 text-white shrink-0" />
                        <h3 className="font-extrabold text-white truncate">{gradeName}</h3>
                      </div>
                      <ul className="p-4 space-y-2.5">
                        {groups.map(gr => (
                          <li
                            key={gr.id}
                            className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50/70 dark:bg-emerald-950/20 rounded-xl px-4 py-3 border border-emerald-100 dark:border-emerald-900"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 dark:text-white text-sm">{gr.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{gr.days.join("، ")}</p>
                            </div>
                            <span className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shrink-0">
                              <Clock className="w-3.5 h-3.5" />
                              {gr.startTime && gr.endTime
                                ? `${formatTime12(gr.startTime)} - ${formatTime12(gr.endTime)}`
                                : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                  يرجى الالتزام بالمواعيد والحضور قبل بداية الحصة — لأي استفسار تواصلوا مع المعلم
                </p>
              </motion.section>
            )}

            {/* ============ اختبارات مفتوحة للجميع (بدون تسجيل دخول) ============ */}
            {onlineExams.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <GraduationCap className="w-5 h-5 text-white" />
                  </div>
                  اختبارات مفتوحة الآن
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2">
                  مفتوحة للجميع بدون تسجيل دخول — تُدخل اسمك ورقم هاتفك وتختار مجموعتك ثم تبدأ
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {onlineExams.map(exam => {
                    const gradeName = grades.find(g => g.id === exam.gradeId)?.name
                    return (
                      <a
                        key={exam.id}
                        href={`/exam/${exam.id}`}
                        className="bg-white dark:bg-gray-900 rounded-2xl border border-indigo-200 dark:border-indigo-800 p-5 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-gray-900 dark:text-white">{exam.title}</p>
                          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2.5 py-1 text-[11px] font-bold">
                            <Globe className="w-3 h-3" />
                            بدون تسجيل
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          الزمن {exam.duration || 60} دقيقة
                          {exam.totalMarks ? ` • ${exam.totalMarks} درجة` : ""}
                        </p>
                        {gradeName && (
                          <p className="text-xs text-gray-400 mt-1">الصف: {gradeName}</p>
                        )}
                        <p className="text-indigo-600 text-sm font-semibold mt-3">ابدأ الاختبار ←</p>
                      </a>
                    )
                  })}
                </div>
              </motion.section>
            )}

            {/* ============ الإعلانات ============ */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                  <Megaphone className="w-5 h-5 text-white" />
                </div>
                إعلانات مهمة
              </h2>

              {sortedAnnouncements.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-10 text-center">
                  <Megaphone className="w-14 h-14 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                  <p className="text-gray-500 dark:text-gray-400">لا توجد إعلانات حالياً</p>
                </div>
              ) : (
                sortedAnnouncements.map((a, index) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div
                      className={`bg-white dark:bg-gray-900 rounded-2xl border p-6 shadow-sm ${
                        a.pinned
                          ? "border-amber-400 dark:border-amber-700 ring-1 ring-amber-300/50"
                          : "border-gray-200 dark:border-gray-800"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {a.pinned && (
                          <Badge
                            variant="warning"
                            className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 shrink-0"
                          >
                            <Pin className="w-3 h-3" />
                            مثبّت
                          </Badge>
                        )}
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                            {a.title}
                          </h3>
                          <p className="text-gray-600 dark:text-gray-300 mt-2 leading-relaxed whitespace-pre-wrap">
                            {a.body}
                          </p>
                          <p className="text-xs text-gray-400 mt-4">
                            {new Date(a.createdAt).toLocaleDateString("ar-EG", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.section>

            {/* ============ استبيانات مفتوحة للزوار ============ */}
            {mounted && <PublicSurveysBoard />}

            {/* ============ ملفات للتحميل ============ */}
            {files.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                    <FileDown className="w-5 h-5 text-white" />
                  </div>
                  ملفات للتحميل
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {files.map((f, index) => (
                    <motion.div
                      key={f.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3"
                    >
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shrink-0">
                        <FileDown className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">{f.name}</p>
                        {f.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                            {f.description}
                          </p>
                        )}
                      </div>
                      <a
                        href={f.dataUrl || f.url || "#"}
                        download={f.source === "upload" ? f.name : undefined}
                        target={f.source === "link" ? "_blank" : undefined}
                        rel={f.source === "link" ? "noopener noreferrer" : undefined}
                      >
                        <Button
                          size="sm"
                          className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                        >
                          {f.source === "link" ? (
                            <ExternalLink className="w-4 h-4" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          <span>تحميل</span>
                        </Button>
                      </a>
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            )}

            {/* ============ روابط مهمة ============ */}
            {links.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <Link2 className="w-5 h-5 text-white" />
                  </div>
                  روابط مهمة
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {links.map((l, index) => (
                    <motion.div
                      key={l.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3 hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-md transition-all"
                      >
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shrink-0">
                          <Link2 className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white">{l.title}</p>
                          <p className="text-sm text-gray-400 truncate" dir="ltr">
                            {l.url}
                          </p>
                        </div>
                        <ExternalLink className="w-5 h-5 text-indigo-500 shrink-0" />
                      </a>
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 mt-8">
        {/* التواصل عبر واتساب */}
        {mounted && normalizePhone(whatsappNumber) && (
          <div className="max-w-5xl mx-auto px-4 py-8 text-center space-y-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              لأي استفسار أو استشارة — تواصلوا معي مباشرة
            </h2>
            <a
              href={`https://wa.me/${normalizePhone(whatsappNumber)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5b] text-white font-bold text-lg px-8 py-3.5 rounded-full shadow-lg shadow-green-500/30 transition-all hover:scale-105"
            >
              <WhatsAppIcon className="w-7 h-7" />
              <span>تواصل عبر واتساب</span>
            </a>
          </div>
        )}
        <div className="border-t border-gray-200 dark:border-gray-800 py-5 space-y-3">
          <TeacherSignature compact />
          <p className="text-center text-sm text-gray-400 dark:text-gray-600">
            أ/ ضحى العربي — جميع الحقوق محفوظة © {now.getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  )
}
