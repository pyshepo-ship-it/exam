"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
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
  LogIn,
  CalendarDays,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Announcement,
  Honoree,
  SharedFile,
  ImportantLink,
  Grade,
  getAllGroups,
  getGrades,
  getAnnouncements,
  getHonorees,
  getSharedFiles,
  getImportantLinks,
  getSetting,
  isHonoreeActive,
} from "@/lib/data-storage"
import { fetchPublicData } from "@/lib/supabase/sync"

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
 * الدخول إلى لوحة التحكم يتم من زر "تسجيل الدخول" إلى صفحة /login
 */
export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  const [grades, setGrades] = useState<Grade[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [honorees, setHonorees] = useState<Honoree[]>([])
  const [files, setFiles] = useState<SharedFile[]>([])
  const [links, setLinks] = useState<ImportantLink[]>([])
  const [whatsappNumber, setWhatsappNumber] = useState("")

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
                days: [] as string[],
                startTime: "",
                endTime: "",
                monthlyFee: 0,
                studentsCount: 0,
              })),
          }))
        )
        setWhatsappNumber(publicData.settings?.whatsappNumber || "")
      } else {
        // 2) وضع محلي (عند عدم تهيئة Supabase): من متصفح الجهاز
        setGrades(getGrades())
        setAnnouncements(getAnnouncements())
        setHonorees(getHonorees())
        setFiles(getSharedFiles())
        setLinks(getImportantLinks())
        setWhatsappNumber(getSetting("whatsappNumber"))
      }
      setMounted(true)
    }
    load()
  }, [])

  const allGroups = getAllGroups(grades)
  const now = new Date()

  // الإعلانات: المثبتة أولاً ثم الأحدث
  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  // المتواجدون حالياً في لوحة الشرف (المطابقون للشهر والعام الحاليين) مجمعين حسب المجموعة
  const activeHonoreesByGroup = allGroups
    .map(group => ({
      group,
      items: honorees.filter(h => h.groupId === group.id && isHonoreeActive(h, now)),
    }))
    .filter(entry => entry.items.length > 0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-arabic">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 dark:text-white leading-tight truncate">نظام إدارة الدروس</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                الإعلانات ولوحة الشرف والملفات
              </p>
            </div>
          </div>
          <Link href="/login" className="shrink-0">
            <Button className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700">
              <LogIn className="w-4 h-4" />
              <span>تسجيل الدخول</span>
            </Button>
          </Link>
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

            {/* ============ لوحة الشرف ============ */}
            {activeHonoreesByGroup.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center shadow-lg">
                    <Trophy className="w-5 h-5 text-white" />
                  </div>
                  لوحة الشرف — {MONTHS[now.getMonth()]} {now.getFullYear()}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeHonoreesByGroup.map(({ group, items }, index) => (
                    <motion.div
                      key={group.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.08 }}
                      className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/30 rounded-2xl border-2 border-amber-300 dark:border-amber-800 shadow-lg overflow-hidden"
                    >
                      <div className="bg-gradient-to-r from-amber-500 to-yellow-500 px-5 py-3">
                        <h3 className="font-bold text-white flex items-center gap-2">
                          <Trophy className="w-5 h-5" />
                          {group.gradeName} - {group.name}
                        </h3>
                      </div>
                      <div className="p-5 space-y-3">
                        {items.map(h => (
                          <div
                            key={h.id}
                            className="flex items-center gap-3 bg-white/80 dark:bg-gray-900/60 rounded-xl p-4 border border-amber-200 dark:border-amber-900"
                          >
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shrink-0">
                              {h.studentName.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-gray-900 dark:text-white truncate">
                                {h.studentName}
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-300">
                                {h.reason}
                              </p>
                            </div>
                            <Badge
                              variant="warning"
                              className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 mr-auto shrink-0"
                            >
                              نجم الشهر
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            )}

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
        <div className="border-t border-gray-200 dark:border-gray-800 py-5">
          <p className="text-center text-sm text-gray-400 dark:text-gray-600">
            نظام إدارة الدروس الخصوصية — جميع الحقوق محفوظة © {now.getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  )
}
