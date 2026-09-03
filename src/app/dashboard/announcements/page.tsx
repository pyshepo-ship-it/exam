"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import {
  Megaphone,
  Trophy,
  FileDown,
  Link2,
  Plus,
  Edit2,
  Trash2,
  Pin,
  PinOff,
  Download,
  ExternalLink,
  Upload,
  Home,
  UserPlus,
  X,
  CalendarClock,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { SchedulePublishDialog } from "@/components/schedule-publish-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Announcement,
  Honoree,
  SharedFile,
  ImportantLink,
  getAllGroups,
  getGroupsOfGrade,
  getGrades,
  getStudents,
  getAnnouncements,
  saveAnnouncements,
  getHonorees,
  saveHonorees,
  getSharedFiles,
  saveSharedFiles,
  getImportantLinks,
  saveImportantLinks,
  isHonoreeActive,
} from "@/lib/data-storage"

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]

type TabKey = "announcements" | "honorees" | "files" | "links"

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "announcements", label: "الإعلانات", icon: Megaphone },
  { key: "honorees", label: "لوحة الشرف", icon: Trophy },
  { key: "files", label: "ملفات للتحميل", icon: FileDown },
  { key: "links", label: "روابط مهمة", icon: Link2 },
]

// الحد الأقصى لحجم الملف المرفوع (2 ميجا) — يُرفع إلى Supabase
const MAX_FILE_SIZE = 2 * 1024 * 1024

export default function AnnouncementsPage() {
  const [tab, setTab] = useState<TabKey>("announcements")
  const [grades, setGrades] = useState<Grade[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [honorees, setHonorees] = useState<Honoree[]>([])
  const [files, setFiles] = useState<SharedFile[]>([])
  const [links, setLinks] = useState<ImportantLink[]>([])

  // ---- Dialogs ----
  const [announcementDialogOpen, setAnnouncementDialogOpen] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null)
  const [announcementForm, setAnnouncementForm] = useState({ title: "", body: "", targetGradeIds: [] as string[] })

  const [honorDialogOpen, setHonorDialogOpen] = useState(false)
  const [honorForm, setHonorForm] = useState({
    gradeId: "",
    groupId: "",
    studentId: "",
    studentName: "",
    reason: "متميز في امتحانات هذا الشهر",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    days: 30,
  })

  const [fileDialogOpen, setFileDialogOpen] = useState(false)
  const [fileForm, setFileForm] = useState({
    name: "",
    description: "",
    source: "upload" as "upload" | "link",
    url: "",
    dataUrl: "",
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkForm, setLinkForm] = useState({ title: "", url: "" })

  // نشر جدول المجموعات للطلاب (الصفحة الرئيسية + إعلان)
  const [schedulePublishOpen, setSchedulePublishOpen] = useState(false)

  const refreshScheduleData = () => {
    setGrades(getGrades())
    setAnnouncements(getAnnouncements())
  }

  // Load data
  useEffect(() => {
    setGrades(getGrades())
    setStudents(getStudents())
    setAnnouncements(getAnnouncements())
    setHonorees(getHonorees())
    setFiles(getSharedFiles())
    setLinks(getImportantLinks())
  }, [])

  const allGroups = getAllGroups(grades)
  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()

  // حفظ إلى Supabase (ذاكرة الجلسة للعرض الفوري)
  const trySave = (fn: () => void): boolean => {
    try {
      fn()
      return true
    } catch {
      toast.error("تعذر حفظ الملف — قلّل حجمه أو تحقق من اتصال Supabase ثم حاول مرة أخرى.")
      return false
    }
  }

  // ============ الإعلانات ============
  const openAnnouncementDialog = (a?: Announcement) => {
    if (a) {
      setEditingAnnouncement(a)
      setAnnouncementForm({ title: a.title, body: a.body, targetGradeIds: a.targetGradeIds || [] })
    } else {
      setEditingAnnouncement(null)
      setAnnouncementForm({ title: "", body: "", targetGradeIds: [] })
    }
    setAnnouncementDialogOpen(true)
  }

  const saveAnnouncement = () => {
    if (!announcementForm.title.trim() || !announcementForm.body.trim()) {
      toast.error("يرجى إدخال العنوان والمحتوى")
      return
    }
    let updated: Announcement[]
    if (editingAnnouncement) {
      updated = announcements.map(a =>
        a.id === editingAnnouncement.id
          ? { ...a, title: announcementForm.title.trim(), body: announcementForm.body.trim(), targetGradeIds: announcementForm.targetGradeIds }
          : a
      )
      toast.success("تم تحديث الإعلان بنجاح")
    } else {
      updated = [
        ...announcements,
        {
          id: Date.now().toString(),
          title: announcementForm.title.trim(),
          body: announcementForm.body.trim(),
          targetGradeIds: announcementForm.targetGradeIds,
          pinned: false,
          createdAt: new Date().toISOString(),
        },
      ]
      toast.success("تم إضافة الإعلان بنجاح")
    }
    setAnnouncements(updated)
    if (trySave(() => saveAnnouncements(updated))) setAnnouncementDialogOpen(false)
  }

  const togglePin = (a: Announcement) => {
    const updated = announcements.map(x => (x.id === a.id ? { ...x, pinned: !x.pinned } : x))
    setAnnouncements(updated)
    trySave(() => saveAnnouncements(updated))
  }

  const deleteAnnouncement = (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الإعلان؟")) return
    const updated = announcements.filter(a => a.id !== id)
    setAnnouncements(updated)
    trySave(() => saveAnnouncements(updated))
    toast.success("تم حذف الإعلان")
  }

  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  // ============ لوحة الشرف ============
  const groupStudents = allGroups
    .filter(g => g.id === honorForm.groupId)
    .flatMap(g => students.filter(s => s.groupId === g.id))

  const openHonorDialog = () => {
    setHonorForm({
      gradeId: "",
      groupId: "",
      studentId: "",
      studentName: "",
      reason: "متميز في امتحانات هذا الشهر",
      month: currentMonth,
      year: currentYear,
      days: 30,
    })
    setHonorDialogOpen(true)
  }

  const pickStudent = (studentId: string) => {
    const student = students.find(s => s.id === studentId)
    setHonorForm(prev => ({
      ...prev,
      studentId,
      studentName: student ? student.name : prev.studentName,
    }))
  }

  const saveHonoree = () => {
    if (!honorForm.groupId) {
      toast.error("يرجى اختيار المجموعة")
      return
    }
    if (!honorForm.studentName.trim()) {
      toast.error("يرجى إدخال اسم الطالب")
      return
    }
    if (!honorForm.reason.trim()) {
      toast.error("يرجى إدخال سبب التميز")
      return
    }
    const updated = [
      ...honorees,
      {
        id: Date.now().toString(),
        studentId: honorForm.studentId || undefined,
        studentName: honorForm.studentName.trim(),
        groupId: honorForm.groupId,
        reason: honorForm.reason.trim(),
        month: honorForm.month,
        year: honorForm.year,
        days: honorForm.days > 0 ? honorForm.days : undefined,
        createdAt: new Date().toISOString(),
      },
    ]
    setHonorees(updated)
    if (trySave(() => saveHonorees(updated))) {
      setHonorDialogOpen(false)
      toast.success("تم إضافة الطالب إلى لوحة الشرف")
    }
  }

  const deleteHonoree = (id: string) => {
    if (!confirm("هل تريد إزالة هذا الطالب من لوحة الشرف؟")) return
    const updated = honorees.filter(h => h.id !== id)
    setHonorees(updated)
    trySave(() => saveHonorees(updated))
    toast.success("تمت الإزالة من لوحة الشرف")
  }

  // تجميع المدعوين حسب المجموعة
  const honoreesByGroup = allGroups
    .map(group => ({
      group,
      items: honorees
        .filter(h => h.groupId === group.id)
        .sort((a, b) => b.year - a.year || b.month - a.month),
    }))
    .filter(entry => entry.items.length > 0)

  // ============ الملفات ============
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      toast.error("حجم الملف أكبر من 2 ميجا بايت. استخدم رابطاً خارجياً للملفات الكبيرة.")
      e.target.value = ""
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      setFileForm(prev => ({ ...prev, name: file.name, dataUrl: ev.target?.result as string }))
    }
    reader.readAsDataURL(file)
  }

  const openFileDialog = () => {
    setFileForm({ name: "", description: "", source: "upload", url: "", dataUrl: "" })
    if (fileInputRef.current) fileInputRef.current.value = ""
    setFileDialogOpen(true)
  }

  const saveFile = () => {
    if (fileForm.source === "upload") {
      if (!fileForm.dataUrl) {
        toast.error("يرجى اختيار ملف")
        return
      }
    } else {
      if (!fileForm.name.trim() || !fileForm.url.trim()) {
        toast.error("يرجى إدخال اسم الملف والرابط")
        return
      }
    }
    let url = fileForm.url.trim()
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`

    const updated = [
      ...files,
      {
        id: Date.now().toString(),
        name: fileForm.name,
        description: fileForm.description.trim() || undefined,
        source: fileForm.source,
        dataUrl: fileForm.source === "upload" ? fileForm.dataUrl : undefined,
        url: fileForm.source === "link" ? url : undefined,
        addedAt: new Date().toISOString(),
      },
    ]
    setFiles(updated)
    if (trySave(() => saveSharedFiles(updated))) {
      setFileDialogOpen(false)
      toast.success("تمت إضافة الملف")
    }
  }

  const deleteFile = (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الملف؟")) return
    const updated = files.filter(f => f.id !== id)
    setFiles(updated)
    trySave(() => saveSharedFiles(updated))
    toast.success("تم حذف الملف")
  }

  // ============ الروابط ============
  const openLinkDialog = () => {
    setLinkForm({ title: "", url: "" })
    setLinkDialogOpen(true)
  }

  const saveLink = () => {
    if (!linkForm.title.trim() || !linkForm.url.trim()) {
      toast.error("يرجى إدخال عنوان الرابط ورابطه")
      return
    }
    let url = linkForm.url.trim()
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`

    const updated = [
      ...links,
      {
        id: Date.now().toString(),
        title: linkForm.title.trim(),
        url,
        addedAt: new Date().toISOString(),
      },
    ]
    setLinks(updated)
    if (trySave(() => saveImportantLinks(updated))) {
      setLinkDialogOpen(false)
      toast.success("تمت إضافة الرابط")
    }
  }

  const deleteLink = (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الرابط؟")) return
    const updated = links.filter(l => l.id !== id)
    setLinks(updated)
    trySave(() => saveImportantLinks(updated))
    toast.success("تم حذف الرابط")
  }

  const getGroupLabel = (groupId: string) => {
    const g = allGroups.find(x => x.id === groupId)
    return g ? `${g.gradeName} - ${g.name}` : "غير محدد"
  }

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
            الإعلانات ولوحة الشرف
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            يظهر كل ما تضيفه هنا مباشرة على الصفحة الرئيسية للموقع
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setSchedulePublishOpen(true)}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg"
          >
            <CalendarClock className="w-4 h-4" />
            <span>نشر جدول المجموعات للطلاب</span>
          </Button>
          <Link href="/">
            <Button variant="outline" className="border-indigo-500 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950">
              <Home className="w-4 h-4" />
              <span>عرض الصفحة الرئيسية</span>
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all ${
              tab === key
                ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg"
                : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </div>

      {/* ============ Tab: Announcements ============ */}
      {tab === "announcements" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => openAnnouncementDialog()}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg"
            >
              <Plus className="w-4 h-4" />
              <span>إعلان جديد</span>
            </Button>
          </div>

          {sortedAnnouncements.length === 0 ? (
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
              <CardContent className="py-12 text-center">
                <Megaphone className="w-14 h-14 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                <p className="text-gray-500 dark:text-gray-400">لا توجد إعلانات بعد</p>
              </CardContent>
            </Card>
          ) : (
            sortedAnnouncements.map(a => (
              <Card key={a.id} className={`bg-white dark:bg-gray-900 border ${a.pinned ? "border-amber-400 dark:border-amber-700" : "border-gray-200 dark:border-gray-800"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                        {a.pinned && (
                          <Badge variant="warning" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                            <Pin className="w-3 h-3" />
                            مثبّت
                          </Badge>
                        )}
                        {a.title}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-wrap leading-relaxed">
                        {a.body}
                      </p>
                      <p className="text-xs text-gray-400 mt-3">
                        {new Date(a.createdAt).toLocaleDateString("ar-EG")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => togglePin(a)}
                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                        title={a.pinned ? "إلغاء التثبيت" : "تثبيت في الأعلى"}
                      >
                        {a.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openAnnouncementDialog(a)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteAnnouncement(a.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ============ Tab: Honor Board ============ */}
      {tab === "honorees" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              تُعرض أسماء المتميزين على الصفحة الرئيسية طوال الشهر الذي تحدده، ويمكن إضافة أكثر من
              طالب في نفس المجموعة.
            </p>
            <Button
              onClick={openHonorDialog}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة متميز</span>
            </Button>
          </div>

          {honoreesByGroup.length === 0 ? (
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
              <CardContent className="py-12 text-center">
                <Trophy className="w-14 h-14 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                <p className="text-gray-500 dark:text-gray-400">لا يوجد متميزون بعد</p>
              </CardContent>
            </Card>
          ) : (
            honoreesByGroup.map(({ group, items }) => (
              <Card key={group.id} className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                <CardContent className="p-5">
                  <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    {group.gradeName} - {group.name}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {items.map(h => {
                      const active = isHonoreeActive(h)
                      return (
                        <div
                          key={h.id}
                          className={`flex items-start justify-between gap-3 rounded-xl p-4 border ${
                            active
                              ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800"
                              : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                          }`}
                        >
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white">{h.studentName}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{h.reason}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <Badge
                                variant={active ? "warning" : "secondary"}
                                className={active ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" : ""}
                              >
                                {active ? "معروض الآن" : `${MONTHS[h.month - 1]} ${h.year}`}
                              </Badge>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteHonoree(h.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ============ Tab: Files ============ */}
      {tab === "files" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ارفع ملفات (حتى 2 ميجا) أو أضف روابط خارجية لتحميلها الطلاب من الصفحة الرئيسية.
            </p>
            <Button
              onClick={openFileDialog}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg"
            >
              <Upload className="w-4 h-4" />
              <span>إضافة ملف</span>
            </Button>
          </div>

          {files.length === 0 ? (
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
              <CardContent className="py-12 text-center">
                <FileDown className="w-14 h-14 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                <p className="text-gray-500 dark:text-gray-400">لا توجد ملفات للتحميل بعد</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {files.map(f => (
                <Card key={f.id} className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                          <FileDown className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white truncate" dir="ltr" style={{ textAlign: "right" }}>
                            {f.name}
                          </p>
                          {f.description && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{f.description}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {f.source === "upload" ? "ملف مرفوع" : "رابط خارجي"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={f.dataUrl || f.url || "#"}
                          download={f.source === "upload" ? f.name : undefined}
                          target={f.source === "link" ? "_blank" : undefined}
                          rel={f.source === "link" ? "noopener noreferrer" : undefined}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                            title="تحميل"
                          >
                            {f.source === "link" ? <ExternalLink className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                          </Button>
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteFile(f.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============ Tab: Links ============ */}
      {tab === "links" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              روابط مهمة للطلاب (منصات، نماذج، صفحات...) تظهر على الصفحة الرئيسية.
            </p>
            <Button
              onClick={openLinkDialog}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة رابط</span>
            </Button>
          </div>

          {links.length === 0 ? (
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
              <CardContent className="py-12 text-center">
                <Link2 className="w-14 h-14 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                <p className="text-gray-500 dark:text-gray-400">لا توجد روابط مهمة بعد</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {links.map(l => (
                <Card key={l.id} className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                          <Link2 className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white">{l.title}</p>
                          <p className="text-sm text-gray-400 truncate" dir="ltr" style={{ textAlign: "right" }}>
                            {l.url}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a href={l.url} target="_blank" rel="noopener noreferrer">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                            title="فتح الرابط"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteLink(l.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============ Dialog: Announcement ============ */}
      <Dialog open={announcementDialogOpen} onOpenChange={setAnnouncementDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAnnouncement ? "تعديل الإعلان" : "إعلان جديد"}</DialogTitle>
            <DialogDescription>سيظهر على الصفحة الرئيسية وفي بوابة كل طالب حسب الصفوف المستهدفة</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>عنوان الإعلان *</Label>
              <Input
                placeholder="مثال: موعد امتحان شهر سبتمبر"
                value={announcementForm.title}
                onChange={e => setAnnouncementForm(prev => ({ ...prev, title: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>محتوى الإعلان *</Label>
              <textarea
                placeholder="اكتب تفاصيل الإعلان هنا..."
                value={announcementForm.body}
                onChange={e => setAnnouncementForm(prev => ({ ...prev, body: e.target.value }))}
                rows={4}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>
            <div>
              <Label>الصفوف المستهدفة</Label>
              <p className="text-xs text-gray-500 mb-2">
                اتركها فارغة ليظهر للجميع (عام) — أو اختر صفاً أو أكثر: سؤال الصف السادس يظهر لطلاب الصف السادس فقط ولا يظهر للباقي بأي شكل
              </p>
              <div className="flex flex-wrap gap-2">
                {grades.map(g => {
                  const active = announcementForm.targetGradeIds.includes(g.id)
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        setAnnouncementForm(prev => ({
                          ...prev,
                          targetGradeIds: active
                            ? prev.targetGradeIds.filter(id => id !== g.id)
                            : [...prev.targetGradeIds, g.id],
                        }))
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                        active
                          ? "bg-indigo-600 text-white shadow"
                          : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {active ? "✓ " : ""}{g.name}
                    </button>
                  )
                })}
                {grades.length === 0 && <p className="text-xs text-amber-600">لا توجد صفوف — أضف صفوفاً أولاً للاستهداف</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnouncementDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={saveAnnouncement}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
            >
              {editingAnnouncement ? "حفظ التعديلات" : "نشر الإعلان"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Dialog: Honor Board ============ */}
      <Dialog open={honorDialogOpen} onOpenChange={setHonorDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إضافة متميز إلى لوحة الشرف</DialogTitle>
            <DialogDescription>
              سيظهر اسم الطالب في لوحة الشرف الخاصة بمجموعته على الصفحة الرئيسية طوال الشهر المحدد
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>الصف *</Label>
              <Select
                value={honorForm.gradeId}
                onValueChange={val =>
                  setHonorForm(prev => ({ ...prev, gradeId: val, groupId: "", studentId: "", studentName: "" }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الصف أولاً" />
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
              <Label>المجموعة *</Label>
              <Select
                value={honorForm.groupId}
                disabled={!honorForm.gradeId}
                onValueChange={val =>
                  setHonorForm(prev => ({ ...prev, groupId: val, studentId: "", studentName: "" }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={honorForm.gradeId ? "اختر المجموعة" : "اختر الصف أولاً"} />
                </SelectTrigger>
                <SelectContent>
                  {!honorForm.gradeId ? (
                    <SelectItem value="__none" disabled>اختر الصف أولاً</SelectItem>
                  ) : getGroupsOfGrade(grades, honorForm.gradeId).length === 0 ? (
                    <SelectItem value="__none" disabled>لا توجد مجموعات في هذا الصف</SelectItem>
                  ) : (
                    getGroupsOfGrade(grades, honorForm.gradeId).map(group => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {honorForm.groupId && (
              <div>
                <Label>اختيار الطالب من قائمة المجموعة</Label>
                {groupStudents.length > 0 ? (
                  <Select value={honorForm.studentId} onValueChange={pickStudent}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="اختر اسم الطالب" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupStudents.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
                    لا يوجد طلاب مسجلون في هذه المجموعة بعد — اكتب الاسم يدوياً في الحقل أدناه
                  </p>
                )}
              </div>
            )}

            <div>
              <Label>اسم الطالب * {honorForm.studentId && <span className="text-xs text-green-600">(مختار من القائمة — يمكنك تعديله)</span>}</Label>
              <Input
                placeholder="أدخل اسم الطالب"
                value={honorForm.studentName}
                onChange={e => setHonorForm(prev => ({ ...prev, studentName: e.target.value, studentId: "" }))}
                className="mt-1"
              />
            </div>

            <div>
              <Label>مدة الظهور في لوحة الشرف (بالأيام)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  min={1}
                  value={honorForm.days || ""}
                  onChange={e => setHonorForm(prev => ({ ...prev, days: parseInt(e.target.value) || 0 }))}
                  className="w-28"
                />
                {[7, 14, 30, 60].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setHonorForm(prev => ({ ...prev, days: d }))}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                      honorForm.days === d
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100"
                    }`}
                  >
                    {d} يوم
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                يظهر اسم الطالب من الآن لمدة {honorForm.days || 0} يوماً في لوحة الشرف ثم يختفي تلقائياً (الافتراضي 30 يوماً).
              </p>
            </div>

            <div>
              <Label>سبب التميز *</Label>
              <Input
                placeholder="مثال: متميز في امتحانات هذا الشهر"
                value={honorForm.reason}
                onChange={e => setHonorForm(prev => ({ ...prev, reason: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الشهر *</Label>
                <Select
                  value={honorForm.month.toString()}
                  onValueChange={val => setHonorForm(prev => ({ ...prev, month: parseInt(val) }))}
                >
                  <SelectTrigger className="mt-1">
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
              </div>
              <div>
                <Label>السنة *</Label>
                <Input
                  type="number"
                  min={2020}
                  max={2100}
                  value={honorForm.year}
                  onChange={e => setHonorForm(prev => ({ ...prev, year: parseInt(e.target.value) || currentYear }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-sm text-amber-800 dark:text-amber-200">
              💡 سيتم عرض الطالب على الصفحة الرئيسية طوال شهر {MONTHS[honorForm.month - 1]}{" "}
              {honorForm.year}، ويمكن حذفه في أي وقت أو إضافة متميزين آخرين لنفس المجموعة.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHonorDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={saveHonoree}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
            >
              <Trophy className="w-4 h-4" />
              <span>إضافة إلى لوحة الشرف</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Dialog: File ============ */}
      <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إضافة ملف للتحميل</DialogTitle>
            <DialogDescription>
              ارفع ملفاً من جهازك (حتى 2 ميجا) أو أضف رابطاً خارجياً للملفات الكبيرة
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>طريقة الإضافة</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setFileForm(prev => ({ ...prev, source: "upload" }))}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    fileForm.source === "upload"
                      ? "bg-amber-500 border-amber-500 text-white"
                      : "border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  رفع ملف
                </button>
                <button
                  type="button"
                  onClick={() => setFileForm(prev => ({ ...prev, source: "link" }))}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    fileForm.source === "link"
                      ? "bg-amber-500 border-amber-500 text-white"
                      : "border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <ExternalLink className="w-4 h-4" />
                  رابط خارجي
                </button>
              </div>
            </div>

            {fileForm.source === "upload" ? (
              <div>
                <Label>الملف</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 w-full border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-6 text-center hover:border-amber-400 transition-colors"
                >
                  {fileForm.dataUrl ? (
                    <span className="flex items-center justify-center gap-2 text-amber-600 font-medium">
                      <X className="w-4 h-4" />
                      تغيير الملف: <span dir="ltr">{fileForm.name}</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
                      <Upload className="w-5 h-5" />
                      اضغط هنا لاختيار الملف (PDF, DOCX, JPG... حتى 2 ميجا)
                    </span>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>اسم الملف / العنوان *</Label>
                  <Input
                    placeholder="مثال: نموذج امتحان ترم أول"
                    value={fileForm.name}
                    onChange={e => setFileForm(prev => ({ ...prev, name: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>رابط الملف (URL) *</Label>
                  <Input
                    placeholder="https://..."
                    value={fileForm.url}
                    onChange={e => setFileForm(prev => ({ ...prev, url: e.target.value }))}
                    className="mt-1"
                    dir="ltr"
                  />
                </div>
              </div>
            )}

            <div>
              <Label>وصف (اختياري)</Label>
              <Input
                placeholder="مثال: حل أسئلة الوحدة الأولى"
                value={fileForm.description}
                onChange={e => setFileForm(prev => ({ ...prev, description: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={saveFile}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة الملف</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Dialog: Link ============ */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إضافة رابط مهم</DialogTitle>
            <DialogDescription>سيظهر هذا الرابط للطلاب على الصفحة الرئيسية</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>عنوان الرابط *</Label>
              <Input
                placeholder="مثال: منصة بنك الأسئلة"
                value={linkForm.title}
                onChange={e => setLinkForm(prev => ({ ...prev, title: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>الرابط (URL) *</Label>
              <Input
                placeholder="https://example.com"
                value={linkForm.url}
                onChange={e => setLinkForm(prev => ({ ...prev, url: e.target.value }))}
                className="mt-1"
                dir="ltr"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={saveLink}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة الرابط</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* حوار نشر جدول المجموعات للطلاب (الصفحة الرئيسية + الإعلانات) */}
      <SchedulePublishDialog
        open={schedulePublishOpen}
        onOpenChange={setSchedulePublishOpen}
        grades={grades}
        onChanged={refreshScheduleData}
      />
    </div>
  )
}
